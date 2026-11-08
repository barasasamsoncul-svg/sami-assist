import { NextResponse } from "next/server";

import { authenticateRunner } from "@/apps/runner/server/auth";
import { databasePool, query } from "@/apps/runner/server/db";
import { errorResponse, isRecord } from "@/apps/runner/server/http";

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

function shapeRunner(row: RunnerProfileRow) {
  return {
    id: row.id,
    phone: row.phone_e164,
    email: row.email,
    fullName: row.full_name,
    accountStatus: row.account_status,
    verificationStatus: row.verification_status,
    serviceArea: row.service_area,
    vehicleType: row.vehicle_type,
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
      return errorResponse("Runner profile not found.", 404);
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

  const allowedVehicles = new Set([
    "motorcycle",
    "bicycle",
    "car",
    "van",
    "other",
  ]);

  if (fullName.length < 2 || fullName.length > 120) {
    return errorResponse(
      "Your full name must be between 2 and 120 characters.",
    );
  }

  if (serviceArea.length < 2) {
    return errorResponse(
      "Enter your main service area.",
    );
  }

  if (!allowedVehicles.has(vehicleType)) {
    return errorResponse(
      "Choose a valid vehicle type.",
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

  try {
    await client.query("BEGIN");

    // Lock the Runner account before changing any details
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

      return errorResponse(
        "Your profile cannot be changed while your application is under review or after approval. Contact SaMi Operations if your verified details need to change.",
        409,
      );
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
        vehicleType,
        vehicleRegistration || null,
      ],
    );

    await client.query("COMMIT");

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
    await client.query("ROLLBACK").catch(
      () => undefined,
    );

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