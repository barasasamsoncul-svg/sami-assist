import { NextResponse } from "next/server";

import { authenticateRunner } from "@/apps/runner/server/auth";
import { databasePool } from "@/apps/runner/server/db";
import {
  errorResponse,
  isRecord,
} from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RunnerVehicleType = "bike" | "motorbike" | "vehicle";
type StoredVehicleType = "bicycle" | "motorcycle" | "car";

type ExistingProfile = {
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

const VALID_SERVICES = new Set([
  "pickup_deliver",
  "shop_deliver",
]);

const MOTORBIKE_REGISTRATION_PATTERN =
  /^KM[A-HJ-NP-Z]{2}[0-9]{3}$/;

const VEHICLE_REGISTRATION_PATTERN =
  /^K[A-HJ-NP-Z]{2}[0-9]{3}[A-HJ-NP-Z]$/;

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

function normalizeVehicleType(
  value: string,
): RunnerVehicleType | null {
  switch (value.trim().toLowerCase()) {
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

function compactRegistration(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeRegistration(
  value: string,
  vehicleType: RunnerVehicleType,
): string {
  const compact = compactRegistration(value);

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

function isValidRegistration(
  value: string,
  vehicleType: RunnerVehicleType,
): boolean {
  const compact = compactRegistration(value);

  if (vehicleType === "motorbike") {
    return MOTORBIKE_REGISTRATION_PATTERN.test(compact);
  }

  if (vehicleType === "vehicle") {
    return VEHICLE_REGISTRATION_PATTERN.test(compact);
  }

  return true;
}

function isUniqueRegistrationViolation(cause: unknown): boolean {
  if (cause === null || typeof cause !== "object") {
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

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

/* -------------------------------------------------------------------------- */
/* PUT /api/runner/me/onboarding/setup                                         */
/* -------------------------------------------------------------------------- */

/**
 * Saves the Runner's service category and transport profile in one database
 * transaction. The combined write prevents a category update from succeeding
 * while the corresponding vehicle update fails, or vice versa.
 *
 * A submitted application may be changed while Operations is reviewing it.
 * If any service or transport field actually changes, its review is reset to
 * pending and the server recalculates the document requirements. An unchanged
 * save does not restart an existing review. Approved and restricted accounts
 * cannot change their setup through this endpoint.
 */
export async function PUT(request: Request) {
  const auth = await authenticateRunner(request, {
    allowRestricted: true,
  });

  if (auth.response) {
    return auth.response;
  }

  const body: unknown = await request.json().catch(() => null);

  if (
    !isRecord(body) ||
    typeof body.categoryKey !== "string" ||
    typeof body.serviceArea !== "string" ||
    typeof body.vehicleType !== "string"
  ) {
    return errorResponse(
      "Choose one Runner service, enter your service area and select your transport type.",
    );
  }

  const categoryKey = body.categoryKey.trim().toLowerCase();

  if (!VALID_SERVICES.has(categoryKey)) {
    return errorResponse(
      "Choose Pick Up & Deliver or Shop & Deliver.",
    );
  }

  const serviceArea = body.serviceArea
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);

  if (serviceArea.length < 2) {
    return errorResponse("Enter a valid main service area.");
  }

  const vehicleType = normalizeVehicleType(body.vehicleType);

  if (!vehicleType) {
    return errorResponse(
      "Choose Bike, Motorbike or Vehicle as your transport type.",
    );
  }

  const storedVehicleType = toStoredVehicleType(vehicleType);

  const vehicleModel =
    typeof body.vehicleModel === "string"
      ? body.vehicleModel
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 120)
      : "";

  const rawRegistration =
    typeof body.vehicleRegistration === "string"
      ? body.vehicleRegistration
      : "";

  const compactPlate = compactRegistration(rawRegistration);

  if (vehicleType !== "bike") {
    if (vehicleModel.length < 2) {
      return errorResponse(
        "Enter the make and model of your motorbike or vehicle.",
      );
    }

    if (!isValidRegistration(compactPlate, vehicleType)) {
      return errorResponse(
        vehicleType === "motorbike"
          ? "Enter a valid Kenyan motorcycle registration number, for example KMAB 123."
          : "Enter a valid Kenyan vehicle registration number, for example KDA 123A.",
      );
    }
  }

  const savedVehicleModel = vehicleType === "bike" ? null : vehicleModel;
  const savedVehicleRegistration =
    vehicleType === "bike"
      ? null
      : normalizeRegistration(compactPlate, vehicleType);

  const client = await databasePool().connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // Locking the account serializes setup changes with application review,
    // document submission and other account-level state transitions.
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
      return errorResponse("Runner account not found.", 404);
    }

    if (["suspended", "closed"].includes(account.account_status)) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return errorResponse(
        "This Runner account cannot update its setup.",
        403,
      );
    }

    if (account.verification_status === "approved") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return errorResponse(
        "Your Runner application has already been approved. Contact SaMi Operations if your service or vehicle needs to change.",
        409,
      );
    }

    // Only categories from the active Runner service catalogue are accepted.
    const activeCategoryResult = await client.query<{ category_key: string }>(
      `SELECT category_key
       FROM public.runner_service_categories
       WHERE category_key = $1
         AND is_active = true
       LIMIT 1
       FOR SHARE`,
      [categoryKey],
    );

    if (!activeCategoryResult.rows[0]) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return errorResponse(
        "This Runner service is currently unavailable. Refresh the service list and try again.",
        409,
      );
    }

    const [existingProfileResult, existingCategoriesResult] =
      await Promise.all([
        client.query<ExistingProfile>(
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
        ),
        client.query<{ category_key: string }>(
          `SELECT category_key
           FROM public.runner_account_service_categories
           WHERE runner_id = $1
           ORDER BY category_key
           FOR UPDATE`,
          [auth.runner.id],
        ),
      ]);

    const existingProfile = existingProfileResult.rows[0] ?? null;
    const existingCategories = existingCategoriesResult.rows.map(
      (item) => item.category_key,
    );

    const categoryChanged =
      existingCategories.length !== 1 ||
      existingCategories[0] !== categoryKey;

    const profileChanged =
      !existingProfile ||
      normalizeText(existingProfile.service_area) !== serviceArea ||
      normalizeVehicleType(existingProfile.vehicle_type ?? "") !==
        vehicleType ||
      normalizeText(existingProfile.vehicle_model) !==
        normalizeText(savedVehicleModel) ||
      compactRegistration(existingProfile.vehicle_registration ?? "") !==
        compactRegistration(savedVehicleRegistration ?? "");

    const setupChanged = categoryChanged || profileChanged;

    // Friendly duplicate-registration check. The database unique index below
    // remains the final protection against simultaneous registration races.
    if (savedVehicleRegistration) {
      const duplicateResult = await client.query<{ runner_id: string }>(
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
        [compactPlate, auth.runner.id],
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

    // Category and transport data are committed together.
    await client.query(
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
         updated_at = now()`,
      [
        auth.runner.id,
        serviceArea,
        storedVehicleType,
        savedVehicleModel,
        savedVehicleRegistration,
      ],
    );

    if (categoryChanged) {
      await client.query(
        `DELETE FROM public.runner_account_service_categories
         WHERE runner_id = $1`,
        [auth.runner.id],
      );

      await client.query(
        `INSERT INTO public.runner_account_service_categories (
           runner_id,
           category_key,
           selected_at
         )
         VALUES ($1, $2, now())`,
        [auth.runner.id, categoryKey],
      );
    }

    // A submitted application returns to an editable, incomplete state only
    // when the saved service or transport profile actually changes.
    let reviewRestarted = false;

    if (account.verification_status === "submitted" && setupChanged) {
      const resetResult = await client.query(
        `UPDATE public.runner_accounts
         SET
           verification_status = 'pending',
           account_status = 'profile_incomplete',
           verification_reviewed_at = NULL,
           verification_reviewed_by = NULL,
           verification_rejection_reason = NULL,
           updated_at = now()
         WHERE id = $1
           AND verification_status = 'submitted'`,
        [auth.runner.id],
      );

      if ((resetResult.rowCount ?? 0) !== 1) {
        throw new Error(
          "The application review state changed while saving your setup. Refresh and try again.",
        );
      }

      reviewRestarted = true;
    }

    const requirementsResult = await client.query<RequirementRow>(
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
           OR category_key = $1
         )
         AND (
           vehicle_type = 'any'
           OR vehicle_type = $2
         )
       ORDER BY
         category_key NULLS FIRST,
         display_order,
         requirement_key`,
      [categoryKey, storedVehicleType],
    );

    if (requirementsResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return errorResponse(
        "No mandatory documents are configured for this service and vehicle. Contact SaMi Operations before continuing.",
        503,
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;

    return response({
      ok: true,
      message: reviewRestarted
        ? "Your setup has been updated. Your previous review has been restarted and your document checklist has been recalculated."
        : "Your Runner service and transport details have been saved.",
      reviewRestarted,
      onboardingStatus: reviewRestarted
        ? "incomplete"
        : account.verification_status === "submitted"
          ? "pending_review"
          : account.verification_status === "rejected"
            ? "changes_required"
            : "incomplete",
      runner: {
        serviceArea,
        vehicleType,
        vehicleModel: savedVehicleModel,
        vehicleRegistration: savedVehicleRegistration,
        selectedCategories: [categoryKey],
      },
      requirements: requirementsResult.rows.map((item) => ({
        key: item.requirement_key,
        categoryKey: item.category_key,
        vehicleType: item.vehicle_type,
        documentType: item.document_type,
        title: item.title,
        instructions: item.instructions,
        required: item.is_required,
      })),
    });
  } catch (cause) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => undefined);
    }

    if (isUniqueRegistrationViolation(cause)) {
      return errorResponse(
        "This vehicle registration is already registered to another SaMi Runner. Use a different vehicle registration number.",
        409,
      );
    }

    console.error(
      "[SaMi Runner onboarding setup] Save failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );

    return errorResponse(
      cause instanceof Error &&
        cause.message.includes("review state changed")
        ? cause.message
        : "Your Runner service and transport details could not be saved. Please try again.",
      503,
    );
  } finally {
    client.release();
  }
}
