"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  runnerId: string;
  verificationStatus: string;
};

type ReviewResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  missingDocuments?: {
    requirement_key: string;
    title: string;
  }[];
  storageCleanup?: {
    deleted: number;
    pending: number;
  };
};

type Decision = "approved" | "rejected";
type Stage = "select" | "confirm" | "success";

const MIN_REASON = 10;
const MAX_REASON = 1000;

export default function RunnerApplicationDecision({
  runnerId,
  verificationStatus,
}: Props) {
  const router = useRouter();

  const [decision, setDecision] = useState<Decision>("approved");
  const [reason, setReason] = useState("");
  const [stage, setStage] = useState<Stage>("select");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [missingDocuments, setMissingDocuments] = useState<
    { requirement_key: string; title: string }[]
  >([]);
  const [cleanup, setCleanup] = useState<{
    deleted: number;
    pending: number;
  } | null>(null);

  const alreadyApproved = verificationStatus === "approved";
  const statusLabel = verificationStatus.replaceAll("_", " ");
  const reasonChars = reason.trim().length;
  const reasonValid = decision === "approved" || reasonChars >= MIN_REASON;

  function goToConfirm() {
    setError("");
    if (decision === "rejected" && !reasonValid) {
      setError(
        `Enter a rejection reason of at least ${MIN_REASON} characters.`,
      );
      return;
    }
    setStage("confirm");
  }

  function goBack() {
    setError("");
    setMissingDocuments([]);
    setStage("select");
  }

  async function submitDecision() {
    setError("");
    setMessage("");
    setMissingDocuments([]);
    setCleanup(null);
    setBusy(true);

    try {
      const response = await fetch(
        `/api/admin/runner-applications/${encodeURIComponent(runnerId)}/review`,
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
        setMissingDocuments(
          Array.isArray(result.missingDocuments)
            ? result.missingDocuments
            : [],
        );
        setError(
          result.error || "The application review could not be completed.",
        );
        setStage("select");
        return;
      }

      setMessage(
        result.message ||
          (decision === "approved"
            ? "The Runner application has been approved and the account is now active."
            : "The Runner application has been rejected. The Runner will see this reason the next time they open the app."),
      );
      setCleanup(result.storageCleanup || null);
      setStage("success");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The application review could not be completed.",
      );
      setStage("select");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="surface-card"
      aria-busy={busy}
      aria-labelledby="application-decision-heading"
    >
      <div className="surface-heading">
        <div>
          <h2 id="application-decision-heading">Application decision</h2>
          <p>Make the final verification decision for this Runner.</p>
        </div>
        <span className="timeline-state">{statusLabel}</span>
      </div>

      {alreadyApproved ? (
        <div className="alert alert-neutral">
          <span aria-hidden="true">✓</span>
          <p>
            This Runner application has already been approved. The Runner
            account is active.
          </p>
        </div>
      ) : stage === "success" ? (
        <div className="rounded-xl border border-green-300 bg-green-50 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-base font-bold text-white"
            >
              ✓
            </span>
            <h3 className="text-base font-semibold text-green-900">
              Application {decision === "approved" ? "approved" : "rejected"}
            </h3>
          </div>

          <p role="status" className="text-sm text-green-900">
            {message}
          </p>

          {decision === "rejected" && reason.trim() ? (
            <blockquote className="rounded-lg border border-green-200 bg-white p-3 text-sm italic text-slate-700">
              &ldquo;{reason.trim()}&rdquo;
            </blockquote>
          ) : null}

          {cleanup ? (
            <p className="text-xs text-green-800">
              Storage cleanup: {cleanup.deleted} file(s) deleted.
              {cleanup.pending > 0
                ? ` ${cleanup.pending} deletion(s) remain queued for retry.`
                : null}
            </p>
          ) : null}

          <div className="pt-2">
            <button
              type="button"
              onClick={() => router.refresh()}
              className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-800"
            >
              Refresh application details
            </button>
          </div>
        </div>
      ) : stage === "confirm" ? (
        <div className="space-y-4">
          <div
            className={`rounded-xl border-2 p-5 ${
              decision === "approved"
                ? "border-green-300 bg-green-50"
                : "border-amber-300 bg-amber-50"
            }`}
          >
            <h3
              className={`text-base font-semibold ${
                decision === "approved"
                  ? "text-green-900"
                  : "text-amber-900"
              }`}
            >
              Confirm application{" "}
              {decision === "approved" ? "approval" : "rejection"}
            </h3>

            <p
              className={`mt-2 text-sm ${
                decision === "approved"
                  ? "text-green-800"
                  : "text-amber-800"
              }`}
            >
              {decision === "approved"
                ? "The Runner account will be activated immediately. The Runner will be able to go online and accept errands."
                : "The Runner will not be activated. They will see the rejection reason below the next time they open the app."}
            </p>

            {decision === "rejected" && reason.trim() ? (
              <blockquote className="mt-3 rounded-lg border border-amber-200 bg-white p-3 text-sm italic text-slate-700">
                &ldquo;{reason.trim()}&rdquo;
              </blockquote>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={goBack}
              disabled={busy}
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={submitDecision}
              disabled={busy}
              className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                decision === "approved"
                  ? "bg-green-700 hover:bg-green-800"
                  : "bg-red-700 hover:bg-red-800"
              }`}
            >
              {busy
                ? "Processing decision..."
                : decision === "approved"
                  ? "Yes, approve application"
                  : "Yes, reject application"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div
            role="radiogroup"
            aria-label="Application decision"
            className="grid gap-3 sm:grid-cols-2"
          >
            <button
              type="button"
              role="radio"
              aria-checked={decision === "approved"}
              disabled={busy}
              onClick={() => {
                setDecision("approved");
                setError("");
              }}
              className={`rounded-xl border p-4 text-left transition ${
                decision === "approved"
                  ? "border-green-600 bg-green-50 ring-1 ring-green-600"
                  : "border-slate-200 hover:border-slate-400"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                    decision === "approved"
                      ? "border-green-600 bg-green-600"
                      : "border-slate-300 bg-white"
                  }`}
                >
                  {decision === "approved" ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  ) : null}
                </span>
                <div>
                  <span className="block text-sm font-semibold text-slate-900">
                    Approve application
                  </span>
                  <span className="mt-1 block text-xs text-slate-600">
                    Activate this Runner account so they can receive
                    errands.
                  </span>
                </div>
              </div>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={decision === "rejected"}
              disabled={busy}
              onClick={() => {
                setDecision("rejected");
                setError("");
              }}
              className={`rounded-xl border p-4 text-left transition ${
                decision === "rejected"
                  ? "border-red-600 bg-red-50 ring-1 ring-red-600"
                  : "border-slate-200 hover:border-slate-400"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                    decision === "rejected"
                      ? "border-red-600 bg-red-600"
                      : "border-slate-300 bg-white"
                  }`}
                >
                  {decision === "rejected" ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  ) : null}
                </span>
                <div>
                  <span className="block text-sm font-semibold text-slate-900">
                    Reject application
                  </span>
                  <span className="mt-1 block text-xs text-slate-600">
                    Record why this Runner application cannot be
                    activated.
                  </span>
                </div>
              </div>
            </button>
          </div>

          {decision === "rejected" ? (
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  htmlFor="runner-application-rejection-reason"
                  className="block text-sm font-medium text-slate-700"
                >
                  Rejection reason{" "}
                  <span className="text-red-600">*</span>
                </label>
                <span
                  id="rejection-reason-counter"
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
                id="runner-application-rejection-reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setError("");
                }}
                minLength={MIN_REASON}
                maxLength={MAX_REASON}
                rows={4}
                placeholder="Explain clearly why this application is being rejected. The Runner will see this reason."
                aria-describedby="rejection-reason-counter"
                aria-required="true"
                aria-invalid={reasonChars > 0 && reasonChars < MIN_REASON}
                className="w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              aria-live="polite"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </div>
          ) : null}

          {missingDocuments.length > 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">
                Required documents still need approval
              </p>
              <p className="mt-1 text-xs text-amber-800">
                Each required document must be approved before the
                application can be approved.
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-800">
                {missingDocuments.map((document) => (
                  <li key={document.requirement_key}>
                    {document.title}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <button
            type="button"
            onClick={goToConfirm}
            disabled={busy || (decision === "rejected" && !reasonValid)}
            className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
              decision === "approved"
                ? "bg-green-700 hover:bg-green-800"
                : "bg-red-700 hover:bg-red-800"
            }`}
          >
            {decision === "approved"
              ? "Review approval"
              : "Review rejection"}
          </button>
        </div>
      )}
    </section>
  );
}