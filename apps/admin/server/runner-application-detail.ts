
import { NextResponse } from "next/server";

import { authenticateAdmin } from "@/apps/admin/server/auth";
import { query as runnerQuery } from "@/apps/runner/server/db";
import { createR2ReadUrl } from "@/lib/storage/r2";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DOCUMENT_URL_EXPIRY_SECONDS = 60 * 60;

type ApplicationDetailRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone_e164: string;
  account_status: string;
  verification_status: string;
  service_area: string | null;
  vehicle_type: string | null;
  vehicle_registration: string | null;
  created_at: string;
  updated_at: string;
};

type CategoryRow = {
  category_key: string;
  label: string | null;
};

type DocumentRow = {
  id: string;
  document_type: string;
  category_key: string | null;
  category_label: string | null;
  requirement_key: string | null;
  requirement_title: string | null;
  requirement_instructions: string | null;
  requirement_is_required: boolean | null;
  review_status: string;
  rejection_reason: string | null;
  storage_key: string;
  submitted_at: string;
  reviewed_at: string | null;
};

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

export async function getRunnerApplicationDetail(
  request: Request,
  runnerId: string,
) {
  const auth = await authenticateAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  if (!UUID_PATTERN.test(runnerId)) {
    return errorResponse(
      "A valid Runner application ID is required.",
      400,
    );
  }

  try {
    const applicationResult =
      await runnerQuery<ApplicationDetailRow>(
        `SELECT
           a.id,
           a.full_name,
           a.email,
           a.phone_e164,
           a.account_status,
           a.verification_status,
           p.service_area,
           p.vehicle_type,
           p.vehicle_registration,
           a.created_at,
           a.updated_at

         FROM public.runner_accounts AS a

         LEFT JOIN public.runner_profiles AS p
           ON p.runner_id = a.id

         WHERE a.id = $1
         LIMIT 1`,
        [runnerId],
      );

    const application = applicationResult.rows[0];

    if (!application) {
      return errorResponse(
        "Runner application was not found.",
        404,
      );
    }

    const [categoriesResult, documentsResult] =
      await Promise.all([
        runnerQuery<CategoryRow>(
          `SELECT
             c.category_key,
             s.label

           FROM public.runner_account_service_categories AS c

           LEFT JOIN public.runner_service_categories AS s
             ON s.category_key = c.category_key

           WHERE c.runner_id = $1

           ORDER BY
             s.display_order NULLS LAST,
             c.category_key`,
          [runnerId],
        ),

        runnerQuery<DocumentRow>(
          `SELECT
             d.id,
             d.document_type,
             d.category_key,
             c.label AS category_label,
             d.requirement_key,
             r.title AS requirement_title,
             r.instructions AS requirement_instructions,
             r.is_required AS requirement_is_required,
             d.review_status,
             d.rejection_reason,
             d.storage_key,
             d.submitted_at,
             d.reviewed_at

           FROM public.runner_verification_documents AS d

           LEFT JOIN public.runner_onboarding_document_requirements AS r
             ON r.requirement_key = d.requirement_key

           LEFT JOIN public.runner_service_categories AS c
             ON c.category_key = d.category_key

           WHERE d.runner_id = $1

           ORDER BY
             d.submitted_at DESC,
             d.id DESC`,
          [runnerId],
        ),
      ]);

    const documents = await Promise.all(
      documentsResult.rows.map(async (document) => {
        const fileUrl = await createR2ReadUrl(
          document.storage_key,
        );

        return {
          id: document.id,
          documentType: document.document_type,
          categoryKey: document.category_key,
          categoryLabel: document.category_label,
          requirementKey: document.requirement_key,
          requirementTitle: document.requirement_title,
          requirementInstructions:
            document.requirement_instructions,
          required: document.requirement_is_required,
          reviewStatus: document.review_status,
          rejectionReason: document.rejection_reason,
          submittedAt: document.submitted_at,
          reviewedAt: document.reviewed_at,
          fileUrl,
          fileUrlExpiresInSeconds:
            DOCUMENT_URL_EXPIRY_SECONDS,
        };
      }),
    );

    return NextResponse.json(
      {
        ok: true,
        application: {
          id: application.id,
          fullName: application.full_name,
          email: application.email,
          phone: application.phone_e164,
          accountStatus: application.account_status,
          verificationStatus:
            application.verification_status,
          serviceArea: application.service_area,
          vehicleType: application.vehicle_type,
          vehicleRegistration:
            application.vehicle_registration,
          selectedCategories:
            categoriesResult.rows.map((category) => ({
              key: category.category_key,
              label: category.label,
            })),
          documents,
          createdAt: application.created_at,
          updatedAt: application.updated_at,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      },
    );
  } catch (cause) {
    console.error(
      "[SaMi Admin Runner application detail] Read failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Runner application details could not be loaded.",
      503,
    );
  }
}
