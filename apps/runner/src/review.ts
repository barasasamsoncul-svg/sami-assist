import { apiRequest } from "@/api";

export type RunnerApplicationReview = {
  decision: "approved" | "rejected";
  reason: string | null;
  reviewedAt: string;
};

export type RunnerDocumentReview = {
  reviewId: string;
  documentId: string;
  requirementKey: string | null;
  requirementTitle: string | null;
  decision:
    | "approved"
    | "rejected"
    | "resubmission_required";
  reason: string | null;
  reviewedAt: string;
  currentStatus: string | null;
  fileRemovedFromStorage: boolean;
  deletionPending: boolean;
};

export type RunnerReviewFeedback = {
  ok: boolean;
  runner: {
    id: string;
    accountStatus: string;
    verificationStatus: string;
  };
  applicationReview: RunnerApplicationReview | null;
  documentReviews: RunnerDocumentReview[];
};

export async function getRunnerReviewFeedback(): Promise<RunnerReviewFeedback> {
  return apiRequest<RunnerReviewFeedback>(
    "/api/runner/me/onboarding/review",
  );
}