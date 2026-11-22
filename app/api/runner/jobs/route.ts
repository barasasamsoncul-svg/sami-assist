import { NextResponse } from "next/server";

import { authenticateRunner } from "@/apps/runner/server/auth";
import { query, databasePool } from "@/apps/runner/server/db";
import { query as customerQuery } from "@/lib/db";
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
  pickup_latitude: number | null;
  pickup_longitude: number | null;

  destination_label: string;
  destination_latitude: number | null;
  destination_longitude: number | null;

  distance_km: number | null;
  runner_payout_amount: number | null;
  currency: string;
  status: string;
  offer_expires_at: string | null;
};

function nullableNumber(value: number | null): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

type CustomerErrandProjection = {
  id: string;
  public_code: string;
  title: string;
  category: string;
  description: string;
  pickup_location: string | null;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  destination_location: string | null;
  destination_latitude: number | null;
  destination_longitude: number | null;
  distance_km: number | string | null;
  provider_earning_amount: number | string | null;
  currency: string | null;
};

function getRunnerServiceType(category: string): "shop_deliver" | "pickup_deliver" {
  const normalized = category.trim().toLowerCase();

  // Only errands that involve purchasing goods go to Shop & Deliver.
  // All other requests use Pick Up & Deliver.
  return new Set([
    "shopping",
    "clothing_retail",
    "groceries",
    "shopping_gifts",
    "pharmacy_health",
  ]).has(normalized)
    ? "shop_deliver"
    : "pickup_deliver";
}

function getLocationLabel(
  label: string | null,
  latitude: number | null,
  longitude: number | null,
  fallback: string,
): string {
  const supplied = label?.trim();
  if (supplied) return supplied;

  if (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    typeof longitude === "number" &&
    Number.isFinite(longitude)
  ) {
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }

  return fallback;
}

/**
 * The Customer and Runner apps intentionally use separate databases.
 * The Customer create endpoint persists the errand in DATABASE_URL, while
 * the Runner marketplace reads runner_jobs/runner_job_offers from
 * RUNNER_DATABASE_URL. Project open customer errands into the Runner
 * marketplace when an approved, online Runner polls for work.
 *
 * Both the job and offer inserts are idempotent. Accepted jobs are never
 * overwritten by a later poll.
 */
async function syncCustomerErrandsForRunner(runnerId: string): Promise<void> {
  const customerErrands = await customerQuery<CustomerErrandProjection>(
    `SELECT
       id::text AS id,
       public_code,
       title,
       category,
       description,
       pickup_location,
       pickup_latitude,
       pickup_longitude,
       destination_location,
       destination_latitude,
       destination_longitude,
       distance_km,
       provider_earning_amount,
       currency
     FROM public.errands
     WHERE status = 'requested'
       AND provider_id IS NULL
       AND created_at >= now() - interval '60 days'
     ORDER BY created_at ASC
     LIMIT 250`,
  );

  if (customerErrands.rows.length === 0) return;

  const client = await databasePool().connect();

  try {
    await client.query("BEGIN");

    const accountResult = await client.query<{
      account_status: string;
      verification_status: string;
      is_online: boolean;
    }>(
      `SELECT
         a.account_status,
         a.verification_status,
         COALESCE(v.is_online, false) AS is_online
       FROM public.runner_accounts AS a
       LEFT JOIN public.runner_availability AS v
         ON v.runner_id = a.id
       WHERE a.id = $1
       FOR UPDATE OF a`,
      [runnerId],
    );

    const account = accountResult.rows[0];
    const isDispatchEligible =
      account?.account_status === "active" &&
      account.verification_status === "approved" &&
      account.is_online === true;

    const selectedServices = await client.query<{ category_key: string }>(
      `SELECT category_key
       FROM public.runner_account_service_categories
       WHERE runner_id = $1
         AND category_key IN ('pickup_deliver', 'shop_deliver')`,
      [runnerId],
    );
    const runnerServices = new Set(
      selectedServices.rows.map((row) => row.category_key),
    );

    const activeJob = await client.query<{ id: string }>(
      `SELECT id
       FROM public.runner_jobs
       WHERE accepted_runner_id = $1
         AND status IN ('accepted', 'in_progress', 'completion_submitted')
       LIMIT 1
       FOR UPDATE`,
      [runnerId],
    );
    const canReceiveOffer =
      isDispatchEligible &&
      runnerServices.size === 1 &&
      activeJob.rows.length === 0;

    for (const errand of customerErrands.rows) {
      const serviceType = getRunnerServiceType(errand.category);
      const projected = await client.query<{ id: string; status: string; accepted_runner_id: string | null }>(
        `INSERT INTO public.runner_jobs (
           customer_errand_ref,
           public_code,
           title,
           category,
           description,
           pickup_label,
           pickup_latitude,
           pickup_longitude,
           destination_label,
           destination_latitude,
           destination_longitude,
           distance_km,
           runner_payout_amount,
           currency,
           status,
           source_projection
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           'offered', $15::jsonb
         )
         ON CONFLICT (customer_errand_ref)
         DO UPDATE SET
           public_code = EXCLUDED.public_code,
           title = EXCLUDED.title,
           category = EXCLUDED.category,
           description = EXCLUDED.description,
           pickup_label = EXCLUDED.pickup_label,
           pickup_latitude = EXCLUDED.pickup_latitude,
           pickup_longitude = EXCLUDED.pickup_longitude,
           destination_label = EXCLUDED.destination_label,
           destination_latitude = EXCLUDED.destination_latitude,
           destination_longitude = EXCLUDED.destination_longitude,
           distance_km = EXCLUDED.distance_km,
           runner_payout_amount = EXCLUDED.runner_payout_amount,
           currency = EXCLUDED.currency,
           source_projection = EXCLUDED.source_projection,
           updated_at = now()
         WHERE public.runner_jobs.status = 'offered'
           AND public.runner_jobs.accepted_runner_id IS NULL
         RETURNING id, status, accepted_runner_id`,
        [
          errand.id,
          errand.public_code,
          errand.title,
          serviceType,
          errand.description,
          getLocationLabel(
            errand.pickup_location,
            errand.pickup_latitude,
            errand.pickup_longitude,
            "Pickup location not specified",
          ),
          errand.pickup_latitude,
          errand.pickup_longitude,
          getLocationLabel(
            errand.destination_location,
            errand.destination_latitude,
            errand.destination_longitude,
            "Destination not specified",
          ),
          errand.destination_latitude,
          errand.destination_longitude,
          errand.distance_km,
          errand.provider_earning_amount,
          (errand.currency || "KES").trim(),
          JSON.stringify({
            source: "customer_errands",
            customerErrandRef: errand.id,
            customerCategory: errand.category,
            runnerServiceType: serviceType,
          }),
        ],
      );

      let job = projected.rows[0];

      // An accepted job is intentionally excluded from the upsert above.
      // Read it without mutating its status so duplicate polls remain safe.
      if (!job) {
        const existing = await client.query<{
          id: string;
          status: string;
          accepted_runner_id: string | null;
        }>(
          `SELECT id, status, accepted_runner_id
           FROM public.runner_jobs
           WHERE customer_errand_ref = $1
           LIMIT 1`,
          [errand.id],
        );
        job = existing.rows[0];
      }

      if (
        !canReceiveOffer ||
        !runnerServices.has(serviceType) ||
        !job ||
        job.status !== "offered" ||
        job.accepted_runner_id !== null
      ) {
        continue;
      }

      await client.query(
        `INSERT INTO public.runner_job_offers (
           job_id,
           runner_id,
           offer_status,
           expires_at
         )
         VALUES ($1, $2, 'offered', now() + interval '15 minutes')
         ON CONFLICT (job_id, runner_id)
         DO UPDATE SET
           offer_status = 'offered',
           created_at = now(),
           expires_at = now() + interval '15 minutes',
           responded_at = NULL
         WHERE public.runner_job_offers.offer_status = 'expired'
            OR (
              public.runner_job_offers.offer_status = 'offered'
              AND public.runner_job_offers.expires_at <= now()
            )`,
        [job.id, runnerId],
      );
    }

    await client.query("COMMIT");
  } catch (cause) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw cause;
  } finally {
    client.release();
  }
}

function shapeJob(row: RunnerJobRow) {
  return {
    id: row.id,
    publicCode: row.public_code,
    title: row.title,
    category: row.category,
    description: row.description,

    pickupLabel: row.pickup_label,
    pickupCoordinates: {
      latitude: nullableNumber(row.pickup_latitude),
      longitude: nullableNumber(row.pickup_longitude),
    },

    destinationLabel: row.destination_label,
    destinationCoordinates: {
      latitude: nullableNumber(row.destination_latitude),
      longitude: nullableNumber(row.destination_longitude),
    },

    distanceKm: nullableNumber(row.distance_km),
    runnerPayoutAmount: nullableNumber(
      row.runner_payout_amount,
    ),
    currency: row.currency,
    status: row.status,
    offerExpiresAt: row.offer_expires_at,
  };
}

export async function GET(request: Request) {
  try {
    const auth = await authenticateRunner(request);

    if (auth.response) {
      return auth.response;
    }

    // Reconcile pending Customer errands into this Runner's marketplace
    // before reading the offers shown on the dashboard.
    await syncCustomerErrandsForRunner(auth.runner.id);

    const [offers, active] = await Promise.all([
      query<RunnerJobRow>(
        `SELECT
           j.id,
           j.public_code,
           j.title,
           j.category,
           j.description,

           j.pickup_label,
           j.pickup_latitude,
           j.pickup_longitude,

           j.destination_label,
           j.destination_latitude,
           j.destination_longitude,

           j.distance_km,
           j.runner_payout_amount,
           j.currency,
           j.status,

           o.expires_at AS offer_expires_at

         FROM public.runner_job_offers AS o

         JOIN public.runner_jobs AS j
           ON j.id = o.job_id

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
           j.id,
           j.public_code,
           j.title,
           j.category,
           j.description,

           j.pickup_label,
           j.pickup_latitude,
           j.pickup_longitude,

           j.destination_label,
           j.destination_latitude,
           j.destination_longitude,

           j.distance_km,
           j.runner_payout_amount,
           j.currency,
           j.status,

           NULL::timestamptz AS offer_expires_at

         FROM public.runner_jobs AS j

         WHERE j.accepted_runner_id = $1
           AND j.status IN (
             'accepted',
             'in_progress',
             'completion_submitted'
           )

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
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      },
    );
  } catch {
    return errorResponse(
      "Your errand list could not be loaded.",
      503,
    );
  }
}