import { NextResponse } from "next/server";

import { authenticateRunner } from "@/lib/auth";
import { query } from "@/lib/db";
import { errorResponse, isRecord } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const auth = await authenticateRunner(request);
    if (auth.response) return auth.response;

    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body) || typeof body.isOnline !== "boolean") {
      return errorResponse("Choose whether you want to go online or offline.");
    }

    if (body.isOnline) {
      const account = await query<{ allowed: boolean }>(
        `SELECT (
           a.account_status = 'active'
           AND a.verification_status = 'approved'
           AND a.full_name IS NOT NULL
           AND rp.service_area IS NOT NULL
           AND rp.vehicle_type IS NOT NULL
         ) AS allowed
         FROM public.runner_accounts AS a
         JOIN public.runner_profiles AS rp ON rp.runner_id = a.id
         WHERE a.id = $1`,
        [auth.runner.id],
      );

      if (account.rows[0]?.allowed !== true) {
        return errorResponse(
          "Your profile and verification must be approved before you can go online.",
          403,
        );
      }
    }

    const result = await query<{
      is_online: boolean;
      last_heartbeat_at: string | null;
    }>(
      `INSERT INTO public.runner_availability (
         runner_id, is_online, last_heartbeat_at, updated_at
       )
       VALUES ($1, $2, CASE WHEN $2 THEN now() ELSE NULL END, now())
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
    return errorResponse("Your availability could not be updated.", 503);
  }
}