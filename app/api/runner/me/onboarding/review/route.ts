import { NextResponse } from "next/server";

import { authenticateRunner } from "@/apps/runner/server/auth";
import { query } from "@/apps/runner/server/db";
import { errorResponse } from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApplicationReviewRow = {
  decision: "approved" | "rejected";
  reason: string | null;
  created_at: string;
};

type DocumentReviewRow = {
  review_id: string;
  document_id: string;
  requirement_key: string | null;
  requirement_title: string | null;
  decision:
    | "approved"
    | "rejected"
    | "resubmission_required";
  reason: string | null;
  reviewed_at: string;
  current_status: string | null;
  file_removed_from_storage: boolean;
  deletion_pending: boolean;
};

export async function GET(request: Request) {
  try {
    const auth = await authenticateRunner(request, {
      allowRestricted: true,
    });

    if (auth.response) {
      return auth.response;
    }

    const runnerId = auth.runner.id;

    const [applicationResult, documentResult] =
      await Promise.all([
        query<ApplicationReviewRow>(
          `SELECT
             decision,
             reason,
             created_at
           FROM public.runner_admin_application_reviews
           WHERE runner_id = $1
           ORDER BY created_at DESC, id DESC
           LIMIT 1`,
          [runnerId],
        ),

        query<DocumentReviewRow>(
          `SELECT
             review.id AS review_id,
             review.document_id,
             document.requirement_key,
             requirement.title AS requirement_title,
             review.new_review_status AS decision,
             review.rejection_reason AS reason,
             review.created_at AS reviewed_at,
             document.review_status AS current_status,
             (
               document.storage_key IS NULL
             ) AS file_removed_from_storage,
             EXISTS (
               SELECT 1
               FROM public.runner_document_storage_deletions AS deletion
               WHERE deletion.document_id = document.id
                 AND deletion.deleted_at IS NULL
             ) AS deletion_pending

           FROM public.runner_admin_document_reviews AS review

           LEFT JOIN public.runner_verification_documents AS document
             ON document.id = review.document_id
            AND document.runner_id = review.runner_id

           LEFT JOIN public.runner_onboarding_document_requirements AS requirement
             ON requirement.requirement_key = document.requirement_key

           WHERE review.runner_id = $1

           ORDER BY
             review.created_at DESC,
             review.id DESC

           LIMIT 50`,
          [runnerId],
        ),
      ]);

    const applicationReview =
      applicationResult.rows[0] ?? null;

    return NextResponse.json(
      {
        ok: true,

        runner: {
          id: runnerId,
          accountStatus: auth.runner.account_status,
          verificationStatus: auth.runner.verification_status,
        },

        applicationReview: applicationReview
          ? {
              decision: applicationReview.decision,
              reason: applicationReview.reason,
              reviewedAt: applicationReview.created_at,
            }
          : null,

        documentReviews: documentResult.rows.map((review) => ({
          reviewId: review.review_id,
          documentId: review.document_id,
          requirementKey: review.requirement_key,
          requirementTitle: review.requirement_title,
          decision: review.decision,
          reason: review.reason,
          reviewedAt: review.reviewed_at,
          currentStatus: review.current_status,
          fileRemovedFromStorage:
            review.file_removed_from_storage,
          deletionPending: review.deletion_pending,
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      },
    );
  } catch (cause) {
    console.error(
      "[SaMi Runner onboarding review] Feedback retrieval failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Your application review feedback could not be loaded.",
      503,
    );
  }
}