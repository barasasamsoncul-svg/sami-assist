import { NextResponse } from "next/server";

import { authenticateRunner } from "@/apps/runner/server/auth";
import {
  databasePool,
  query,
} from "@/apps/runner/server/db";
import {
  errorResponse,
  isRecord,
} from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OnboardingProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  account_status: string;
  verification_status: string;
  service_area: string | null;
  vehicle_type: string | null;
  vehicle_registration: string | null;
};

type RequirementRow = {
  requirement_key: string;
  category_key: string | null;
  vehicle_type: string;
  document_type: string;
  title: string;
  instructions: string | null;
  is_required: boolean;
};

type DocumentRow = {
  id: string;
  document_type: string;
  category_key: string | null;
  requirement_key: string | null;
  review_status: string;
  rejection_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

const VEHICLE_TYPES = new Set([
  "motorcycle",
  "bicycle",
  "car",
  "van",
  "other",
]);

function onboardingState(status: string) {
  switch (status) {
    case "approved":
      return "approved";
    case "submitted":
      return "pending_review";
    case "rejected":
      return "changes_required";
    default:
      return "incomplete";
  }
}

function response(
  body: Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
    },
  });
}

/**
 * GET /api/runner/me/onboarding
 *
 * Returns the authenticated Runner's category selections,
 * vehicle information, dynamic document requirements and
 * uploaded document review results.
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticateRunner(request, {
      allowRestricted: true,
    });

    if (auth.response) {
      return auth.response;
    }

    const profileResult = await query<OnboardingProfile>(
      `SELECT
         a.id,
         a.full_name,
         a.email,
         a.account_status,
         a.verification_status,
         p.service_area,
         p.vehicle_type,
         p.vehicle_registration
       FROM public.runner_accounts AS a
       LEFT JOIN public.runner_profiles AS p
         ON p.runner_id = a.id
       WHERE a.id = $1
       LIMIT 1`,
      [auth.runner.id],
    );

    const profile = profileResult.rows[0];

    if (!profile) {
      return errorResponse("Runner account not found.", 404);
    }

    const categoriesResult = await query<{
      category_key: string;
    }>(
      `SELECT category_key
       FROM public.runner_account_service_categories
       WHERE runner_id = $1
       ORDER BY category_key`,
      [auth.runner.id],
    );

    const categories = categoriesResult.rows.map(
      (row) => row.category_key,
    );

    const requirementsResult =
      await query<RequirementRow>(
        `SELECT
           requirement_key,
           category_key,
           vehicle_type,
           document_type,
           title,
           instructions,
           is_required
         FROM public.runner_onboarding_document_requirements
         WHERE is_active = true
           AND (
             category_key IS NULL
             OR category_key = ANY($1::text[])
           )
           AND (
             vehicle_type = 'any'
             OR vehicle_type = $2
           )
         ORDER BY
           is_required DESC,
           category_key NULLS FIRST,
           requirement_key`,
        [
          categories,
          profile.vehicle_type,
        ],
      );

    const documentsResult = await query<DocumentRow>(
      `SELECT
         id,
         document_type,
         category_key,
         requirement_key,
         review_status,
         rejection_reason,
         submitted_at,
         reviewed_at
       FROM public.runner_verification_documents
       WHERE runner_id = $1
       ORDER BY submitted_at DESC, id DESC`,
      [auth.runner.id],
    );

    const requirements = requirementsResult.rows.map(
      (item) => ({
        key: item.requirement_key,
        categoryKey: item.category_key,
        vehicleType: item.vehicle_type,
        documentType: item.document_type,
        title: item.title,
        instructions: item.instructions,
        required: item.is_required,
      }),
    );

    const documents = documentsResult.rows.map(
      (item) => ({
        id: item.id,
        documentType: item.document_type,
        categoryKey: item.category_key,
        requirementKey: item.requirement_key,
        reviewStatus: item.review_status,
        rejectionReason: item.rejection_reason,
        submittedAt: item.submitted_at,
        reviewedAt: item.reviewed_at,
      }),
    );

    return response({
      ok: true,
      onboardingStatus: onboardingState(
        profile.verification_status,
      ),
      runner: {
        id: profile.id,
        fullName: profile.full_name,
        email: profile.email,
        accountStatus: profile.account_status,
        verificationStatus: profile.verification_status,
        serviceArea: profile.service_area,
        vehicleType: profile.vehicle_type,
        vehicleRegistration: profile.vehicle_registration,
        selectedCategories: categories,
      },
      requirements,
      documents,
    });
  } catch (cause) {
    console.error(
      "[SaMi Runner onboarding] Read failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Your onboarding information could not be loaded.",
      503,
    );
  }
}

/**
 * PUT /api/runner/me/onboarding
 *
 * Saves service-area and transport details.
 *
 * Changes are allowed during initial onboarding and after
 * a rejection, but not while Operations is reviewing the
 * application or after it has been approved.
 */
export async function PUT(request: Request) {
  const auth = await authenticateRunner(request);

  if (auth.response) {
    return auth.response;
  }

  const body: unknown = await request.json().catch(
    () => null,
  );

  if (
    !isRecord(body) ||
    typeof body.serviceArea !== "string" ||
    typeof body.vehicleType !== "string"
  ) {
    return errorResponse(
      "Enter your service area and choose your transport type.",
    );
  }

  const serviceArea = body.serviceArea
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);

  const vehicleType = body.vehicleType
    .trim()
    .toLowerCase();

  const vehicleRegistration =
    typeof body.vehicleRegistration === "string"
      ? body.vehicleRegistration
          .trim()
          .toUpperCase()
          .replace(/\s+/g, " ")
          .slice(0, 30)
      : "";

  if (serviceArea.length < 2) {
    return errorResponse(
      "Enter a valid main service area.",
    );
  }

  if (!VEHICLE_TYPES.has(vehicleType)) {
    return errorResponse(
      "Choose a valid transport type.",
    );
  }

  if (
    ["motorcycle", "car", "van"].includes(vehicleType) &&
    vehicleRegistration.length < 3
  ) {
    return errorResponse(
      "Enter the registration number of your vehicle.",
    );
  }

  const client = await databasePool().connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // Serialize transport changes against document uploads
    // and Admin decisions using the Runner account row.
    const accountResult = await client.query<{
      account_status: string;
      verification_status: string;
    }>(
      `SELECT
         account_status,
         verification_status
       FROM public.runner_accounts
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [auth.runner.id],
    );

    const account = accountResult.rows[0];

    if (!account) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return errorResponse(
        "Runner account not found.",
        404,
      );
    }

    if (
      ["suspended", "closed"].includes(
        account.account_status,
      )
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return errorResponse(
        "This Runner account cannot be updated.",
        403,
      );
    }

    if (
      ["submitted", "approved"].includes(
        account.verification_status,
      )
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return errorResponse(
        "Your transport details cannot be changed while your application is under review or after approval.",
        409,
      );
    }

    const result = await client.query<{
      runner_id: string;
    }>(
      `INSERT INTO public.runner_profiles (
         runner_id,
         service_area,
         vehicle_type,
         vehicle_registration,
         updated_at
       )
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (runner_id)
       DO UPDATE SET
         service_area = EXCLUDED.service_area,
         vehicle_type = EXCLUDED.vehicle_type,
         vehicle_registration = EXCLUDED.vehicle_registration,
         updated_at = now()
       RETURNING runner_id`,
      [
        auth.runner.id,
        serviceArea,
        vehicleType,
        vehicleRegistration || null,
      ],
    );

    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return errorResponse(
        "Your transport details could not be saved.",
        503,
      );
    }

    const categoriesResult = await client.query<{
      category_key: string;
    }>(
      `SELECT category_key
       FROM public.runner_account_service_categories
       WHERE runner_id = $1`,
      [auth.runner.id],
    );

    const categories = categoriesResult.rows.map(
      (row) => row.category_key,
    );

    const requirementsResult =
      await client.query<RequirementRow>(
        `SELECT
           requirement_key,
           category_key,
           vehicle_type,
           document_type,
           title,
           instructions,
           is_required
         FROM public.runner_onboarding_document_requirements
         WHERE is_active = true
           AND (
             category_key IS NULL
             OR category_key = ANY($1::text[])
           )
           AND (
             vehicle_type = 'any'
             OR vehicle_type = $2
           )
         ORDER BY
           is_required DESC,
           category_key NULLS FIRST,
           requirement_key`,
        [
          categories,
          vehicleType,
        ],
      );

    await client.query("COMMIT");
    transactionStarted = false;

    return response({
      ok: true,
      message: "Your transport details have been saved.",
      requirements: requirementsResult.rows.map(
        (item) => ({
          key: item.requirement_key,
          categoryKey: item.category_key,
          vehicleType: item.vehicle_type,
          documentType: item.document_type,
          title: item.title,
          instructions: item.instructions,
          required: item.is_required,
        }),
      ),
    });
  } catch (cause) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(
        () => undefined,
      );
    }

    console.error(
      "[SaMi Runner onboarding] Profile update failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Your transport details could not be saved.",
      503,
    );
  } finally {
    client.release();
  }
}

/**
 * POST /api/runner/me/onboarding
 *
 * Submits a completed application for Operations review.
 *
 * The Runner account is locked before checking the profile
 * and latest document records. This serializes submission
 * against document uploads and Admin review transactions.
 *
 * Every active required document must have a latest
 * pending or approved document record.
 */
export async function POST(request: Request) {
  const auth = await authenticateRunner(request);

  if (auth.response) {
    return auth.response;
  }

  const client = await databasePool().connect();

  try {
    await client.query("BEGIN");

    // Serialize submission with Runner document uploads
    // and Admin review decisions.
    const accountResult = await client.query<{
      account_status: string;
      verification_status: string;
    }>(
      `SELECT
         account_status,
         verification_status
       FROM public.runner_accounts
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [auth.runner.id],
    );

    const account = accountResult.rows[0];

    if (!account) {
      await client.query("ROLLBACK");

      return errorResponse(
        "Runner account not found.",
        404,
      );
    }

    if (
      ["suspended", "closed"].includes(
        account.account_status,
      )
    ) {
      await client.query("ROLLBACK");

      return errorResponse(
        "This Runner account cannot submit an application.",
        403,
      );
    }

    if (account.verification_status === "approved") {
      await client.query("ROLLBACK");

      return errorResponse(
        "Your Runner application has already been approved.",
        409,
      );
    }

    const profileResult =
      await client.query<{
        service_area: string | null;
        vehicle_type: string | null;
        vehicle_registration: string | null;
      }>(
        `SELECT
           service_area,
           vehicle_type,
           vehicle_registration
         FROM public.runner_profiles
         WHERE runner_id = $1
         LIMIT 1
         FOR UPDATE`,
        [auth.runner.id],
      );

    const profile = profileResult.rows[0];

    if (
      !profile ||
      !profile.service_area ||
      !profile.vehicle_type
    ) {
      await client.query("ROLLBACK");

      return errorResponse(
        "Complete your service area and transport details first.",
        409,
      );
    }

    if (
      ["motorcycle", "car", "van"].includes(
        profile.vehicle_type,
      ) &&
      !profile.vehicle_registration
    ) {
      await client.query("ROLLBACK");

      return errorResponse(
        "Add your vehicle registration number before submitting.",
        409,
      );
    }

    const categoriesResult =
      await client.query<{ category_key: string }>(
        `SELECT category_key
         FROM public.runner_account_service_categories
         WHERE runner_id = $1`,
        [auth.runner.id],
      );

    const categories = categoriesResult.rows.map(
      (row) => row.category_key,
    );

    if (categories.length === 0) {
      await client.query("ROLLBACK");

      return errorResponse(
        "Select at least one task category before submitting.",
        409,
      );
    }

    const missingResult =
      await client.query<{
        requirement_key: string;
        title: string;
      }>(
        `SELECT
           r.requirement_key,
           r.title
         FROM public.runner_onboarding_document_requirements AS r
         WHERE r.is_active = true
           AND r.is_required = true
           AND (
             r.category_key IS NULL
             OR r.category_key = ANY($1::text[])
           )
           AND (
             r.vehicle_type = 'any'
             OR r.vehicle_type = $2
           )
           AND NOT COALESCE(
             (
               SELECT d.review_status IN ('pending', 'approved')
               FROM public.runner_verification_documents AS d
               WHERE d.runner_id = $3
                 AND d.requirement_key = r.requirement_key
               ORDER BY d.submitted_at DESC, d.id DESC
               LIMIT 1
             ),
             false
           )
         ORDER BY r.requirement_key`,
        [
          categories,
          profile.vehicle_type,
          auth.runner.id,
        ],
      );

    if (missingResult.rows.length > 0) {
      await client.query("ROLLBACK");

      return response(
        {
          error:
            "Upload all required documents before submitting your application.",
          missingRequirements: missingResult.rows.map(
            (item) => ({
              key: item.requirement_key,
              title: item.title,
            }),
          ),
        },
        409,
      );
    }

    const submitted = await client.query<{
      verification_status: string;
      account_status: string;
    }>(
      `UPDATE public.runner_accounts
       SET
         verification_status = 'submitted',
         account_status = 'pending_verification',
         updated_at = now()
       WHERE id = $1
         AND verification_status <> 'approved'
         AND account_status NOT IN ('suspended', 'closed')
       RETURNING
         verification_status,
         account_status`,
      [auth.runner.id],
    );

    if (!submitted.rows[0]) {
      await client.query("ROLLBACK");

      return errorResponse(
        "Your application could not be submitted. Refresh your account status and try again.",
        409,
      );
    }

    await client.query("COMMIT");

    return response({
      ok: true,
      message:
        "Your Runner application has been submitted for Operations review.",
      onboardingStatus: "pending_review",
      runner: {
        accountStatus: submitted.rows[0].account_status,
        verificationStatus: submitted.rows[0].verification_status,
      },
    });
  } catch (cause) {
    await client.query("ROLLBACK").catch(
      () => undefined,
    );

    console.error(
      "[SaMi Runner onboarding] Submission failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Your application could not be submitted. Please try again.",
      503,
    );
  } finally {
    client.release();
  }
}