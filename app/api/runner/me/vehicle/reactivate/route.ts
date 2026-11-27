
import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { authenticateRunner } from "@/apps/runner/server/auth";
import { databasePool } from "@/apps/runner/server/db";
import { errorResponse } from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VehicleRow = {
  id: string;
  vehicle_type: string;
  vehicle_model: string | null;
  vehicle_registration: string | null;
  status: string;
  is_active: boolean;
};

type VehicleRequirementRow = {
  requirement_key: string;
  title: string;
  is_required: boolean;
  requires_expiry: boolean;
};

type VehicleDocumentRow = {
  requirement_key: string | null;
  review_status: string;
  valid_until: string | null;
};

type ActiveJobRow = {
  id: string;
  status: string;
};

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

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function todayInNairobi(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function isCurrentExpiryDate(
  value: string | null,
): boolean {
  return Boolean(
    value && value >= todayInNairobi(),
  );
}

export async function POST(request: Request) {
  const auth = await authenticateRunner(request);

  if (auth.response) {
    return auth.response;
  }

  if (
    ["suspended", "closed"].includes(
      auth.runner.account_status,
    )
  ) {
    return errorResponse(
      "This Runner account cannot reactivate a vehicle.",
      403,
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse(
      "Your vehicle selection could not be read.",
    );
  }

  if (
    !isRecord(body) ||
    typeof body.vehicleId !== "string" ||
    !isValidUuid(body.vehicleId)
  ) {
    return errorResponse(
      "Select a valid saved vehicle to reactivate.",
    );
  }

  const vehicleId = body.vehicleId;

  let client: PoolClient | null = null;
  let transactionStarted = false;

  try {
    client = await databasePool().connect();

    await client.query("BEGIN");
    transactionStarted = true;

    // Lock the Runner account so simultaneous vehicle operations
    // cannot independently change the active vehicle.
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
        "This Runner account cannot reactivate a vehicle.",
        403,
      );
    }

    if (
      account.account_status !== "active" ||
      account.verification_status !== "approved"
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return errorResponse(
        "Vehicle reactivation is available only to approved, active Runners.",
        403,
      );
    }

    // Never switch vehicles while the Runner has an active errand.
    const activeJobResult =
      await client.query<ActiveJobRow>(
        `SELECT
           id,
           status
         FROM public.runner_jobs
         WHERE accepted_runner_id = $1
           AND status IN (
             'accepted',
             'in_progress',
             'completion_submitted'
           )
         ORDER BY accepted_at DESC
         LIMIT 1
         FOR UPDATE`,
        [auth.runner.id],
      );

    if (activeJobResult.rows.length > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return errorResponse(
        "Complete your current errand before reactivating another vehicle.",
        409,
      );
    }

    // Prevent reactivation while Operations is reviewing
    // an unresolved vehicle replacement request.
    const openRequestResult = await client.query<{
      id: string;
      status: string;
    }>(
      `SELECT
         id,
         status
       FROM public.runner_vehicle_change_requests
       WHERE runner_id = $1
         AND status IN (
           'pending_review',
           'changes_required'
         )
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [auth.runner.id],
    );

    if (openRequestResult.rows.length > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return errorResponse(
        "Resolve your existing vehicle replacement request before reactivating a saved vehicle.",
        409,
      );
    }

    // Lock the selected vehicle and verify ownership.
    const vehicleResult =
      await client.query<VehicleRow>(
        `SELECT
           id,
           vehicle_type,
           vehicle_model,
           vehicle_registration,
           status,
           is_active
         FROM public.runner_vehicles
         WHERE id = $1
           AND runner_id = $2
         LIMIT 1
         FOR UPDATE`,
        [
          vehicleId,
          auth.runner.id,
        ],
      );

    const vehicle = vehicleResult.rows[0];

    if (!vehicle) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return errorResponse(
        "The selected vehicle could not be found in your saved vehicles.",
        404,
      );
    }

    if (
      vehicle.status !== "inactive" ||
      vehicle.is_active
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return errorResponse(
        "Only a previously approved, inactive vehicle can be reactivated.",
        409,
      );
    }

    if (
      !["bicycle", "motorcycle", "car"].includes(
        vehicle.vehicle_type,
      )
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return errorResponse(
        "This vehicle type is not currently supported for reactivation. Contact SaMi Support.",
        409,
      );
    }

    // Read the Runner's configured service categories.
    const categoriesResult = await client.query<{
      category_key: string;
    }>(
      `SELECT category_key
       FROM public.runner_account_service_categories
       WHERE runner_id = $1
       ORDER BY category_key`,
      [auth.runner.id],
    );

    const categoryKeys: string[] =
      categoriesResult.rows.map(
        (item: { category_key: string }) =>
          item.category_key,
      );

    if (categoryKeys.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return errorResponse(
        "Your Runner service details could not be verified. Contact SaMi Support.",
        409,
      );
    }

    // Load mandatory requirements for this vehicle and
    // the Runner's selected service categories.
    const requirementsResult =
      await client.query<VehicleRequirementRow>(
        `SELECT
           requirement_key,
           title,
           is_required,
           requires_expiry
         FROM public.runner_onboarding_document_requirements
         WHERE is_active = true
           AND is_required = true
           AND vehicle_type = $1
           AND (
             category_key IS NULL
             OR category_key = ANY($2::text[])
           )
         ORDER BY
           category_key NULLS FIRST,
           display_order,
           requirement_key
         FOR SHARE`,
        [
          vehicle.vehicle_type,
          categoryKeys,
        ],
      );

    const requirements =
      requirementsResult.rows;

    // Never let a motorised vehicle bypass an unconfigured
    // mandatory document checklist.
    if (
      vehicle.vehicle_type !== "bicycle" &&
      requirements.length === 0
    ) {
      console.error(
        "[SaMi Runner vehicle reactivation] No mandatory vehicle requirements configured.",
        {
          runnerId: auth.runner.id,
          vehicleId,
          vehicleType: vehicle.vehicle_type,
        },
      );

      await client.query("ROLLBACK");
      transactionStarted = false;

      return errorResponse(
        "The required documents for this vehicle could not be verified. Contact SaMi Support.",
        503,
      );
    }

    // Read only documents belonging to this exact saved vehicle.
    // Lock them against concurrent review updates.
    const documentsResult =
      await client.query<VehicleDocumentRow>(
        `SELECT
           requirement_key,
           review_status,
           valid_until::text AS valid_until
         FROM public.runner_verification_documents
         WHERE runner_id = $1
           AND vehicle_id = $2
         ORDER BY
           requirement_key ASC,
           submitted_at DESC NULLS LAST,
           id DESC
         FOR SHARE`,
        [
          auth.runner.id,
          vehicleId,
        ],
      );

    // The first document for each requirement is its latest submission.
    const latestDocumentByRequirement =
      new Map<string, VehicleDocumentRow>();

    for (const document of documentsResult.rows) {
      if (
        !document.requirement_key ||
        latestDocumentByRequirement.has(
          document.requirement_key,
        )
      ) {
        continue;
      }

      latestDocumentByRequirement.set(
        document.requirement_key,
        document,
      );
    }

    // Every mandatory document must be approved.
    // Expiring documents must also have a current expiry date.
    for (const requirement of requirements) {
      const document = latestDocumentByRequirement.get(
        requirement.requirement_key,
      );

      if (!document) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return errorResponse(
          `The required ${requirement.title} is missing for this vehicle. Submit it for review before reactivation.`,
          409,
        );
      }

      if (document.review_status !== "approved") {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return errorResponse(
          `Your ${requirement.title} must be approved by Operations before this vehicle can be reactivated.`,
          409,
        );
      }

      if (
        requirement.requires_expiry &&
        !isCurrentExpiryDate(document.valid_until)
      ) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return errorResponse(
          `Your ${requirement.title} has expired or has no recorded expiry date. Submit a current document for review.`,
          409,
        );
      }
    }

    // Lock all currently active vehicles for this Runner.
    const activeVehiclesResult =
      await client.query<{ id: string }>(
        `SELECT id
         FROM public.runner_vehicles
         WHERE runner_id = $1
           AND is_active = true
         FOR UPDATE`,
        [auth.runner.id],
      );

    if (activeVehiclesResult.rows.length > 1) {
      console.error(
        "[SaMi Runner vehicle reactivation] Multiple active vehicles detected.",
        { runnerId: auth.runner.id },
      );

      await client.query("ROLLBACK");
      transactionStarted = false;

      return errorResponse(
        "Your active vehicle information could not be verified. Contact SaMi Support.",
        503,
      );
    }

    const previousVehicleId =
      activeVehiclesResult.rows[0]?.id ?? null;

    // Deactivate the previous vehicle first to satisfy the
    // one-active-vehicle-per-Runner unique index.
    // Its historical record is retained.
    if (previousVehicleId) {
      await client.query(
        `UPDATE public.runner_vehicles
         SET
           status = 'inactive',
           is_active = false,
           updated_at = now()
         WHERE id = $1
           AND runner_id = $2`,
        [
          previousVehicleId,
          auth.runner.id,
        ],
      );
    }

    // Reactivate the explicitly selected saved vehicle.
    const activatedVehicleResult =
      await client.query<VehicleRow>(
        `UPDATE public.runner_vehicles
         SET
           status = 'approved',
           is_active = true,
           approved_at = COALESCE(approved_at, now()),
           updated_at = now()
         WHERE id = $1
           AND runner_id = $2
           AND status = 'inactive'
           AND is_active = false
         RETURNING
           id,
           vehicle_type,
           vehicle_model,
           vehicle_registration,
           status,
           is_active`,
        [
          vehicleId,
          auth.runner.id,
        ],
      );

    const activatedVehicle =
      activatedVehicleResult.rows[0];

    if (!activatedVehicle) {
      throw new Error(
        "RUNNER_VEHICLE_ACTIVATION_FAILED",
      );
    }

    // Keep the legacy dispatch profile aligned with the new
    // active vehicle. Account approval and availability remain unchanged.
    const profileResult = await client.query<{
      runner_id: string;
    }>(
      `UPDATE public.runner_profiles
       SET
         vehicle_type = $2,
         vehicle_model = $3,
         vehicle_registration = $4,
         updated_at = now()
       WHERE runner_id = $1
       RETURNING runner_id`,
      [
        auth.runner.id,
        activatedVehicle.vehicle_type,
        activatedVehicle.vehicle_model,
        activatedVehicle.vehicle_registration,
      ],
    );

    if (!profileResult.rows[0]) {
      throw new Error(
        "RUNNER_VEHICLE_PROFILE_SYNC_FAILED",
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;

    return response({
      ok: true,
      message: "Your saved vehicle is now active.",
      activeVehicle: {
        id: activatedVehicle.id,
        vehicleType: activatedVehicle.vehicle_type,
        vehicleModel: activatedVehicle.vehicle_model,
        vehicleRegistration:
          activatedVehicle.vehicle_registration,
        status: activatedVehicle.status,
        isActive: activatedVehicle.is_active,
      },
      previousVehicleId,
    });
  } catch (cause) {
    if (client && transactionStarted) {
      await client.query("ROLLBACK").catch(
        () => undefined,
      );
      transactionStarted = false;
    }

    const databaseError: {
      code?: unknown;
    } =
      cause !== null && typeof cause === "object"
        ? (cause as { code?: unknown })
        : {};

    if (databaseError.code === "23505") {
      return errorResponse(
        "Your vehicle could not be activated because another active vehicle is already recorded. Refresh your vehicle list and try again.",
        409,
      );
    }

    console.error(
      "[SaMi Runner vehicle reactivation] Failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Your saved vehicle could not be reactivated. Please try again.",
      503,
    );
  } finally {
    client?.release();
  }
}
