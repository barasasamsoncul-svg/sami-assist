import { NextResponse } from "next/server";

import { authenticateRunner } from "@/lib/auth";
import { databasePool } from "@/lib/db";
import { errorResponse, isRecord } from "@/lib/http";

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

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.action !== "string") {
    return errorResponse("Choose a valid errand action.");
  }

  const transition =
    body.action === "start"
      ? {
          from: "accepted",
          to: "in_progress",
          event: "runner_started",
          note: "Runner started the errand.",
        }
      : body.action === "submit_completion"
        ? {
            from: "in_progress",
            to: "completion_submitted",
            event: "runner_submitted_completion",
            note: "Runner submitted the errand for customer confirmation.",
          }
        : null;

  if (!transition) return errorResponse("Unsupported errand action.");

  const client = await databasePool().connect();

  try {
    await client.query("BEGIN");

    const result = await client.query<{
      customer_errand_ref: string;
      public_code: string;
      status: string;
    }>(
      `SELECT customer_errand_ref, public_code, status
       FROM public.runner_jobs
       WHERE id = $1 AND accepted_runner_id = $2
       FOR UPDATE`,
      [id, auth.runner.id],
    );

    const job = result.rows[0];

    if (!job) {
      await client.query("ROLLBACK");
      return errorResponse("Errand not found.", 404);
    }

    if (job.status !== transition.from) {
      await client.query("ROLLBACK");
      return errorResponse(
        "This errand cannot move to that stage from its current status.",
        409,
      );
    }

    await client.query(
      `UPDATE public.runner_jobs
       SET status = $2,
           started_at = CASE
             WHEN $2 = 'in_progress' THEN coalesce(started_at, now())
             ELSE started_at
           END,
           completion_submitted_at = CASE
             WHEN $2 = 'completion_submitted' THEN now()
             ELSE completion_submitted_at
           END,
           updated_at = now()
       WHERE id = $1`,
      [id, transition.to],
    );

    await client.query(
      `INSERT INTO public.runner_job_events (
         job_id, runner_id, event_type, from_status, to_status, note
       )
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        auth.runner.id,
        transition.event,
        transition.from,
        transition.to,
        transition.note,
      ],
    );

    await client.query(
      `INSERT INTO public.runner_integration_outbox (
         event_type, customer_errand_ref, payload
       )
       VALUES ($1, $2, $3::jsonb)`,
      [
        transition.event,
        job.customer_errand_ref,
        JSON.stringify({
          customerErrandRef: job.customer_errand_ref,
          publicCode: job.public_code,
          runnerRef: auth.runner.id,
          eventType: transition.event,
          status: transition.to,
        }),
      ],
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        ok: true,
        status: transition.to,
        message:
          transition.to === "in_progress"
            ? "Errand started."
            : "Completion submitted for customer confirmation.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    return errorResponse("The errand status could not be updated.", 503);
  } finally {
    client.release();
  }
}