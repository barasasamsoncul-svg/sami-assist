import { NextResponse } from "next/server";

import {
  authenticateAdmin,
  isSameOrigin,
} from "@/apps/admin/server/auth";
import { databasePool as runnerDatabasePool, query as runnerQuery } from "@/apps/runner/server/db";
import { ensureErrandLocationSchema } from "@/lib/errand-location-schema";
import { databasePool as customerDatabasePool, query as customerQuery } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CustomerErrandRow = {
  id: string;
  public_code: string;
  title: string;
  category: string;
  description: string;
  status: string;
  provider_id: string | null;
  service_area: string | null;
  pickup_location: string | null;
  pickup_latitude: number | string | null;
  pickup_longitude: number | string | null;
  destination_location: string | null;
  destination_latitude: number | string | null;
  destination_longitude: number | string | null;
  distance_km: number | string | null;
  service_fee_amount: number | string | null;
  provider_earning_amount: number | string | null;
  currency: string | null;
  payment_status: string;
  created_at: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
};

type RunnerDirectoryRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone_e164: string | null;
  service_area: string | null;
  vehicle_type: string | null;
  service_types: string[];
  is_online: boolean;
  has_active_job: boolean;
};

type AssignmentRow = {
  customer_errand_ref: string;
  job_status: string;
  accepted_runner_id: string | null;
  accepted_runner_name: string | null;
  offered_runner_id: string | null;
  offered_runner_name: string | null;
  offer_status: string | null;
  offer_expires_at: string | null;
  completion_submitted_at: string | null;
  completed_at: string | null;
};

type AssignableErrandRow = CustomerErrandRow;

class AdminErrandError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "AdminErrandError";
    this.status = status;
  }
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json(
    { ok: false, error: message },
    {
      status,
      headers: { "Cache-Control": "no-store, private" },
    },
  );
}

function cleanText(value: unknown, max = 1000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toNullableNumber(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getRunnerServiceType(category: string): "shop_deliver" | "pickup_deliver" {
  const normalized = category.trim().toLowerCase();

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
  latitude: number | string | null,
  longitude: number | string | null,
  fallback: string,
): string {
  const supplied = label?.trim();
  if (supplied) return supplied;

  const lat = toNullableNumber(latitude);
  const lng = toNullableNumber(longitude);

  if (lat !== null && lng !== null) {
    return lat.toFixed(5) + ", " + lng.toFixed(5);
  }

  return fallback;
}

function shapeErrand(
  row: CustomerErrandRow,
  assignment: AssignmentRow | undefined,
) {
  return {
    id: row.id,
    publicCode: row.public_code,
    title: row.title,
    category: row.category,
    runnerServiceType: getRunnerServiceType(row.category),
    description: row.description,
    status: row.status,
    hasLegacyProviderAssignment: Boolean(row.provider_id),
    serviceArea: row.service_area,
    pickupLocation: row.pickup_location,
    pickupCoordinates: {
      latitude: toNullableNumber(row.pickup_latitude),
      longitude: toNullableNumber(row.pickup_longitude),
    },
    destinationLocation: row.destination_location,
    destinationCoordinates: {
      latitude: toNullableNumber(row.destination_latitude),
      longitude: toNullableNumber(row.destination_longitude),
    },
    distanceKm: toNullableNumber(row.distance_km),
    serviceFeeAmount: toNullableNumber(row.service_fee_amount),
    runnerPayoutAmount: toNullableNumber(row.provider_earning_amount),
    currency: (row.currency || "KES").trim(),
    paymentStatus: row.payment_status,
    createdAt: row.created_at,
    customer: {
      name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone,
    },
    assignment: assignment
      ? {
          jobStatus: assignment.job_status,
          runnerId:
            assignment.accepted_runner_id || assignment.offered_runner_id,
          runnerName:
            assignment.accepted_runner_name || assignment.offered_runner_name,
          offerStatus: assignment.offer_status,
          offerExpiresAt: assignment.offer_expires_at,
          completionSubmittedAt: assignment.completion_submitted_at,
          completedAt: assignment.completed_at,
        }
      : null,
  };
}

async function listErrands(request: Request) {
  const auth = await authenticateAdmin(request);
  if (auth.response) return auth.response;

  const params = new URL(request.url).searchParams;
  const requestedFilter = cleanText(params.get("status"), 20).toLowerCase();
  const statusFilter = requestedFilter === "requested" ? "requested" : "all";

  try {
    await ensureErrandLocationSchema();

    const result = await customerQuery<CustomerErrandRow>(
      `SELECT
         e.id::text AS id,
         e.public_code,
         e.title,
         e.category,
         e.description,
         e.status,
         e.provider_id::text AS provider_id,
         e.service_area,
         e.pickup_location,
         e.pickup_latitude,
         e.pickup_longitude,
         e.destination_location,
         e.destination_latitude,
         e.destination_longitude,
         e.distance_km,
         e.service_fee_amount,
         e.provider_earning_amount,
         e.currency,
         e.payment_status,
         e.created_at::text AS created_at,
         c.full_name AS customer_name,
         c.email AS customer_email,
         c.phone AS customer_phone
       FROM public.errands AS e
       JOIN public.users AS c
         ON c.id = e.customer_id
       WHERE e.created_at >= now() - interval '90 days'
         AND ($1::text = 'all' OR e.status = $1)
       ORDER BY
         CASE e.status
           WHEN 'requested' THEN 0
           WHEN 'assigned' THEN 1
           WHEN 'accepted' THEN 2
           WHEN 'in_progress' THEN 3
           WHEN 'completion_submitted' THEN 4
           WHEN 'disputed' THEN 5
           ELSE 6
         END,
         e.created_at DESC
       LIMIT 200`,
      [statusFilter],
    );

    const errands = result.rows;
    const refs = errands.map((errand) => errand.id);

    try {
      const [runnerResult, assignmentResult] = await Promise.all([
        runnerQuery<RunnerDirectoryRow>(
          `SELECT
             a.id::text AS id,
             a.full_name,
             a.email,
             a.phone_e164,
             p.service_area,
             p.vehicle_type,
             COALESCE(
               array_agg(DISTINCT sc.category_key)
                 FILTER (WHERE sc.category_key IS NOT NULL),
               ARRAY[]::text[]
             ) AS service_types,
             COALESCE(v.is_online, false) AS is_online,
             EXISTS (
               SELECT 1
               FROM public.runner_jobs AS active
               WHERE active.accepted_runner_id = a.id
                 AND active.status IN (
                   'accepted',
                   'in_progress',
                   'completion_submitted'
                 )
             ) AS has_active_job
           FROM public.runner_accounts AS a
           LEFT JOIN public.runner_profiles AS p
             ON p.runner_id = a.id
           LEFT JOIN public.runner_availability AS v
             ON v.runner_id = a.id
           LEFT JOIN public.runner_account_service_categories AS sc
             ON sc.runner_id = a.id
           WHERE a.account_status = 'active'
             AND a.verification_status = 'approved'
           GROUP BY
             a.id,
             a.full_name,
             a.email,
             a.phone_e164,
             p.service_area,
             p.vehicle_type,
             v.is_online
           ORDER BY a.full_name NULLS LAST`,
        ),
        refs.length > 0
          ? runnerQuery<AssignmentRow>(
              `SELECT
                 j.customer_errand_ref,
                 j.status AS job_status,
                 j.completion_submitted_at::text AS completion_submitted_at,
                 j.completed_at::text AS completed_at,
                 j.accepted_runner_id::text AS accepted_runner_id,
                 accepted.full_name AS accepted_runner_name,
                 latest_offer.runner_id::text AS offered_runner_id,
                 latest_offer.full_name AS offered_runner_name,
                 latest_offer.offer_status,
                 latest_offer.expires_at::text AS offer_expires_at
               FROM public.runner_jobs AS j
               LEFT JOIN public.runner_accounts AS accepted
                 ON accepted.id = j.accepted_runner_id
               LEFT JOIN LATERAL (
                 SELECT
                   o.runner_id,
                   o.offer_status,
                   o.expires_at,
                   a.full_name
                 FROM public.runner_job_offers AS o
                 JOIN public.runner_accounts AS a
                   ON a.id = o.runner_id
                 WHERE o.job_id = j.id
                 ORDER BY o.created_at DESC
                 LIMIT 1
               ) AS latest_offer ON true
               WHERE j.customer_errand_ref = ANY($1::text[])`,
              [refs],
            )
          : Promise.resolve({ rows: [] as AssignmentRow[] }),
      ]);

      const assignmentsByErrand = new Map(
        assignmentResult.rows.map((row) => [
          row.customer_errand_ref,
          row,
        ]),
      );

      return NextResponse.json(
        {
          ok: true,
          filter: statusFilter,
          errands: errands.map((row) =>
            shapeErrand(row, assignmentsByErrand.get(row.id)),
          ),
          runners: runnerResult.rows.map((runner) => ({
            id: runner.id,
            fullName: runner.full_name,
            email: runner.email,
            phone: runner.phone_e164,
            serviceArea: runner.service_area,
            vehicleType: runner.vehicle_type,
            serviceTypes: runner.service_types || [],
            isOnline: runner.is_online,
            hasActiveJob: runner.has_active_job,
          })),
          runnerError: null,
        },
        {
          headers: { "Cache-Control": "no-store, private" },
        },
      );
    } catch (cause) {
      console.error(
        "[SaMi Admin errands] Runner availability lookup failed.",
        cause instanceof Error ? cause.message : "unknown error",
      );

      return NextResponse.json(
        {
          ok: true,
          filter: statusFilter,
          errands: errands.map((row) => shapeErrand(row, undefined)),
          runners: [],
          runnerError:
            "Errands are visible, but the Runner directory is temporarily unavailable. Check the Runner database connection.",
        },
        {
          headers: { "Cache-Control": "no-store, private" },
        },
      );
    }
  } catch (cause) {
    console.error(
      "[SaMi Admin errands] Customer errand lookup failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );

    return errorResponse("Customer errands could not be loaded.", 503);
  }
}

async function assignErrand(request: Request) {
  if (!isSameOrigin(request)) {
    return errorResponse("Cross-origin assignment requests are not allowed.", 403);
  }

  const auth = await authenticateAdmin(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("A valid assignment request is required.");
  }

  const input = body as Record<string, unknown>;
  const errandId = cleanText(input.errandId, 80);
  const runnerId = cleanText(input.runnerId, 80);
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(errandId)) {
    return errorResponse("A valid errand identifier is required.");
  }
  if (!uuidPattern.test(runnerId)) {
    return errorResponse("Choose a valid Runner.");
  }

  let errand: AssignableErrandRow;

  try {
    await ensureErrandLocationSchema();

    const result = await customerQuery<AssignableErrandRow>(
      `SELECT
         e.id::text AS id,
         e.public_code,
         e.title,
         e.category,
         e.description,
         e.status,
         e.provider_id::text AS provider_id,
         e.service_area,
         e.pickup_location,
         e.pickup_latitude,
         e.pickup_longitude,
         e.destination_location,
         e.destination_latitude,
         e.destination_longitude,
         e.distance_km,
         e.service_fee_amount,
         e.provider_earning_amount,
         e.currency,
         e.payment_status,
         e.created_at::text AS created_at,
         c.full_name AS customer_name,
         c.email AS customer_email,
         c.phone AS customer_phone
       FROM public.errands AS e
       JOIN public.users AS c
         ON c.id = e.customer_id
       WHERE e.id = $1
       LIMIT 1`,
      [errandId],
    );

    errand = result.rows[0];

    if (!errand) {
      throw new AdminErrandError("The customer errand was not found.", 404);
    }
    if (errand.status !== "requested" || errand.provider_id) {
      throw new AdminErrandError(
        "This errand is no longer waiting for Admin assignment. Refresh the list.",
        409,
      );
    }
  } catch (cause) {
    if (cause instanceof AdminErrandError) {
      return errorResponse(cause.message, cause.status);
    }

    console.error(
      "[SaMi Admin errands] Assignment source lookup failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );
    return errorResponse("The customer errand could not be checked.", 503);
  }

  const serviceType = getRunnerServiceType(errand.category);
  let client: import("pg").PoolClient;

  try {
    client = await runnerDatabasePool().connect();
  } catch (cause) {
    console.error(
      "[SaMi Admin errands] Runner database connection failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );
    return errorResponse("The Runner service is temporarily unavailable.", 503);
  }

  try {
    await client.query("BEGIN");

    const runnerResult = await client.query<{
      id: string;
      full_name: string | null;
      is_online: boolean;
      service_area: string | null;
      vehicle_type: string | null;
    }>(
      `SELECT
         a.id::text AS id,
         a.full_name,
         COALESCE(v.is_online, false) AS is_online,
         p.service_area,
         p.vehicle_type
       FROM public.runner_accounts AS a
       LEFT JOIN public.runner_availability AS v
         ON v.runner_id = a.id
       LEFT JOIN public.runner_profiles AS p
         ON p.runner_id = a.id
       WHERE a.id = $1
         AND a.account_status = 'active'
         AND a.verification_status = 'approved'
         AND COALESCE(v.is_online, false) = true
         AND EXISTS (
           SELECT 1
           FROM public.runner_account_service_categories AS sc
           WHERE sc.runner_id = a.id
             AND sc.category_key = $2
         )
       FOR UPDATE OF a`,
      [runnerId, serviceType],
    );

    const runner = runnerResult.rows[0];
    if (!runner) {
      throw new AdminErrandError(
        "Choose an approved, online Runner whose selected service matches this errand.",
        409,
      );
    }

    const activeJob = await client.query<{ id: string }>(
      `SELECT id
       FROM public.runner_jobs
       WHERE accepted_runner_id = $1
         AND status IN ('accepted', 'in_progress', 'completion_submitted')
       LIMIT 1
       FOR UPDATE`,
      [runnerId],
    );

    if (activeJob.rows[0]) {
      throw new AdminErrandError(
        "This Runner already has an active errand. Choose another available Runner.",
        409,
      );
    }

    const existingJob = await client.query<{
      id: string;
      status: string;
      accepted_runner_id: string | null;
    }>(
      `SELECT id, status, accepted_runner_id
       FROM public.runner_jobs
       WHERE customer_errand_ref = $1
       LIMIT 1
       FOR UPDATE`,
      [errand.id],
    );

    const existing = existingJob.rows[0];
    if (
      existing &&
      (existing.status !== "offered" || existing.accepted_runner_id !== null)
    ) {
      throw new AdminErrandError(
        "This errand has already been accepted or closed in the Runner app.",
        409,
      );
    }

    const projected = await client.query<{ id: string }>(
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
         status = 'offered',
         offered_at = now(),
         accepted_at = NULL,
         accepted_runner_id = NULL,
         source_projection = EXCLUDED.source_projection,
         updated_at = now()
       WHERE public.runner_jobs.status = 'offered'
         AND public.runner_jobs.accepted_runner_id IS NULL
       RETURNING id`,
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
        toNullableNumber(errand.pickup_latitude),
        toNullableNumber(errand.pickup_longitude),
        getLocationLabel(
          errand.destination_location,
          errand.destination_latitude,
          errand.destination_longitude,
          "Destination not specified",
        ),
        toNullableNumber(errand.destination_latitude),
        toNullableNumber(errand.destination_longitude),
        toNullableNumber(errand.distance_km),
        toNullableNumber(errand.provider_earning_amount),
        (errand.currency || "KES").trim(),
        JSON.stringify({
          source: "admin_assignment",
          customerErrandRef: errand.id,
          customerCategory: errand.category,
          runnerServiceType: serviceType,
          assignedByAdminId: auth.user.id,
        }),
      ],
    );

    const jobId = projected.rows[0]?.id;
    if (!jobId) {
      throw new AdminErrandError(
        "This errand can no longer be offered. Refresh the Admin list.",
        409,
      );
    }

    await client.query(
      `UPDATE public.runner_job_offers
       SET
         offer_status = 'withdrawn',
         responded_at = COALESCE(responded_at, now())
       WHERE job_id = $1
         AND runner_id <> $2
         AND offer_status = 'offered'`,
      [jobId, runnerId],
    );

    const offer = await client.query(
      `INSERT INTO public.runner_job_offers (
         job_id,
         runner_id,
         offer_status,
         expires_at
       )
       VALUES ($1, $2, 'offered', now() + interval '30 minutes')
       ON CONFLICT (job_id, runner_id)
       DO UPDATE SET
         offer_status = 'offered',
         created_at = now(),
         expires_at = now() + interval '30 minutes',
         responded_at = NULL
       WHERE public.runner_job_offers.offer_status <> 'accepted'
       RETURNING id`,
      [jobId, runnerId],
    );

    if (!offer.rowCount) {
      throw new AdminErrandError(
        "This Runner has already responded to the offer. Refresh and choose another Runner.",
        409,
      );
    }

    await client.query(
      `INSERT INTO public.runner_job_events (
         job_id,
         runner_id,
         event_type,
         from_status,
         to_status,
         note,
         metadata
       )
       VALUES ($1, $2, 'admin_assigned', 'offered', 'offered', $3, $4::jsonb)`,
      [
        jobId,
        runnerId,
        "Admin assigned this customer errand to the Runner.",
        JSON.stringify({
          adminId: auth.user.id,
          customerErrandRef: errand.id,
          serviceType,
        }),
      ],
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        ok: true,
        message: "The errand offer was sent to " + (runner.full_name || "the selected Runner") + ".",
        runnerName: runner.full_name,
        runnerId,
        jobId,
        expiresInMinutes: 30,
      },
      {
        headers: { "Cache-Control": "no-store, private" },
      },
    );
  } catch (cause) {
    await client.query("ROLLBACK").catch(() => undefined);

    if (cause instanceof AdminErrandError) {
      return errorResponse(cause.message, cause.status);
    }

    console.error(
      "[SaMi Admin errands] Runner assignment failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );

    return errorResponse("The errand could not be assigned to the Runner.", 503);
  } finally {
    client.release();
  }
}


async function confirmErrandCompletion(
  request: Request,
  input: Record<string, unknown>,
) {
  if (!isSameOrigin(request)) {
    return errorResponse("Cross-origin completion requests are not allowed.", 403);
  }

  const auth = await authenticateAdmin(request);
  if (auth.response) return auth.response;

  const errandId = cleanText(input.errandId, 80);
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(errandId)) {
    return errorResponse("A valid errand identifier is required.");
  }

  let customerClient: import("pg").PoolClient | null = null;
  let runnerClient: import("pg").PoolClient | null = null;
  let customerTransactionOpen = false;
  let runnerTransactionOpen = false;
  let customerCommitted = false;
  let runnerCommitted = false;

  try {
    customerClient = await customerDatabasePool().connect();
    runnerClient = await runnerDatabasePool().connect();

    await customerClient.query("BEGIN");
    customerTransactionOpen = true;
    await runnerClient.query("BEGIN");
    runnerTransactionOpen = true;

    const jobResult = await runnerClient.query<{
      id: string;
      public_code: string;
      status: string;
      accepted_runner_id: string | null;
    }>(
      `SELECT
         id::text AS id,
         public_code,
         status,
         accepted_runner_id::text AS accepted_runner_id
       FROM public.runner_jobs
       WHERE customer_errand_ref = $1
         AND source_projection->>'source' = 'admin_assignment'
       LIMIT 1
       FOR UPDATE`,
      [errandId],
    );

    const job = jobResult.rows[0];
    if (!job) {
      throw new AdminErrandError(
        "No Admin-assigned Runner job was found for this errand.",
        404,
      );
    }

    if (!job.accepted_runner_id) {
      throw new AdminErrandError(
        "The Runner has not accepted this errand, so its completion cannot be confirmed.",
        409,
      );
    }

    if (!["completion_submitted", "completed"].includes(job.status)) {
      throw new AdminErrandError(
        "The Runner has not submitted this errand for completion review.",
        409,
      );
    }

    const errandResult = await customerClient.query<{
      id: string;
      public_code: string;
      status: string;
    }>(
      `SELECT id::text AS id, public_code, status
       FROM public.errands
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [errandId],
    );

    const errand = errandResult.rows[0];
    if (!errand) {
      throw new AdminErrandError("The customer errand was not found.", 404);
    }

    const alreadyCompleted = errand.status === "completed";
    const allowedCustomerStatuses = new Set([
      "requested",
      "assigned",
      "accepted",
      "in_progress",
      "completion_submitted",
      "completed",
    ]);

    if (!allowedCustomerStatuses.has(errand.status)) {
      throw new AdminErrandError(
        "This errand is cancelled or disputed and cannot be confirmed as completed.",
        409,
      );
    }

    if (!alreadyCompleted) {
      await customerClient.query(
        `UPDATE public.errands
         SET status = 'completed',
             completed_at = COALESCE(completed_at, now()),
             customer_confirmed_at = COALESCE(customer_confirmed_at, now()),
             version = version + 1,
             updated_at = now()
         WHERE id = $1`,
        [errandId],
      );

      await customerClient.query(
        `INSERT INTO public.errand_events (
           errand_id,
           actor_id,
           event_type,
           from_status,
           to_status,
           note,
           metadata
         )
         VALUES ($1, NULL, 'admin_confirmed_completion', $2, 'completed', $3, $4::jsonb)`,
        [
          errandId,
          errand.status,
          "Admin confirmed the Runner's submitted completion.",
          JSON.stringify({
            adminId: auth.user.id,
            runnerId: job.accepted_runner_id,
            runnerJobId: job.id,
            source: "admin_completion_review",
          }),
        ],
      );
    }

    await customerClient.query(
      `INSERT INTO public.customer_errand_outbox (
         errand_id,
         event_type,
         payload
       )
       VALUES ($1, 'errand.customer_confirmed', $2::jsonb)
       ON CONFLICT (errand_id, event_type, event_version) DO NOTHING`,
      [
        errandId,
        JSON.stringify({
          eventType: "errand.customer_confirmed",
          customerErrandRef: errandId,
          publicCode: errand.public_code,
          status: "completed",
          runnerRef: job.accepted_runner_id,
          confirmedBy: "admin",
          adminId: auth.user.id,
        }),
      ],
    );

    if (job.status !== "completed") {
      await runnerClient.query(
        `UPDATE public.runner_jobs
         SET status = 'completed',
             completed_at = COALESCE(completed_at, now()),
             updated_at = now()
         WHERE id = $1 AND status = 'completion_submitted'`,
        [job.id],
      );

      await runnerClient.query(
        `INSERT INTO public.runner_job_events (
           job_id,
           runner_id,
           event_type,
           from_status,
           to_status,
           note,
           metadata
         )
         VALUES ($1, $2, 'admin_confirmed_completion', 'completion_submitted', 'completed', $3, $4::jsonb)`,
        [
          job.id,
          job.accepted_runner_id,
          "Admin confirmed the submitted errand completion.",
          JSON.stringify({
            adminId: auth.user.id,
            customerErrandRef: errandId,
          }),
        ],
      );

      await runnerClient.query(
        "DELETE FROM public.runner_live_locations WHERE runner_id = $1 AND job_id = $2",
        [job.accepted_runner_id, job.id],
      );
    }

    // The Customer record is committed first. If the Runner commit fails,
    // this endpoint is safe to retry: the completed Customer status is
    // idempotent, while the Runner job can still advance from submitted.
    await customerClient.query("COMMIT");
    customerTransactionOpen = false;
    customerCommitted = true;

    await runnerClient.query("COMMIT");
    runnerTransactionOpen = false;
    runnerCommitted = true;

    return NextResponse.json(
      {
        ok: true,
        status: "completed",
        message:
          "Errand " + errand.public_code + " is confirmed complete by Admin.",
        runnerId: job.accepted_runner_id,
        jobId: job.id,
      },
      {
        headers: { "Cache-Control": "no-store, private" },
      },
    );
  } catch (cause) {
    if (customerTransactionOpen && customerClient) {
      await customerClient.query("ROLLBACK").catch(() => undefined);
    }
    if (runnerTransactionOpen && runnerClient) {
      await runnerClient.query("ROLLBACK").catch(() => undefined);
    }

    if (cause instanceof AdminErrandError) {
      return errorResponse(cause.message, cause.status);
    }

    console.error(
      "[SaMi Admin errands] Completion confirmation failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );

    if (customerCommitted && !runnerCommitted) {
      return errorResponse(
        "The Customer errand is marked complete, but the Runner record still needs finalizing. Refresh and press Confirm completion again to reconcile it.",
        503,
      );
    }

    return errorResponse(
      "The errand completion could not be confirmed. No final confirmation was returned.",
      503,
    );
  } finally {
    customerClient?.release();
    runnerClient?.release();
  }
}

export async function GET(request: Request) {
  return listErrands(request);
}

export async function POST(request: Request) {
  const body = await request.clone().json().catch(() => null);
  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    (body as Record<string, unknown>).action === "confirm_completion"
  ) {
    return confirmErrandCompletion(request, body as Record<string, unknown>);
  }

  return assignErrand(request);
}