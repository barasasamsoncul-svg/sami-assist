"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type AdminSession = {
  id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  is_current: boolean;
};

type RevokeStage = "idle" | "confirming" | "success";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function expiresIn(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) return "Expired";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Expiring";
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `in ${days}d`;
}

export default function AdminSessionsPanel() {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [revokeStage, setRevokeStage] = useState<RevokeStage>("idle");

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const loadSessions = useCallback(async () => {
    // Cancel any in-flight fetch so rapid refreshes don't race.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/auth/sessions", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });

      const result = await response.json().catch(() => null);

      if (controller.signal.aborted) return;

      if (!response.ok) {
        throw new Error(
          result?.error || "Unable to retrieve active Admin sessions.",
        );
      }

      setSessions(Array.isArray(result?.sessions) ? result.sessions : []);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to retrieve active Admin sessions.",
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  function startRevoke() {
    setError("");
    setMessage("");
    setRevokeStage("confirming");
  }

  function cancelRevoke() {
    setError("");
    setRevokeStage("idle");
  }

  async function revokeOtherSessions() {
    setRevoking(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/auth/sessions", {
        method: "DELETE",
        credentials: "same-origin",
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          result?.error || "Unable to revoke other Admin sessions.",
        );
      }

      setMessage(result?.message || "Other Admin sessions have been revoked.");
      setRevokeStage("success");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to revoke other Admin sessions.",
      );
      setRevokeStage("confirming");
    } finally {
      setRevoking(false);
    }
  }

  async function dismissSuccess() {
    setMessage("");
    setRevokeStage("idle");
    await loadSessions();
  }

  const otherSessionCount = sessions.filter(
    (session) => !session.is_current,
  ).length;

  const hasOtherSessions = otherSessionCount > 0;
  const showInitialLoading = loading && sessions.length === 0;
  const showEmpty = !loading && sessions.length === 0;

  return (
    <section
      className="max-w-3xl rounded-xl border border-slate-200 bg-white p-6"
      aria-busy={loading || revoking}
      aria-labelledby="active-sessions-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            id="active-sessions-heading"
            className="text-base font-semibold text-slate-900"
          >
            Active sessions
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Browsers currently signed in to your Admin account.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadSessions()}
          disabled={loading || revoking}
          aria-busy={loading}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      {showInitialLoading ? (
        <div
          className="mt-6 flex items-center gap-3 text-sm text-slate-500"
          role="status"
          aria-live="polite"
        >
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
          />
          Loading active sessions…
        </div>
      ) : showEmpty ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
          <p className="text-sm font-medium text-slate-900">
            No active sessions returned
          </p>
          <p className="mt-1 text-xs text-slate-500">
            This can happen if your session was just refreshed. Try
            reloading the page.
          </p>
        </div>
      ) : (
        <div className="mt-6 divide-y divide-slate-200">
          {sessions.map((session) => {
            const expiry = expiresIn(session.expires_at);
            return (
              <article
                key={session.id}
                className="py-5 first:pt-0 last:pb-0"
                aria-labelledby={`session-${session.id}-heading`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3
                    id={`session-${session.id}-heading`}
                    className="text-sm font-semibold text-slate-900"
                  >
                    {session.is_current ? "This browser" : "Other session"}
                  </h3>

                  {session.is_current ? (
                    <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                      <span className="sr-only">Status: </span>
                      Current session
                    </span>
                  ) : null}
                </div>

                <dl className="mt-3 space-y-1.5 text-xs text-slate-500">
                  <div>
                    <dt className="inline">Signed in: </dt>
                    <dd className="inline">
                      {formatDate(session.created_at)}
                    </dd>
                  </div>

                  <div>
                    <dt className="inline">Last activity: </dt>
                    <dd className="inline">
                      {formatDate(session.last_seen_at)}
                    </dd>
                  </div>

                  <div>
                    <dt className="inline">Expires: </dt>
                    <dd className="inline">
                      {formatDate(session.expires_at)}
                      {expiry ? (
                        <span className="ml-1 text-slate-400">
                          ({expiry})
                        </span>
                      ) : null}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      )}

      {revokeStage === "success" ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-6 space-y-3 rounded-xl border border-green-300 bg-green-50 p-4"
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white"
            >
              ✓
            </span>
            <p className="text-sm font-semibold text-green-900">
              Other sessions signed out
            </p>
          </div>

          <p className="text-sm text-green-900">
            {message || "Other Admin sessions have been revoked."}
          </p>

          <button
            type="button"
            onClick={() => void dismissSuccess()}
            disabled={loading}
            className="rounded-lg bg-green-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Refreshing…" : "Done"}
          </button>
        </div>
      ) : !loading && hasOtherSessions ? (
        <div className="mt-6 border-t border-slate-200 pt-5">
          {revokeStage === "idle" ? (
            <>
              <p className="text-sm text-slate-600">
                {otherSessionCount} other active{" "}
                {otherSessionCount === 1 ? "session" : "sessions"}.
                Revoking them will leave this browser signed in.
              </p>

              <button
                type="button"
                onClick={startRevoke}
                disabled={revoking}
                className="mt-3 rounded-lg border border-red-300 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Sign out other sessions
              </button>
            </>
          ) : (
            <div className="space-y-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">
                Confirm sign out
              </p>

              <p className="text-sm text-amber-900">
                This will immediately sign out{" "}
                {otherSessionCount === 1
                  ? "1 other session"
                  : `${otherSessionCount} other sessions`}
                . You will stay signed in on this browser.
              </p>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={cancelRevoke}
                  disabled={revoking}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => void revokeOtherSessions()}
                  disabled={revoking}
                  className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {revoking
                    ? "Signing out…"
                    : "Yes, sign out other sessions"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}