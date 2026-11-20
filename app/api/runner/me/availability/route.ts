import { NextResponse } from "next/server";

import { authenticateRunner } from "@/apps/runner/server/auth";
import { databasePool } from "@/apps/runner/server/db";
import { errorResponse, isRecord } from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RunnerLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
};

function optionalNumber(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value >= minimum && value <= maximum ? value : null;
}

function readLocation(value: unknown): RunnerLocation | null {
  if (!isRecord(value)) return null;
  const latitude = value.latitude;
  const longitude = value.longitude;

  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 || latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 || longitude > 180
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy: optionalNumber(value.accuracy, 0, 10000),
    heading: optionalNumber(value.heading, 0, 360),
    speed: optionalNumber(value.speed, 0, 150),
  };
}

export async function POST(request: Request) {
  try {
    // Restricted accounts may still go offline. Permission to go online
    // is checked again under the account lock below.
    const auth = await authenticateRunner(request, {
      allowRestricted: true,
    });
    if (auth.response) return auth.response;

    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body) || typeof body.isOnline !== "boolean") {
      return errorResponse("Choose whether you want to go online or offline.");
    }

    const location = body.isOnline ? readLocation(body.location) : null;
    if (body.isOnline && !location) {
      return errorResponse("A valid current GPS location is required before going online.");
    }

    const client = await databasePool().connect();
    let transactionOpen = false;

    try {
      await client.query("BEGIN");
      transactionOpen = true;

      // All availability and acceptance operations lock the account first.
      // This serializes GO changes against concurrent errand acceptance.
      const accountResult = await client.query<{
        account_status: string;
        verification_status: string;
        full_name: string | null;
        service_area: string | null;
        vehicle_type: string | null;
      }>(
        `SELECT
           a.account_status,
           a.verification_status,
           a.full_name,
           rp.service_area,
           rp.vehicle_type
         FROM public.runner_accounts AS a
         LEFT JOIN public.runner_profiles AS rp
           ON rp.runner_id = a.id
         WHERE a.id = $1
         FOR UPDATE OF a`,
        [auth.runner.id],
      );

      const account = accountResult.rows[0];
      if (!account) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return errorResponse("Runner account could not be found.", 404);
      }

      const activeResult = await client.query<{ id: string; status: string }>(
        `SELECT id, status
         FROM public.runner_jobs
         WHERE accepted_runner_id = $1
           AND status IN ('accepted', 'in_progress', 'completion_submitted')
         ORDER BY accepted_at DESC
         LIMIT 1
         FOR UPDATE`,
        [auth.runner.id],
      );
      const activeJob = activeResult.rows[0] ?? null;

      if (body.isOnline) {
        const profileIsComplete =
          typeof account.full_name === "string" && account.full_name.trim().length > 0 &&
          typeof account.service_area === "string" && account.service_area.trim().length > 0 &&
          typeof account.vehicle_type === "string" && account.vehicle_type.trim().length > 0;

        const isEligible =
          account.account_status === "active" &&
          account.verification_status === "approved" &&
          profileIsComplete;

        if (!isEligible) {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return errorResponse(
            "Your profile and verification must be approved before you can go online.",
            403,
          );
        }

        if (activeJob) {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return errorResponse(
            "Finish your current errand and wait for customer confirmation before going online for another errand.",
            409,
          );
        }
      } else if (activeJob && activeJob.status !== "completion_submitted") {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return errorResponse(
          "You cannot go offline while an errand is in progress.",
          409,
        );
      }

      const result = await client.query<{
        is_online: boolean;
        last_heartbeat_at: string | null;
      }>(
        `INSERT INTO public.runner_availability (
           runner_id, is_online, last_heartbeat_at, updated_at
         )
         VALUES (
           $1,
           $2,
           CASE WHEN $2 THEN now() ELSE NULL END,
           now()
         )
         ON CONFLICT (runner_id)
         DO UPDATE SET
           is_online = EXCLUDED.is_online,
           last_heartbeat_at = CASE
             WHEN EXCLUDED.is_online THEN now()
             ELSE runner_availability.last_heartbeat_at
           END,
           updated_at = now()
         RETURNING is_online, last_heartbeat_at`,
        [auth.runner.id, body.isOnline],
      );

      if (body.isOnline && location) {
        await client.query(
          `INSERT INTO public.runner_presence_locations (
             runner_id, latitude, longitude, accuracy_meters,
             heading_degrees, speed_meters_per_second, captured_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, now())
           ON CONFLICT (runner_id)
           DO UPDATE SET
             latitude = EXCLUDED.latitude,
             longitude = EXCLUDED.longitude,
             accuracy_meters = EXCLUDED.accuracy_meters,
             heading_degrees = EXCLUDED.heading_degrees,
             speed_meters_per_second = EXCLUDED.speed_meters_per_second,
             captured_at = now()`,
          [
            auth.runner.id,
            location.latitude,
            location.longitude,
            location.accuracy,
            location.heading,
            location.speed,
          ],
        );
      } else {
        await client.query(
          "DELETE FROM public.runner_presence_locations WHERE runner_id = $1",
          [auth.runner.id],
        );
      }

      await client.query("COMMIT");
      transactionOpen = false;

      return NextResponse.json(
        {
          ok: true,
          availability: {
            isOnline: result.rows[0].is_online,
            lastHeartbeatAt: result.rows[0].last_heartbeat_at,
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      if (transactionOpen) {
        await client.query("ROLLBACK").catch(() => undefined);
      }
      return errorResponse("Your availability could not be updated.", 503);
    } finally {
      client.release();
    }
  } catch {
    return errorResponse("Your availability could not be updated.", 503);
  }
}