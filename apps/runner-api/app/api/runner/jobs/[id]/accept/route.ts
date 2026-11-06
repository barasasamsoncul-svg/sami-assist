import { NextResponse } from "next/server";

import { authenticateRunner } from "@/lib/auth";
import { databasePool } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await authenticateRunner(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  if (!isUuid(id)) return errorResponse("Invalid errand identifier.");

  const client = await databasePool().connect();

  try {
    await client.query("BEGIN");

    const account = await client.query<{
      is_online: boolean;
      account_status: string;
      verification_status: string;
    }>(
      `SELECT v.is_online, a.account_status, a.verification_status
       FROM public.runner_accounts a
       JOIN public.runner_availability v ON v.runner_id = a.id
       WHERE a.id = $1
       FOR UPDATE OF a, v`,
      [auth.runner.id],
    );

    if (
      account.rows[0]?.is_online !== true ||
      account.rows[0]?.account_status !== "active" ||
      account.rows[0]?.verification_status !== "approved"
    ) {
      await client.query("ROLLBACK");
      return errorResponse(
        "Go online with an approved Runner account before accepting an errand.",
        403,
      );
    }

    const offerResult = await client.query<{
      customer_errand_ref: string;
      public_code: string;
      status: string;
    }>(
      `SELECT j.customer_errand_ref, j.public_code, j.status
       FROM public.runner_jobs AS j
       JOIN public.runner_job_offers AS o ON o.job_id = j.id
       WHERE j.id = $1
         AND o.runner_id = $2
         AND o.offer_status = 'offered'
         AND o.expires_at > now()
       FOR UPDATE OF j, o`,
      [id, auth.runner.id],
    );

    const offer = offerResult.rows[0];
    if (!offer || offer.status !== "offered") {
      await client.query("ROLLBACK");
      return errorResponse("This errand offer is no longer available.", 409);
    }

    const updated = await client.query(
      `UPDATE public.runner_jobs
       SET accepted_runner_id = $2,
           status = 'accepted',
           accepted_at = now(),
           updated_at = now()
       WHERE id = $1
         AND status = 'offered'
         AND accepted_runner_id IS NULL
       RETURNING id`,
      [id, auth.runner.id],
    );

    if (!updated.rowCount) {
      await client.query("ROLLBACK");
      return errorResponse("Another runner has already accepted this errand.", 409);
    }

    await client.query(
      `UPDATE public.runner_job_offers
       SET offer_status = CASE WHEN runner_id = $2 THEN 'accepted' ELSE 'withdrawn' END,
           responded_at = now()
       WHERE job_id = $1`,
      [id, auth.runner.id],
    );

    await client.query(
      `INSERT INTO public.runner_job_events (
         job_id, runner_id, event_type, from_status, to_status, note
       )
       VALUES ($1, $2, 'runner_accepted', 'offered', 'accepted', $3)`,
      [id, auth.runner.id, "Runner accepted the errand offer."],
    );

    await client.query(
      `INSERT INTO public.runner_integration_outbox (
         event_type, customer_errand_ref, payload
       )
       VALUES ('runner_job_accepted', $1, $2::jsonb)`,
      [
        offer.customer_errand_ref,
        JSON.stringify({
          customerErrandRef: offer.customer_errand_ref,
          publicCode: offer.public_code,
          runnerRef: auth.runner.id,
          eventType: "runner_job_accepted",
        }),
      ],
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        ok: true,
        message: "You have accepted this errand.",
        status: "accepted",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    return errorResponse("This errand could not be accepted.", 503);
  } finally {
    client.release();
  }
}