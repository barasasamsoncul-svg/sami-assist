"use client";

import { useCallback, useEffect, useState } from "react";

type AdminSession = {
  id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  is_current: boolean;
};

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function AdminSessionsPanel() {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/auth/sessions", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          result?.error || "Unable to retrieve active Admin sessions.",
        );
      }

      setSessions(
        Array.isArray(result?.sessions) ? result.sessions : [],
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to retrieve active Admin sessions.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

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

      setMessage(
        result?.message || "Other Admin sessions have been revoked.",
      );

      await loadSessions();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to revoke other Admin sessions.",
      );
    } finally {
      setRevoking(false);
    }
  }

  const otherSessionCount = sessions.filter(
    (session) => !session.is_current,
  ).length;

  return (
    <section className="max-w-3xl rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Active sessions
          </h3>

          <p className="mt-1 text-sm text-slate-600">
            Review browsers currently signed in to your Admin account.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadSessions()}
          disabled={loading}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {message && (
        <p role="status" className="mt-4 text-sm text-green-700">
          {message}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">
          Loading active sessions...
        </p>
      ) : sessions.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          No active sessions were returned.
        </p>
      ) : (
        <div className="mt-6 divide-y divide-slate-200">
          {sessions.map((session) => (
            <article
              key={session.id}
              className="flex flex-wrap items-start justify-between gap-4 py-5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-slate-900">
                    {session.is_current
                      ? "This browser"
                      : "Other browser session"}
                  </h4>

                  {session.is_current && (
                    <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                      Current session
                    </span>
                  )}
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
                    </dd>
                  </div>
                </dl>
              </div>
            </article>
          ))}
        </div>
      )}

      {!loading && otherSessionCount > 0 && (
        <div className="mt-6 border-t border-slate-200 pt-5">
          <p className="text-sm text-slate-600">
            {otherSessionCount} other active{" "}
            {otherSessionCount === 1 ? "session" : "sessions"}.
            Revoking them will leave this browser signed in.
          </p>

          <button
            type="button"
            onClick={() => void revokeOtherSessions()}
            disabled={revoking}
            className="mt-3 rounded-lg border border-red-300 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {revoking
              ? "Revoking sessions..."
              : "Sign out other sessions"}
          </button>
        </div>
      )}
    </section>
  );
}