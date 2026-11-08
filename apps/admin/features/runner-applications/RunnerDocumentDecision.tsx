"use client";

import { useState } from "react";

type DocumentDecision =
  | "approved"
  | "rejected"
  | "resubmission_required";

type Props = {
  runnerId: string;
  documentId: string;
  reviewStatus: string;
  fileUrl: string | null;
};

type ReviewResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  storageCleanup?: {
    deleted: number;
    pending: number;
  };
};

export default function RunnerDocumentDecision({
  runnerId,
  documentId,
  reviewStatus,
  fileUrl,
}: Props) {
  const [decision, setDecision] =
    useState<DocumentDecision>("approved");

  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isPending = reviewStatus === "pending";

  async function submitDecision() {
    setError("");
    setMessage("");

    if (
      decision !== "approved" &&
      reason.trim().length < 10
    ) {
      setError(
        "Provide a clear explanation of at least 10 characters.",
      );
      return;
    }

    const confirmation =
      decision === "approved"
        ? "Approve this document? Its file will remain in R2."
        : decision === "rejected"
          ? "Reject this document and remove its file from R2?"
          : "Request a replacement and remove the existing document from R2?";

    if (!window.confirm(confirmation)) {
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(
        `/api/admin/runner-applications/${encodeURIComponent(runnerId)}/documents/${encodeURIComponent(documentId)}/review`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            decision,
            reason: reason.trim(),
          }),
        },
      );

      const result = (await response.json().catch(() => ({}))) as ReviewResponse;

      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }

      if (!response.ok || !result.ok) {
        throw new Error(
          result.error || "Document review could not be completed.",
        );
      }

      const cleanup = result.storageCleanup;

      setMessage(
        result.message || "Document review completed.",
      );

      if (decision !== "approved") {
        if (cleanup?.pending) {
          setMessage(
            "The document decision was saved. R2 deletion is queued and will be retried.",
          );
        } else if (cleanup?.deleted) {
          setMessage(
            "The document decision was saved and the file was deleted from R2.",
          );
        } else {
          setMessage(
            "The document decision was saved. No remaining R2 file required deletion.",
          );
        }
      }

      setReason("");

      window.setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Document review could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!isPending) {
    return (
      <div className="mt-3 space-y-2">
        <span className="text-xs text-slate-500">
          {reviewStatus === "approved"
            ? "This document has been approved and retained in storage."
            : reviewStatus === "resubmission_required"
              ? "Replacement required. The previous file was removed or queued for removal from R2."
              : reviewStatus === "rejected"
                ? "This document was rejected. The previous file was removed or queued for removal from R2."
                : "This document is not awaiting review."}
        </span>

        {fileUrl && reviewStatus === "approved" && (
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            View approved document ↗
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 w-full space-y-4 border-t border-slate-200 pt-4">
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-800">
          Document decision
        </p>

        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDecision("approved");
              setError("");
            }}
            aria-pressed={decision === "approved"}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
              decision === "approved"
                ? "border-green-600 bg-green-50 text-green-800"
                : "border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            Approve
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDecision("rejected");
              setError("");
            }}
            aria-pressed={decision === "rejected"}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
              decision === "rejected"
                ? "border-red-600 bg-red-50 text-red-800"
                : "border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            Reject
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDecision("resubmission_required");
              setError("");
            }}
            aria-pressed={decision === "resubmission_required"}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
              decision === "resubmission_required"
                ? "border-amber-600 bg-amber-50 text-amber-900"
                : "border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            Request resubmission
          </button>
        </div>
      </div>

      {decision !== "approved" && (
        <div>
          <label
            htmlFor={`runner-document-reason-${documentId}`}
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            {decision === "rejected"
              ? "Rejection reason"
              : "What must the Runner correct?"}
          </label>

          <textarea
            id={`runner-document-reason-${documentId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={10}
            maxLength={1000}
            rows={3}
            placeholder={
              decision === "rejected"
                ? "Explain why this document is rejected..."
                : "Explain what the Runner must correct in the replacement document..."
            }
            className="w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />

          <p className="mt-1 text-xs text-slate-500">
            The existing file will be removed from R2. The review
            record and reason will remain in the database.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {message && (
        <p role="status" className="text-sm text-green-700">
          {message}
        </p>
      )}

      <button
        type="button"
        onClick={submitDecision}
        disabled={
          busy ||
          (decision !== "approved" && reason.trim().length < 10)
        }
        className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
          decision === "approved"
            ? "bg-green-700 hover:bg-green-800"
            : decision === "rejected"
              ? "bg-red-700 hover:bg-red-800"
              : "bg-amber-700 hover:bg-amber-800"
        }`}
      >
        {busy
          ? "Saving decision..."
          : decision === "approved"
            ? "Confirm document approval"
            : decision === "rejected"
              ? "Reject and remove from R2"
              : "Request replacement and remove from R2"}
      </button>
    </div>
  );
}