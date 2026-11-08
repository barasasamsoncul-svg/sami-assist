"use client";

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

export default function RunnerApplicationDecision({
  runnerId,
  verificationStatus,
}: Props) {
  const [decision, setDecision] = useState<"approved" | "rejected">(
    "approved",
  );
  const [reason, setReason] = useState("");
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

  async function submitDecision() {
    setError("");
    setMessage("");
    setMissingDocuments([]);
    setCleanup(null);

    if (decision === "rejected" && reason.trim().length < 10) {
      setError(
        "Provide a clear rejection reason of at least 10 characters.",
      );
      return;
    }

    const confirmation =
      decision === "approved"
        ? "Approve this Runner application? The Runner account will become active."
        : "Reject this Runner application? The Runner will not be activated.";

    if (!window.confirm(confirmation)) {
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(
        `/api/admin/runner-applications/${encodeURIComponent(runnerId)}/review`,
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
        setMissingDocuments(
          Array.isArray(result.missingDocuments)
            ? result.missingDocuments
            : [],
        );

        throw new Error(
          result.error || "The application review could not be completed.",
        );
      }

      setMessage(
        result.message || "The application review was completed.",
      );

      setCleanup(result.storageCleanup || null);
      setReason("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The application review could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface-card">
      <div className="surface-heading">
        <div>
          <h2>Application decision</h2>
          <p>
            Make the final verification decision for this Runner.
          </p>
        </div>

        <span className="timeline-state">
          {verificationStatus.replaceAll("_", " ")}
        </span>
      </div>

      {alreadyApproved ? (
        <div className="alert alert-neutral">
          <span>✓</span>
          <p>
            This Runner application has already been approved.
            The Runner account is active.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDecision("approved");
                setError("");
              }}
              aria-pressed={decision === "approved"}
              className={`rounded-xl border p-4 text-left transition ${
                decision === "approved"
                  ? "border-green-600 bg-green-50 ring-1 ring-green-600"
                  : "border-slate-200 hover:border-slate-400"
              }`}
            >
              <span className="block text-sm font-semibold text-slate-900">
                Approve application
              </span>
              <span className="mt-1 block text-xs text-slate-600">
                Activate the Runner after required documents are approved.
              </span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDecision("rejected");
                setError("");
              }}
              aria-pressed={decision === "rejected"}
              className={`rounded-xl border p-4 text-left transition ${
                decision === "rejected"
                  ? "border-red-600 bg-red-50 ring-1 ring-red-600"
                  : "border-slate-200 hover:border-slate-400"
              }`}
            >
              <span className="block text-sm font-semibold text-slate-900">
                Reject application
              </span>
              <span className="mt-1 block text-xs text-slate-600">
                Record why this Runner application is not accepted.
              </span>
            </button>
          </div>

          {decision === "rejected" && (
            <div>
              <label
                htmlFor="runner-application-rejection-reason"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Rejection reason
              </label>

              <textarea
                id="runner-application-rejection-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={10}
                maxLength={1000}
                rows={4}
                placeholder="Explain why this application is being rejected..."
                className="w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          {missingDocuments.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">
                Required documents still need approval
              </p>

              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-800">
                {missingDocuments.map((document) => (
                  <li key={document.requirement_key}>
                    {document.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={submitDecision}
            disabled={
              busy ||
              (decision === "rejected" && reason.trim().length < 10)
            }
            className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
              decision === "approved"
                ? "bg-green-700 hover:bg-green-800"
                : "bg-red-700 hover:bg-red-800"
            }`}
          >
            {busy
              ? "Processing decision..."
              : decision === "approved"
                ? "Confirm application approval"
                : "Confirm application rejection"}
          </button>
        </div>
      )}

      {message && (
        <div className="mt-5 rounded-lg border border-green-200 bg-green-50 p-4">
          <p role="status" className="text-sm font-medium text-green-800">
            {message}
          </p>

          {cleanup && (
            <p className="mt-2 text-xs text-green-800">
              R2 cleanup: {cleanup.deleted} file(s) deleted.
              {cleanup.pending > 0 &&
                ` ${cleanup.pending} deletion(s) remain queued for retry.`}
            </p>
          )}

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 text-sm font-semibold text-green-900 underline"
          >
            Refresh application details
          </button>
        </div>
      )}
    </section>
  );
}