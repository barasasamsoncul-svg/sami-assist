import { NextResponse } from "next/server";

import { authenticateRunner } from "@/apps/runner/server/auth";
import { query } from "@/apps/runner/server/db";
import { errorResponse } from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RunnerJobRow = {
  id: string;
  public_code: string;
  title: string;
  category: string;
  description: string;
  pickup_label: string;
  destination_label: string;
  distance_km: number | null;
  runner_payout_amount: number | null;
  currency: string;
  status: string;
  offer_expires_at: string | null;
};

function shapeJob(row: RunnerJobRow) {
  return {
    id: row.id,
    publicCode: row.public_code,
    title: row.title,
    category: row.category,
    description: row.description,
    pickupLabel: row.pickup_label,
    destinationLabel: row.destination_label,
    distanceKm: row.distance_km === null ? null : Number(row.distance_km),
    runnerPayoutAmount:
      row.runner_payout_amount === null ? null : Number(row.runner_payout_amount),
    currency: row.currency,
    status: row.status,
    offerExpiresAt: row.offer_expires_at,
  };
}

export async function GET(request: Request) {
  try {
    const auth = await authenticateRunner(request);
    if (auth.response) return auth.response;

    const [offers, active] = await Promise.all([
      query<RunnerJobRow>(
        `SELECT
           j.id, j.public_code, j.title, j.category, j.description,
           j.pickup_label, j.destination_label, j.distance_km,
           j.runner_payout_amount, j.currency, j.status,
           o.expires_at AS offer_expires_at
         FROM public.runner_job_offers AS o
         JOIN public.runner_jobs AS j ON j.id = o.job_id
         WHERE o.runner_id = $1
           AND o.offer_status = 'offered'
           AND o.expires_at > now()
           AND j.status = 'offered'
           AND j.accepted_runner_id IS NULL
         ORDER BY o.created_at DESC
         LIMIT 50`,
        [auth.runner.id],
      ),
      query<RunnerJobRow>(
        `SELECT
           j.id, j.public_code, j.title, j.category, j.description,
           j.pickup_label, j.destination_label, j.distance_km,
           j.runner_payout_amount, j.currency, j.status,
           NULL::timestamptz AS offer_expires_at
         FROM public.runner_jobs AS j
         WHERE j.accepted_runner_id = $1
           AND j.status IN ('accepted', 'in_progress', 'completion_submitted')
         ORDER BY j.accepted_at DESC
         LIMIT 20`,
        [auth.runner.id],
      ),
    ]);

    return NextResponse.json(
      {
        offers: offers.rows.map(shapeJob),
        active: active.rows.map(shapeJob),
      },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch {
    return errorResponse("Your errand list could not be loaded.", 503);
  }
}