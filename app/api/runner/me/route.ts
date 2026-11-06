import { NextResponse } from "next/server";

import { authenticateRunner } from "@/lib/runner/auth";
import { query } from "@/lib/runner/db";
import { errorResponse, isRecord } from "@/lib/runner/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RunnerProfileRow = {
  id: string;
  phone_e164: string;
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
    if (auth.response) return auth.response;

    const result = await query<RunnerProfileRow>(
      `SELECT
         a.id, a.phone_e164, a.email, a.full_name,
         a.account_status, a.verification_status,
         p.service_area, p.vehicle_type, p.vehicle_registration,
         coalesce(v.is_online, false) AS is_online,
         v.last_heartbeat_at
       FROM public.runner_accounts AS a
       LEFT JOIN public.runner_profiles AS p ON p.runner_id = a.id
       LEFT JOIN public.runner_availability AS v ON v.runner_id = a.id
       WHERE a.id = $1
       LIMIT 1`,
      [auth.runner.id],
    );

    const row = result.rows[0];
    if (!row) return errorResponse("Runner profile not found.", 404);

    return NextResponse.json(
      { runner: shapeRunner(row) },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch {
    return errorResponse("Your Runner profile could not be loaded.", 503);
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await authenticateRunner(request);
    if (auth.response) return auth.response;

    const body: unknown = await request.json().catch(() => null);
    if (
      !isRecord(body) ||
      typeof body.fullName !== "string" ||
      typeof body.serviceArea !== "string" ||
      typeof body.vehicleType !== "string"
    ) {
      return errorResponse("Complete the required Runner profile details.");
    }

    const fullName = body.fullName.trim().replace(/\s+/g, " ");
    const serviceArea = body.serviceArea.trim().slice(0, 120);
    const vehicleType = body.vehicleType.trim();
    const vehicleRegistration =
      typeof body.vehicleRegistration === "string"
        ? body.vehicleRegistration.trim().toUpperCase().slice(0, 30)
        : "";

    const allowedVehicles = new Set([
      "motorcycle", "bicycle", "car", "van", "other",
    ]);

    if (fullName.length < 2 || fullName.length > 120) {
      return errorResponse("Your full name must be between 2 and 120 characters.");
    }
    if (serviceArea.length < 2) {
      return errorResponse("Enter your main service area.");
    }
    if (!allowedVehicles.has(vehicleType)) {
      return errorResponse("Choose a valid vehicle type.");
    }

    const client = await (await import("@/lib/db")).databasePool().connect();

    try {
      await client.query("BEGIN");

      const updatedAccount = await client.query(
        `UPDATE public.runner_accounts
         SET
           full_name = $2,
           account_status = CASE
             WHEN verification_status = 'approved' THEN 'active'
             ELSE 'pending_verification'
           END,
           updated_at = now()
         WHERE id = $1
         RETURNING id`,
        [auth.runner.id, fullName],
      );

      if (!updatedAccount.rowCount) {
        await client.query("ROLLBACK");
        return errorResponse("Your Runner account could not be found.", 404);
      }

      await client.query(
        `INSERT INTO public.runner_profiles (
           runner_id, service_area, vehicle_type, vehicle_registration, updated_at
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
    } catch (cause) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw cause;
    } finally {
      client.release();
    }

    return NextResponse.json(
      { ok: true, message: "Your Runner profile has been saved." },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return errorResponse("Your Runner profile could not be saved.", 503);
  }
}