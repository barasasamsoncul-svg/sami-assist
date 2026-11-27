
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

type RunnerProfileRow = {
  id: string;
  phone_e164: string | null;
  email: string | null;
  full_name: string | null;
  account_status: string;
  verification_status: string;
  service_area: string | null;
  vehicle_type: string | null;
  vehicle_registration: string | null;
  is_online: boolean;
  last_heartbeat_at: string | null;
};

type RunnerVehicleType =
  | "bike"
  | "motorbike"
  | "vehicle";

type StoredVehicleType =
  | "bicycle"
  | "motorcycle"
  | "car";

const MOTORBIKE_REGISTRATION_PATTERN =
  /^KM[A-HJ-NP-Z]{2}[0-9]{3}[A-HJ-NP-Z]$/;

const VEHICLE_REGISTRATION_PATTERN =
  /^K[A-HJ-NP-Z]{2}[0-9]{3}[A-HJ-NP-Z]$/;

/* -------------------------------------------------------------------------- */
/* VEHICLE NORMALIZATION                                                      */
/* -------------------------------------------------------------------------- */

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

function compactKenyanRegistration(
  value: string,
): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

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
/* RESPONSE SHAPING                                                           */
/* -------------------------------------------------------------------------- */

function shapeRunner(row: RunnerProfileRow) {
  return {
    id: row.id,
    phone: row.phone_e164,
    email: row.email,
    fullName: row.full_name,
    accountStatus: row.account_status,
    verificationStatus: row.verification_status,
    serviceArea: row.service_area,
    vehicleType: normalizeVehicleType(
      row.vehicle_type ?? "",
    ) ?? row.vehicle_type,
    vehicleRegistration: row.vehicle_registration,

    profileComplete: Boolean(
      row.full_name &&
      row.full_name.trim().length >= 2 &&
      row.service_area &&
      row.service_area.trim().length >= 2 &&
      row.vehicle_type,
    ),

    availability: {
      isOnline: row.is_online,
      lastHeartbeatAt: row.last_heartbeat_at,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* GET /api/runner/me                                                         */
/* -------------------------------------------------------------------------- */

export async function GET(request: Request) {
  try {
    const auth = await authenticateRunner(request);

    if (auth.response) {
      return auth.response;
    }

    const result = await query<RunnerProfileRow>(
      `SELECT
         a.id,
         a.phone_e164,
         a.email,
         a.full_name,
         a.account_status,
         a.verification_status,
         p.service_area,
         p.vehicle_type,
         p.vehicle_registration,
         COALESCE(v.is_online, false) AS is_online,
         v.last_heartbeat_at
       FROM public.runner_accounts AS a
       LEFT JOIN public.runner_profiles AS p
         ON p.runner_id = a.id
       LEFT JOIN public.runner_availability AS v
         ON v.runner_id = a.id
       WHERE a.id = $1
       LIMIT 1`,
      [auth.runner.id],
    );

    const row = result.rows[0];

    if (!row) {
      return errorResponse(
        "Runner profile not found.",
        404,
      );
    }

    return NextResponse.json(
      {
        runner: shapeRunner(row),
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      },
    );
  } catch (cause) {
    console.error(
      "[SaMi Runner profile] Read failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Your Runner profile could not be loaded.",
      503,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* PUT /api/runner/me                                                         */
/* -------------------------------------------------------------------------- */

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
    typeof body.fullName !== "string" ||
    typeof body.serviceArea !== "string" ||
    typeof body.vehicleType !== "string"
  ) {
    return errorResponse(
      "Complete the required Runner profile details.",
    );
  }

  const fullName = body.fullName
    .trim()
    .replace(/\s+/g, " ");

  const serviceArea = body.serviceArea
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);

  const vehicleType = normalizeVehicleType(
    body.vehicleType,
  );

  if (!vehicleType) {
    return errorResponse(
      "Choose Bicycle, Motorbike or Vehicle.",
    );
  }

  const storedVehicleType =
    toStoredVehicleType(vehicleType);

  const rawRegistration =
    typeof body.vehicleRegistration === "string"
      ? body.vehicleRegistration
      : "";

  const compactRegistration =
    compactKenyanRegistration(rawRegistration);

  const vehicleRegistration =
    vehicleType === "bike"
      ? ""
      : normalizeKenyanRegistration(
          compactRegistration,
          vehicleType,
        );

  if (fullName.length < 2 || fullName.length > 120) {
    return errorResponse(
      "Your full name must be between 2 and 120 characters.",
    );
  }

  if (
    serviceArea.length < 2 ||
    serviceArea.length > 120
  ) {
    return errorResponse(
      "Enter your main service area.",
    );
  }

  if (
    vehicleType !== "bike" &&
    !isValidKenyanRegistration(
      compactRegistration,
      vehicleType,
    )
  ) {
    return errorResponse(
      registrationValidationMessage(vehicleType),
    );
  }

  const savedRegistration =
    vehicleType === "bike"
      ? null
      : vehicleRegistration;

  const client = await databasePool().connect();

  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // Lock the Runner account before changing details
    // that influence verification or document requirements.
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
        "Your profile cannot be changed while your application is under review or after approval. Contact SaMi Operations if your verified details need to change.",
        409,
      );
    }

    /*
     * Check whether another Runner already owns this plate.
     * The current Runner is excluded so they can save
     * their own existing registration again.
     */
    if (savedRegistration) {
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

    await client.query(
      `UPDATE public.runner_accounts
       SET
         full_name = $2,
         account_status = 'pending_verification',
         updated_at = now()
       WHERE id = $1`,
      [
        auth.runner.id,
        fullName,
      ],
    );

    await client.query(
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
         updated_at = now()`,
      [
        auth.runner.id,
        serviceArea,
        storedVehicleType,
        savedRegistration,
      ],
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return NextResponse.json(
      {
        ok: true,
        message: "Your Runner profile has been saved.",
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      },
    );
  } catch (cause) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(
        () => undefined,
      );
    }

    /*
     * The unique database index is the final protection
     * when two Runner accounts submit the same plate
     * at almost exactly the same time.
     */
    if (isVehicleRegistrationUniqueViolation(cause)) {
      return errorResponse(
        "This vehicle registration is already registered to another SaMi Runner. Use a different vehicle registration number.",
        409,
      );
    }

    console.error(
      "[SaMi Runner profile] Update failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Your Runner profile could not be saved.",
      503,
    );
  } finally {
    client.release();
  }
}
