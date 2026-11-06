import { NextResponse } from "next/server";

import { authenticateRunner } from "@/lib/auth";
import { query } from "@/lib/db";
import { errorResponse, isRecord } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateRunner(request);
    if (auth.response) return auth.response;

    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) return errorResponse("A location update is required.");

    const latitude = finiteNumber(body.latitude);
    const longitude = finiteNumber(body.longitude);
    const accuracy = finiteNumber(body.accuracy);
    const heading = finiteNumber(body.heading);
    const speed = finiteNumber(body.speed);

    if (
      latitude === null || longitude === null ||
      latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180
    ) {
      return errorResponse("The supplied coordinates are invalid.");
    }

    const active = await query<{ id: string }>(
      `SELECT id
       FROM public.runner_jobs
       WHERE accepted_runner_id = $1
         AND status IN ('accepted', 'in_progress')
       ORDER BY accepted_at DESC
       LIMIT 1`,
      [auth.runner.id],
    );

    const job = active.rows[0];
    if (!job) {
      return errorResponse(
        "Location can only be shared during an active errand.",
        409,
      );
    }

    await query(
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
      [
        auth.runner.id,
        job.id,
        latitude,
        longitude,
        accuracy,
        heading,
        speed,
      ],
    );

    await query(
      "UPDATE public.runner_availability SET last_heartbeat_at = now(), updated_at = now() WHERE runner_id = $1",
      [auth.runner.id],
    );

    return NextResponse.json(
      { ok: true, receivedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return errorResponse("Your location could not be updated.", 503);
  }
}