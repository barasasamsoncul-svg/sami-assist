
import { NextResponse } from "next/server";

import { authenticateAdmin } from "@/apps/admin/server/auth";
import { query as runnerQuery } from "@/apps/runner/server/db";

type ApplicationRow = {
  id: string;
  email: string | null;
  phone_e164: string | null;
  full_name: string | null;
  account_status: string;
  verification_status: string;
  service_area: string | null;
  vehicle_type: string | null;
  vehicle_registration: string | null;
  selected_categories: string[];
  document_count: number;
  pending_document_count: number;
  rejected_document_count: number;
  latest_document_submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

const APPLICATION_STATUSES = new Set([
  "pending",
  "submitted",
  "approved",
  "rejected",
  "all",
]);

function errorResponse(message: string, status = 400) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store, private",
      },
    },
  );
}

export async function listRunnerApplications(
  request: Request,
) {
  const auth = await authenticateAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  const params = new URL(request.url).searchParams;

  const status = (
    params.get("status") || "submitted"
  ).trim().toLowerCase();

  if (!APPLICATION_STATUSES.has(status)) {
    return errorResponse(
      "Choose a valid application status filter.",
    );
  }

  const requestedLimit = Number(
    params.get("limit") || 50,
  );

  const limit = Number.isInteger(requestedLimit)
    ? Math.min(100, Math.max(1, requestedLimit))
    : 50;

  try {
    const result = await runnerQuery<ApplicationRow>(
      `SELECT
         a.id,
         a.email,
         a.phone_e164,
         a.full_name,
         a.account_status,
         a.verification_status,
         p.service_area,
         p.vehicle_type,
         p.vehicle_registration,

         COALESCE(
           (
             SELECT array_agg(
               c.category_key
               ORDER BY c.category_key
             )
             FROM public.runner_account_service_categories AS c
             WHERE c.runner_id = a.id
           ),
           ARRAY[]::text[]
         ) AS selected_categories,

         COALESCE(d.document_count, 0)::int
           AS document_count,

         COALESCE(d.pending_document_count, 0)::int
           AS pending_document_count,

         COALESCE(d.rejected_document_count, 0)::int
           AS rejected_document_count,

         d.latest_document_submitted_at,

         a.created_at,
         a.updated_at

       FROM public.runner_accounts AS a

       LEFT JOIN public.runner_profiles AS p
         ON p.runner_id = a.id

       LEFT JOIN LATERAL (
         SELECT
           count(*)::int AS document_count,

           count(*) FILTER (
             WHERE review_status = 'pending'
           )::int AS pending_document_count,

           count(*) FILTER (
             WHERE review_status = 'rejected'
           )::int AS rejected_document_count,

           max(submitted_at) AS latest_document_submitted_at

         FROM public.runner_verification_documents
         WHERE runner_id = a.id
       ) AS d ON true

       WHERE (
         $1::text = 'all'
         OR a.verification_status = $1
       )

       ORDER BY
         CASE
           WHEN a.verification_status = 'submitted'
             THEN 0
           ELSE 1
         END,
         a.updated_at DESC

       LIMIT $2`,
      [status, limit],
    );

    const applications = result.rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone_e164,
      accountStatus: row.account_status,
      verificationStatus: row.verification_status,
      serviceArea: row.service_area,
      vehicleType: row.vehicle_type,
      vehicleRegistration: row.vehicle_registration,
      selectedCategories: row.selected_categories || [],
      documentCount: Number(row.document_count),
      pendingDocumentCount: Number(
        row.pending_document_count,
      ),
      rejectedDocumentCount: Number(
        row.rejected_document_count,
      ),
      latestDocumentSubmittedAt:
        row.latest_document_submitted_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json(
      {
        ok: true,
        filter: status,
        count: applications.length,
        applications,
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      },
    );
  } catch (cause) {
    console.error(
      "[SaMi Admin Runner applications] Read failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Runner applications could not be loaded.",
      503,
    );
  }
}
