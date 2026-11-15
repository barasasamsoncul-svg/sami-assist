
import { NextResponse } from "next/server";

import { authenticateRunner } from "@/apps/runner/server/auth";
import { resolveRunnerCompliance } from "@/apps/runner/server/compliance";
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
  vehicle_model: string | null;
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

type RunnerVehicleType = "bike" | "motorbike" | "vehicle";

type StoredVehicleType = "bicycle" | "motorcycle" | "car";

const VALID_RUNNER_SERVICES = new Set([
  "pickup_deliver",
  "shop_deliver",
]);

const MOTORBIKE_REGISTRATION_PATTERN =
  /^KM[A-HJ-NP-Z]{2}[0-9]{3}$/;

const VEHICLE_REGISTRATION_PATTERN =
  /^K[A-HJ-NP-Z]{2}[0-9]{3}[A-HJ-NP-Z]$/;

/* -------------------------------------------------------------------------- */
/* VEHICLE NORMALIZATION                                                      */
/* -------------------------------------------------------------------------- */

function normalizeVehicleType(
  value: string | null | undefined,
): RunnerVehicleType | null {
  switch (value?.trim().toLowerCase()) {
    case "bike":
    case "bicycle":
      return "bike";

    case "motorbike":
    case "motorcycle":
      return "motorbike";

    case "vehicle":
    case "car":
    case "van":
    case "other":
      return "vehicle";

    default:
      return null;
  }
}

function toStoredVehicleType(
  value: RunnerVehicleType,
): StoredVehicleType {
  switch (value) {
    case "bike":
      return "bicycle";

    case "motorbike":
      return "motorcycle";

    case "vehicle":
      return "car";
  }
}

/**
 * Remove spaces and punctuation so different presentations
 * of the same registration normalize to the same value.
 *
 * Example:
 * KDA 123A -> KDA123A
 * KDA-123A -> KDA123A
 */
function compactKenyanRegistration(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Store the registration consistently:
 *
 * Motorcycle: KMAB 123
 * Vehicle:    KDA 123A
 */
function normalizeKenyanRegistration(
  value: string,
  vehicleType: RunnerVehicleType,
): string {
  const compact = compactKenyanRegistration(value);

  if (vehicleType === "motorbike") {
    return compact.length > 4
      ? `${compact.slice(0, 4)} ${compact.slice(4)}`
      : compact;
  }

  if (vehicleType === "vehicle") {
    return compact.length > 3
      ? `${compact.slice(0, 3)} ${compact.slice(3)}`
      : compact;
  }

  return "";
}

/**
 * Validate the ordinary Kenyan registration formats used
 * by the Runner onboarding flow.
 *
 * Motorcycle:
 * KM + two letters + three digits.
 *
 * Ordinary motor vehicle:
 * K + two letters + three digits + final letter.
 */
function isValidKenyanRegistration(
  value: string,
  vehicleType: RunnerVehicleType,
): boolean {
  const compact = compactKenyanRegistration(value);

  if (vehicleType === "motorbike") {
    return MOTORBIKE_REGISTRATION_PATTERN.test(compact);
  }

  if (vehicleType === "vehicle") {
    return VEHICLE_REGISTRATION_PATTERN.test(compact);
  }

  return true;
}

function registrationValidationMessage(
  vehicleType: RunnerVehicleType,
): string {
  return vehicleType === "motorbike"
    ? "Enter a valid Kenyan motorcycle registration number, for example KMAB 123."
    : "Enter a valid Kenyan vehicle registration number, for example KDA 123A.";
}

function isVehicleRegistrationUniqueViolation(
  cause: unknown,
): boolean {
  if (
    cause === null ||
    typeof cause !== "object"
  ) {
    return false;
  }

  const databaseError = cause as {
    code?: unknown;
    constraint?: unknown;
  };

  return (
    databaseError.code === "23505" &&
    databaseError.constraint ===
      "runner_profiles_vehicle_registration_normalized_uidx"
  );
}

/* -------------------------------------------------------------------------- */
/* ONBOARDING STATUS                                                          */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* GET /api/runner/me/onboarding                                              */
/* -------------------------------------------------------------------------- */

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
         p.vehicle_model,
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
      return errorResponse(
        "Runner account not found.",
        404,
      );
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
           AND is_required = true
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
           display_order,
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

    /* =====================================================
       CENTRAL COMPLIANCE DECISION

       All required information is read from the database.
       The frontend cannot override this decision.
    ===================================================== */

    const compliance = resolveRunnerCompliance({
      accountStatus: profile.account_status,
      verificationStatus: profile.verification_status,

      fullName: profile.full_name,

      selectedCategories: categories,

      serviceArea: profile.service_area,
      vehicleType: profile.vehicle_type,
      vehicleModel: profile.vehicle_model,
      vehicleRegistration: profile.vehicle_registration,

      requiredDocuments:
        requirementsResult.rows.map((item) => ({
          key: item.requirement_key,
        })),

      uploadedDocuments:
        documentsResult.rows.map((item) => ({
          id: item.id,
          requirementKey: item.requirement_key,
          reviewStatus: item.review_status,
          submittedAt: item.submitted_at,
        })),
    });

    return response({
      ok: true,

      onboardingStatus: onboardingState(
        profile.verification_status,
      ),

      complianceStatus: compliance.status,
      nextStep: compliance.nextStep,
      canSubmit: compliance.canSubmit,
      compliance,

      runner: {
        id: profile.id,
        fullName: profile.full_name,
        email: profile.email,
        accountStatus: profile.account_status,
        verificationStatus: profile.verification_status,
        serviceArea: profile.service_area,
        vehicleType: normalizeVehicleType(
          profile.vehicle_type,
        ),
        vehicleModel: profile.vehicle_model,
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

/* -------------------------------------------------------------------------- */
/* PUT /api/runner/me/onboarding                                              */
/* -------------------------------------------------------------------------- */

/**
 * Saves Runner service area and transport details.
 *
 * A Runner may use:
 * - Bicycle
 * - Motorbike
 * - Vehicle
 *
 * Motorbike and Vehicle applicants must supply:
 * - Vehicle make and model
 * - Valid Kenyan registration number
 *
 * A vehicle registration number may belong to only one
 * Runner account at a time.
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

  const requestedVehicleType = body.vehicleType
    .trim()
    .toLowerCase();

  const vehicleType = normalizeVehicleType(
    requestedVehicleType,
  );

  if (!vehicleType) {
    return errorResponse(
      "Choose Bike, Motorbike or Vehicle as your transport type.",
    );
  }

  const storedVehicleType =
    toStoredVehicleType(vehicleType);

  const vehicleModel =
    typeof body.vehicleModel === "string"
      ? body.vehicleModel
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 120)
      : "";

  const rawVehicleRegistration =
    typeof body.vehicleRegistration === "string"
      ? body.vehicleRegistration
      : "";

  const compactRegistration =
    compactKenyanRegistration(rawVehicleRegistration);

  const vehicleRegistration =
    vehicleType === "bike"
      ? ""
      : normalizeKenyanRegistration(
          compactRegistration,
          vehicleType,
        );

  if (serviceArea.length < 2) {
    return errorResponse(
      "Enter a valid main service area.",
    );
  }

  if (
    vehicleType === "motorbike" ||
    vehicleType === "vehicle"
  ) {
    if (vehicleModel.length < 2) {
      return errorResponse(
        "Enter your vehicle make and model.",
      );
    }

    if (
      !isValidKenyanRegistration(
        compactRegistration,
        vehicleType,
      )
    ) {
      return errorResponse(
        registrationValidationMessage(vehicleType),
      );
    }
  }

  // Bicycle applicants do not need motor-vehicle information.
  const savedVehicleModel =
    vehicleType === "bike"
      ? null
      : vehicleModel;

  const savedVehicleRegistration =
    vehicleType === "bike"
      ? null
      : vehicleRegistration;

  const client = await databasePool().connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // Lock the Runner account while changing transport details.
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

    /*
     * Friendly duplicate check.
     *
     * The normalization expression matches the unique
     * database index added in the next migration.
     *
     * The current Runner is excluded so they can save
     * their existing vehicle registration again.
     */
    if (savedVehicleRegistration) {
      const duplicateResult =
        await client.query<{ runner_id: string }>(
          `SELECT runner_id
           FROM public.runner_profiles
           WHERE regexp_replace(
             upper(btrim(vehicle_registration)),
             '[^A-Z0-9]',
             '',
             'g'
           ) = $1
             AND runner_id <> $2
           LIMIT 1`,
          [
            compactRegistration,
            auth.runner.id,
          ],
        );

      if (duplicateResult.rows.length > 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return errorResponse(
          "This vehicle registration is already registered to another SaMi Runner. Use a different vehicle registration number.",
          409,
        );
      }
    }

    /*
     * Save the profile.
     *
     * The unique expression index is the final protection
     * against simultaneous registration attempts.
     */
    const result = await client.query<{
      runner_id: string;
      service_area: string;
      vehicle_type: string;
      vehicle_model: string | null;
      vehicle_registration: string | null;
    }>(
      `INSERT INTO public.runner_profiles (
         runner_id,
         service_area,
         vehicle_type,
         vehicle_model,
         vehicle_registration,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (runner_id)
       DO UPDATE SET
         service_area = EXCLUDED.service_area,
         vehicle_type = EXCLUDED.vehicle_type,
         vehicle_model = EXCLUDED.vehicle_model,
         vehicle_registration = EXCLUDED.vehicle_registration,
         updated_at = now()
       RETURNING
         runner_id,
         service_area,
         vehicle_type,
         vehicle_model,
         vehicle_registration`,
      [
        auth.runner.id,
        serviceArea,
        storedVehicleType,
        savedVehicleModel,
        savedVehicleRegistration,
      ],
    );

    const savedProfile = result.rows[0];

    if (!savedProfile) {
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
       WHERE runner_id = $1
       ORDER BY category_key`,
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
           AND is_required = true
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
           display_order,
           requirement_key`,
        [
          categories,
          storedVehicleType,
        ],
      );

    await client.query("COMMIT");
    transactionStarted = false;

    return response({
      ok: true,
      message: "Your transport details have been saved.",
      runner: {
        serviceArea: savedProfile.service_area,
        vehicleType: normalizeVehicleType(
          savedProfile.vehicle_type,
        ),
        vehicleModel: savedProfile.vehicle_model,
        vehicleRegistration:
          savedProfile.vehicle_registration,
        selectedCategories: categories,
      },
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

    /*
     * Two Runners may submit the same plate at almost
     * exactly the same time. The database unique index
     * decides which transaction succeeds.
     *
     * Return the same 409 response as the friendly
     * pre-check when the unique index rejects the second.
     */
    if (isVehicleRegistrationUniqueViolation(cause)) {
      return errorResponse(
        "This vehicle registration is already registered to another SaMi Runner. Use a different vehicle registration number.",
        409,
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

/* -------------------------------------------------------------------------- */
/* POST /api/runner/me/onboarding                                             */
/* -------------------------------------------------------------------------- */

/**
 * Submits a completed application for review.
 *
 * The server independently verifies:
 * - Service-area details
 * - Vehicle details
 * - Exactly one selected Runner service
 * - Valid Kenyan vehicle registration where applicable
 * - All mandatory documents
 *
 * The latest document for each requirement must be pending
 * or approved. A rejected document does not satisfy a
 * mandatory requirement.
 */
export async function POST(request: Request) {
  const auth = await authenticateRunner(request);

  if (auth.response) {
    return auth.response;
  }

  const client = await databasePool().connect();

  try {
    await client.query("BEGIN");

    // Serialize submission with Runner document uploads.
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

    if (account.verification_status === "submitted") {
      await client.query("ROLLBACK");

      return errorResponse(
        "Your application is already under review.",
        409,
      );
    }

    const profileResult =
      await client.query<{
        service_area: string | null;
        vehicle_type: string | null;
        vehicle_model: string | null;
        vehicle_registration: string | null;
      }>(
        `SELECT
           service_area,
           vehicle_type,
           vehicle_model,
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

    const normalizedVehicleType = normalizeVehicleType(
      profile.vehicle_type,
    );

    if (!normalizedVehicleType) {
      await client.query("ROLLBACK");

      return errorResponse(
        "Choose a supported transport type before submitting.",
        409,
      );
    }

    if (normalizedVehicleType !== "bike") {
      if (!profile.vehicle_model?.trim()) {
        await client.query("ROLLBACK");

        return errorResponse(
          "Add your vehicle make and model before submitting.",
          409,
        );
      }

      if (!profile.vehicle_registration?.trim()) {
        await client.query("ROLLBACK");

        return errorResponse(
          "Add your vehicle registration number before submitting.",
          409,
        );
      }

      if (
        !isValidKenyanRegistration(
          profile.vehicle_registration,
          normalizedVehicleType,
        )
      ) {
        await client.query("ROLLBACK");

        return errorResponse(
          registrationValidationMessage(
            normalizedVehicleType,
          ),
          409,
        );
      }
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

    /*
     * A Runner must have exactly one supported service.
     * This also protects against legacy or manually modified
     * database records that contain multiple service rows.
     */
    if (
      categories.length !== 1 ||
      !VALID_RUNNER_SERVICES.has(categories[0])
    ) {
      await client.query("ROLLBACK");

      return errorResponse(
        "Select exactly one Runner service: Pick Up & Deliver or Shop & Deliver.",
        409,
      );
    }

    const requiredCountResult = await client.query<{
      total: number;
    }>(
      `SELECT COUNT(*)::int AS total
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
         )`,
      [
        categories,
        profile.vehicle_type,
      ],
    );

    if (
      (requiredCountResult.rows[0]?.total ?? 0) === 0
    ) {
      await client.query("ROLLBACK");

      return errorResponse(
        "No mandatory verification documents are configured for your selected service and transport. Contact SaMi support before submitting.",
        503,
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
         ORDER BY
           r.display_order,
           r.requirement_key`,
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
         AND verification_status <> 'submitted'
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
        "Your Runner application has been submitted for review.",
      onboardingStatus: "pending_review",
      runner: {
        accountStatus:
          submitted.rows[0].account_status,
        verificationStatus:
          submitted.rows[0].verification_status,
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
