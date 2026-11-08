
import { NextResponse } from "next/server";

import { authenticateRunner } from "@/apps/runner/server/auth";
import { databasePool } from "@/apps/runner/server/db";
import { errorResponse, isRecord } from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // Restricted accounts may still go offline.
    // Permission to go online is checked again under the account lock below.
    const auth = await authenticateRunner(request, {
      allowRestricted: true,
    });

    if (auth.response) return auth.response;

    const body: unknown = await request.json().catch(() => null);

    if (!isRecord(body) || typeof body.isOnline !== "boolean") {
      return errorResponse(
        "Choose whether you want to go online or offline.",
      );
    }

    const client = await databasePool().connect();
    let transactionOpen = false;

    try {
      await client.query("BEGIN");
      transactionOpen = true;

      // Lock the account so an Admin approval, suspension, or closure
      // cannot race with this availability update.
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

      if (body.isOnline) {
        const profileIsComplete =
          typeof account.full_name === "string" &&
          account.full_name.trim().length > 0 &&
          typeof account.service_area === "string" &&
          account.service_area.trim().length > 0 &&
          typeof account.vehicle_type === "string" &&
          account.vehicle_type.trim().length > 0;

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
      }

      const result = await client.query<{
        is_online: boolean;
        last_heartbeat_at: string | null;
      }>(
        `INSERT INTO public.runner_availability (
           runner_id,
           is_online,
           last_heartbeat_at,
           updated_at
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
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    } catch {
      if (transactionOpen) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original request failure.
        }
      }

      return errorResponse("Your availability could not be updated.", 503);
    } finally {
      client.release();
    }
  } catch {
    return errorResponse("Your availability could not be updated.", 503);
  }
}
