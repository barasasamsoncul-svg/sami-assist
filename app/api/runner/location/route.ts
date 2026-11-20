import { NextResponse } from "next/server";

import { authenticateRunner } from "@/apps/runner/server/auth";
import { databasePool } from "@/apps/runner/server/db";
import { errorResponse, isRecord } from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalNumber(value: unknown, minimum: number, maximum: number): number | null {
  const number = finiteNumber(value);
  if (number === null || number < minimum || number > maximum) return null;
  return number;
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateRunner(request);
    if (auth.response) return auth.response;

    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) return errorResponse("A location update is required.");

    const latitude = finiteNumber(body.latitude);
    const longitude = finiteNumber(body.longitude);
    const accuracy = optionalNumber(body.accuracy, 0, 10000);
    const heading = optionalNumber(body.heading, 0, 360);
    const speed = optionalNumber(body.speed, 0, 150);

    if (
      latitude === null || longitude === null ||
      latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180
    ) {
      return errorResponse("The supplied coordinates are invalid.");
    }

    const client = await databasePool().connect();
    let transactionOpen = false;

    try {
      await client.query("BEGIN");
      transactionOpen = true;

      const accountResult = await client.query<{
        account_status: string;
        verification_status: string;
      }>(
        `SELECT account_status, verification_status
         FROM public.runner_accounts
         WHERE id = $1
         FOR UPDATE`,
        [auth.runner.id],
      );
      const account = accountResult.rows[0];

      if (!account) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return errorResponse("Runner account could not be found.", 404);
      }

      const availabilityResult = await client.query<{ is_online: boolean }>(
        `SELECT is_online
         FROM public.runner_availability
         WHERE runner_id = $1
         FOR UPDATE`,
        [auth.runner.id],
      );
      const isOnline = availabilityResult.rows[0]?.is_online === true;

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

      if (activeJob?.status === "completion_submitted") {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return errorResponse(
          "Live location sharing pauses while the customer confirms your completed errand.",
          409,
        );
      }

      if (activeJob && (activeJob.status === "accepted" || activeJob.status === "in_progress")) {
        if (account.account_status !== "active" || account.verification_status !== "approved") {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return errorResponse("Your account is not authorised to share errand location.", 403);
        }

        await client.query(
          `INSERT INTO public.runner_live_locations (
             runner_id, job_id, latitude, longitude, accuracy_meters,
             heading_degrees, speed_meters_per_second, captured_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, now())
           ON CONFLICT (runner_id)
           DO UPDATE SET
             job_id = EXCLUDED.job_id,
             latitude = EXCLUDED.latitude,
             longitude = EXCLUDED.longitude,
             accuracy_meters = EXCLUDED.accuracy_meters,
             heading_degrees = EXCLUDED.heading_degrees,
             speed_meters_per_second = EXCLUDED.speed_meters_per_second,
             captured_at = now()`,
          [auth.runner.id, activeJob.id, latitude, longitude, accuracy, heading, speed],
        );

        await client.query(
          "DELETE FROM public.runner_presence_locations WHERE runner_id = $1",
          [auth.runner.id],
        );
      } else {
        if (
          !isOnline ||
          account.account_status !== "active" ||
          account.verification_status !== "approved"
        ) {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return errorResponse(
            "Location can only be shared while you are online or completing an active errand.",
            409,
          );
        }

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
          [auth.runner.id, latitude, longitude, accuracy, heading, speed],
        );
      }

      await client.query(
        "UPDATE public.runner_availability SET last_heartbeat_at = now(), updated_at = now() WHERE runner_id = $1",
        [auth.runner.id],
      );

      await client.query("COMMIT");
      transactionOpen = false;

      return NextResponse.json(
        { ok: true, receivedAt: new Date().toISOString() },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      if (transactionOpen) {
        await client.query("ROLLBACK").catch(() => undefined);
      }
      return errorResponse("Your location could not be updated.", 503);
    } finally {
      client.release();
    }
  } catch {
    return errorResponse("Your location could not be updated.", 503);
  }
}