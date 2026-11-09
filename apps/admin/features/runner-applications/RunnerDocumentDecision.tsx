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

type Stage = "select" | "confirm" | "success";

const MIN_REASON = 10;
const MAX_REASON = 1000;

const DECISIONS: {
  value: DocumentDecision;
  label: string;
  description: string;
  tone: "green" | "red" | "amber";
}[] = [
  {
    value: "approved",
    label: "Approve",
    description: "Accept this document. The file stays in R2.",
    tone: "green",
  },
  {
    value: "rejected",
    label: "Reject",
    description: "Reject permanently. The file is removed from R2.",
    tone: "red",
  },
  {
    value: "resubmission_required",
    label: "Request resubmission",
    description: "Ask the Runner to re-upload. The file is removed from R2.",
    tone: "amber",
  },
];

function toneClasses(tone: "green" | "red" | "amber", selected: boolean) {
  if (!selected) {
    return {
      button: "border-slate-200 text-slate-700 hover:bg-slate-50",
      dot: "border-slate-300 bg-white",
    };
  }
  if (tone === "green") {
    return {
      button: "border-green-600 bg-green-50 text-green-800",
      dot: "border-green-600 bg-green-600",
    };
  }
  if (tone === "red") {
    return {
      button: "border-red-600 bg-red-50 text-red-800",
      dot: "border-red-600 bg-red-600",
    };
  }
  return {
    button: "border-amber-600 bg-amber-50 text-amber-900",
    dot: "border-amber-600 bg-amber-600",
  };
}

function confirmButtonClasses(decision: DocumentDecision) {
  if (decision === "approved") return "bg-green-700 hover:bg-green-800";
  if (decision === "rejected") return "bg-red-700 hover:bg-red-800";
  return "bg-amber-700 hover:bg-amber-800";
}

export default function RunnerDocumentDecision({
  runnerId,
  documentId,
  reviewStatus,
  fileUrl,
}: Props) {
  const [decision, setDecision] = useState<DocumentDecision>("approved");
  const [reason, setReason] = useState("");
  const [stage, setStage] = useState<Stage>("select");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isPending = reviewStatus === "pending";
  const reasonChars = reason.trim().length;
  const reasonRequired = decision !== "approved";
  const reasonValid = !reasonRequired || reasonChars >= MIN_REASON;

  function goToConfirm() {
    setError("");
    if (reasonRequired && !reasonValid) {
      setError(`Provide an explanation of at least ${MIN_REASON} characters.`);
      return;
    }
    setStage("confirm");
  }

  function goBack() {
    setError("");
    setStage("select");
  }

  async function submitDecision() {
    setError("");
    setMessage("");
    setBusy(true);

    try {
      const response = await fetch(
        `/api/admin/runner-applications/${encodeURIComponent(runnerId)}/documents/${encodeURIComponent(documentId)}/review`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
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

      let successMessage = result.message || "Document review completed.";

      if (decision !== "approved") {
        if (cleanup?.pending) {
          successMessage =
            "Decision saved. The file is queued for removal from R2 and will be retried automatically.";
        } else if (cleanup?.deleted) {
          successMessage =
            "Decision saved. The file has been removed from R2.";
        } else {
          successMessage =
            "Decision saved. No file remained in R2 to remove.";
        }
      }

      setMessage(successMessage);
      setStage("success");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Document review could not be completed.",
      );
      setStage("select");
    } finally {
      setBusy(false);
    }
  }

  // ── Read-only summary for non-pending documents ──────────────────
  if (!isPending) {
    const summary =
      reviewStatus === "approved"
        ? "This document has been approved. The file remains available in storage."
        : reviewStatus === "resubmission_required"
          ? "Replacement required. The previous file has been removed or queued for removal from R2."
          : reviewStatus === "rejected"
            ? "This document was rejected. The previous file has been removed or queued for removal from R2."
            : "This document is not awaiting review.";

    return (
      <div className="mt-3 space-y-2">
        <p className="text-xs text-slate-500">{summary}</p>

        {fileUrl && reviewStatus === "approved" ? (
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            View approved document
            <span aria-hidden="true">↗</span>
          </a>
        ) : null}
      </div>
    );
  }

  // ── Success stage ────────────────────────────────────────────────
  if (stage === "success") {
    const isApproved = decision === "approved";
    const heading = isApproved
      ? "Document approved"
      : decision === "rejected"
        ? "Document rejected"
        : "Resubmission requested";

    return (
      <div
        className="mt-4 w-full space-y-3 rounded-xl border border-green-300 bg-green-50 p-4"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white"
          >
            ✓
          </span>
          <h4 className="text-sm font-semibold text-green-900">
            {heading}
          </h4>
        </div>

        <p className="text-sm text-green-900">{message}</p>

        {!isApproved && reason.trim() ? (
          <blockquote className="rounded-lg border border-green-200 bg-white p-2 text-xs italic text-slate-700">
            &ldquo;{reason.trim()}&rdquo;
          </blockquote>
        ) : null}

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-green-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-green-800"
        >
          Refresh application details
        </button>
      </div>
    );
  }

  // ── Confirm stage ────────────────────────────────────────────────
  if (stage === "confirm") {
    const selected = DECISIONS.find((item) => item.value === decision);

    return (
      <div className="mt-4 w-full space-y-3 border-t border-slate-200 pt-4">
        <div
          className={`rounded-xl border-2 p-4 ${
            decision === "approved"
              ? "border-green-300 bg-green-50"
              : "border-amber-300 bg-amber-50"
          }`}
        >
          <p className="text-sm font-semibold text-slate-900">
            Confirm: {selected?.label}
          </p>

          <p className="mt-1 text-xs leading-relaxed text-slate-700">
            {decision === "approved"
              ? "The document will be marked approved. The file remains in R2. The Runner will see that this document is verified."
              : decision === "rejected"
                ? "The document will be marked rejected. The file will be removed from R2. The Runner will see your reason and cannot resubmit this document unless Operations reopens the requirement."
                : "The document will be marked as needing replacement. The file will be removed from R2. The Runner will see your reason and will be able to upload a new file."}
          </p>

          {reasonRequired && reason.trim() ? (
            <blockquote className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-xs italic text-slate-700">
              &ldquo;{reason.trim()}&rdquo;
            </blockquote>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={goBack}
            disabled={busy}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={submitDecision}
            disabled={busy}
            className={`rounded-lg px-4 py-2 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${confirmButtonClasses(decision)}`}
          >
            {busy
              ? "Saving decision…"
              : decision === "approved"
                ? "Yes, approve document"
                : decision === "rejected"
                  ? "Yes, reject and remove file"
                  : "Yes, request replacement and remove file"}
          </button>
        </div>
      </div>
    );
  }

  // ── Select stage ─────────────────────────────────────────────────
  return (
    <div
      className="mt-4 w-full space-y-4 border-t border-slate-200 pt-4"
      aria-busy={busy}
    >
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-800">
          Document decision
        </p>

        <div
          role="radiogroup"
          aria-label="Document decision"
          className="grid gap-2 sm:grid-cols-3"
        >
          {DECISIONS.map((item) => {
            const selected = decision === item.value;
            const tone = toneClasses(item.tone, selected);

            return (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={busy}
                onClick={() => {
                  setDecision(item.value);
                  setError("");
                }}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${tone.button}`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border-2 ${tone.dot}`}
                >
                  {selected ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  ) : null}
                </span>

                <span>
                  {item.label}
                  <small className="mt-0.5 block font-normal text-slate-600">
                    {item.description}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {reasonRequired ? (
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label
              htmlFor={`runner-document-reason-${documentId}`}
              className="block text-sm font-medium text-slate-700"
            >
              {decision === "rejected"
                ? "Rejection reason"
                : "What must the Runner correct?"}{" "}
              <span className="text-red-600">*</span>
            </label>

            <span
              id={`runner-document-reason-counter-${documentId}`}
              className={`text-xs font-medium ${
                reasonChars < MIN_REASON
                  ? "text-slate-500"
                  : "text-green-600"
              }`}
            >
              {reasonChars} / {MAX_REASON}
              {reasonChars < MIN_REASON
                ? ` · ${MIN_REASON - reasonChars} more required`
                : null}
            </span>
          </div>

          <textarea
            id={`runner-document-reason-${documentId}`}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError("");
            }}
            minLength={MIN_REASON}
            maxLength={MAX_REASON}
            rows={3}
            placeholder={
              decision === "rejected"
                ? "Explain why this document is rejected…"
                : "Explain what the Runner must correct in the replacement document…"
            }
            aria-describedby={`runner-document-reason-counter-${documentId}`}
            aria-required="true"
            aria-invalid={reasonChars > 0 && reasonChars < MIN_REASON}
            className="w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />

          <p className="mt-1 text-xs text-slate-500">
            The existing file will be removed from R2. The review record
            and reason will remain in the database.
          </p>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={goToConfirm}
        disabled={busy || (reasonRequired && !reasonValid)}
        className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${confirmButtonClasses(decision)}`}
      >
        {decision === "approved"
          ? "Review approval"
          : decision === "rejected"
            ? "Review rejection"
            : "Review resubmission request"}
      </button>
    </div>
  );
}