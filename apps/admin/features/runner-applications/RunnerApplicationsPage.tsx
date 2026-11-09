"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import Brand from "@/components/Brand";

type ApplicationStatus =
  | "pending"
  | "submitted"
  | "approved"
  | "rejected"
  | "all";

type RunnerApplication = {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  accountStatus: string;
  verificationStatus: string;
  serviceArea: string | null;
  vehicleType: string | null;
  vehicleRegistration: string | null;
  selectedCategories: string[];
  documentCount: number;
  pendingDocumentCount: number;
  rejectedDocumentCount: number;
  latestDocumentSubmittedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApplicationsResponse = {
  ok: boolean;
  error?: string;
  count?: number;
  applications?: RunnerApplication[];
};

type CleanupResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  processed?: number;
  deleted?: number;
  failed?: number;
  remaining?: number;
};

const FILTERS: { value: ApplicationStatus; label: string }[] = [
  { value: "submitted", label: "Submitted" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All applications" },
];

const PAGE_LIMIT = 100;

function formatDate(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function readable(value: string | null | undefined) {
  if (!value) return "Not provided";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function RunnerApplicationsPage() {
  const [filter, setFilter] = useState<ApplicationStatus>("submitted");
  const [applications, setApplications] = useState<RunnerApplication[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState("");

  const abortRef = useRef<AbortController | null>(null);

  // Abort any in-flight fetch when the component unmounts.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const loadApplications = useCallback(async () => {
    // Cancel a previous fetch so rapid filter changes can't race.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/admin/runner-applications?status=${encodeURIComponent(filter)}&limit=${PAGE_LIMIT}`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        },
      );

      const data =
        (await response.json().catch(() => ({}))) as ApplicationsResponse;

      if (controller.signal.aborted) return;

      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }

      if (!response.ok || !data.ok) {
        throw new Error(
          data.error || "Runner applications could not be loaded.",
        );
      }

      const list = Array.isArray(data.applications) ? data.applications : [];

      setApplications(list);
      setTotalCount(
        typeof data.count === "number" && data.count >= list.length
          ? data.count
          : null,
      );
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load Runner applications.",
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [filter]);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  async function retryStorageCleanup() {
    if (cleanupBusy || loading) return;

    setCleanupBusy(true);
    setCleanupMessage("");
    setError("");

    try {
      const response = await fetch(
        "/api/admin/runner-applications/document-storage-cleanup",
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      );

      const data =
        (await response.json().catch(() => ({}))) as CleanupResponse;

      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }

      if (!response.ok || data.ok === false) {
        throw new Error(
          data.error || "Document storage cleanup could not be retried.",
        );
      }

      const summary: string[] = [];

      if (typeof data.processed === "number") {
        summary.push(`${data.processed} queued item(s) processed`);
      }
      if (typeof data.deleted === "number") {
        summary.push(`${data.deleted} file(s) removed`);
      }
      if (typeof data.failed === "number") {
        summary.push(`${data.failed} deletion(s) still need attention`);
      }
      if (typeof data.remaining === "number") {
        summary.push(`${data.remaining} item(s) remaining`);
      }

      setCleanupMessage(
        data.message ||
          (summary.length > 0
            ? summary.join(" · ")
            : "The storage cleanup retry completed. Refresh the list to review the latest document statuses."),
      );

      await loadApplications();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to retry document storage cleanup.",
      );
    } finally {
      setCleanupBusy(false);
    }
  }

  async function logout() {
    if (logoutBusy) return;

    setLogoutBusy(true);
    setError("");

    try {
      const response = await fetch("/api/admin/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Admin logout failed.");
      }

      window.location.assign("/admin/login");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to sign out.",
      );
      setLogoutBusy(false);
    }
  }

  const truncated =
    totalCount !== null && totalCount > applications.length;

  const currentFilterLabel =
    FILTERS.find((item) => item.value === filter)?.label ?? "All applications";

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <Brand />
          <div className="product-tag">ADMIN WORKSPACE</div>
        </div>

        <div className="workspace-label">OPERATIONS</div>

        <nav className="sidebar-nav" aria-label="Admin navigation">
          <Link className="nav-item" href="/admin">
            <span className="nav-glyph" aria-hidden="true">
              ⌂
            </span>
            <span>Overview</span>
          </Link>

          <Link
            className="nav-item current"
            href="/admin/runner-applications"
            aria-current="page"
          >
            <span className="nav-glyph" aria-hidden="true">
              ♙
            </span>
            <span>Runner applications</span>
          </Link>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-profile">
            <div className="avatar" aria-hidden="true">
              SA
            </div>
            <div className="sidebar-profile-copy">
              <b>SaMi Administrator</b>
              <small>Admin workspace</small>
            </div>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/admin">Admin</Link>
            <span aria-hidden="true">/</span>
            <strong aria-current="page">Runner applications</strong>
          </nav>

          <div className="topbar-actions">
            <span className="account-pill">
              <i aria-hidden="true" />
              Admin session
            </span>

            <button
              type="button"
              className="button ghost"
              onClick={logout}
              disabled={logoutBusy}
              aria-busy={logoutBusy}
            >
              {logoutBusy ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </header>

        <main id="main-content" className="page-content">
          <div className="page-heading">
            <div>
              <div className="section-kicker">RUNNER MANAGEMENT</div>
              <h1>Runner applications</h1>
              <p>
                Review Runner registrations and their verification
                submissions.
              </p>
            </div>

            <div className="page-heading-actions">
              <button
                type="button"
                className="button ghost"
                onClick={retryStorageCleanup}
                disabled={cleanupBusy || loading}
                aria-busy={cleanupBusy}
              >
                {cleanupBusy
                  ? "Retrying cleanup…"
                  : "Retry document storage cleanup"}
              </button>

              <button
                type="button"
                className="button ghost"
                onClick={() => void loadApplications()}
                disabled={loading || cleanupBusy}
                aria-busy={loading}
              >
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          <div className="view-stack">
            <div className="filter-bar">
              <label
                htmlFor="runner-application-filter"
                className="sr-only"
              >
                Filter Runner applications by status
              </label>
              <select
                id="runner-application-filter"
                value={filter}
                onChange={(event) =>
                  setFilter(event.target.value as ApplicationStatus)
                }
                aria-busy={loading}
              >
                {FILTERS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            {error ? (
              <div className="alert error" role="alert" aria-live="assertive">
                {error}
              </div>
            ) : null}

            {cleanupMessage ? (
              <div
                className="alert"
                role="status"
                aria-live="polite"
              >
                {cleanupMessage}
              </div>
            ) : null}

            <section
              className="surface-card"
              aria-labelledby="applications-heading"
            >
              <div className="surface-heading">
                <div>
                  <h2 id="applications-heading">Applications</h2>
                  <p>
                    {currentFilterLabel} · Runner accounts, service
                    details and document verification status.
                  </p>
                </div>

                <span className="soft-count" aria-hidden="true">
                  {applications.length}
                </span>
              </div>

              {loading ? (
                <div
                  className="empty-state"
                  role="status"
                  aria-live="polite"
                >
                  <span className="mini-spinner" aria-hidden="true" />
                  <p>Loading Runner applications…</p>
                </div>
              ) : applications.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon" aria-hidden="true">
                    ♙
                  </div>
                  <h3>No applications found</h3>
                  <p>
                    There are no Runner applications matching the{" "}
                    {currentFilterLabel.toLowerCase()} filter.
                  </p>
                </div>
              ) : (
                <>
                  <div
                    className="table-scroller"
                    aria-busy={loading}
                  >
                    <table className="data-table">
                      <caption className="sr-only">
                        Runner applications matching the{" "}
                        {currentFilterLabel.toLowerCase()} filter,
                        sorted by most recently updated
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Runner</th>
                          <th scope="col">Contact</th>
                          <th scope="col">Service area</th>
                          <th scope="col">Vehicle</th>
                          <th scope="col">Verification</th>
                          <th scope="col">Documents</th>
                          <th scope="col">Last updated</th>
                          <th scope="col">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {applications.map((application) => {
                          const hasAttention =
                            application.pendingDocumentCount > 0 ||
                            application.rejectedDocumentCount > 0;

                          return (
                            <tr key={application.id}>
                              <td>
                                <Link
                                  className="table-title"
                                  href={`/admin/runner-applications/${application.id}`}
                                >
                                  <b>
                                    {application.fullName ||
                                      "Unnamed Runner"}
                                  </b>
                                  <small aria-hidden="true">
                                    {application.id.slice(0, 8)}
                                  </small>
                                </Link>
                              </td>

                              <td>
                                <div>
                                  {application.email || "No email"}
                                </div>
                                <small>
                                  {application.phone || "No phone"}
                                </small>
                              </td>

                              <td>
                                <span className="area-cell">
                                  {application.serviceArea ||
                                    "Not specified"}
                                </span>
                              </td>

                              <td>
                                <div>
                                  {readable(application.vehicleType)}
                                </div>
                                <small>
                                  {application.vehicleRegistration ||
                                    "No registration"}
                                </small>
                              </td>

                              <td>
                                <span className="timeline-state">
                                  {readable(
                                    application.verificationStatus,
                                  )}
                                </span>
                              </td>

                              <td>
                                <div>
                                  {application.documentCount} total
                                </div>
                                {hasAttention ? (
                                  <small>
                                    {application.pendingDocumentCount}{" "}
                                    pending ·{" "}
                                    {application.rejectedDocumentCount}{" "}
                                    need attention
                                  </small>
                                ) : (
                                  <small className="text-slate-500">
                                    All clear
                                  </small>
                                )}
                              </td>

                              <td>
                                <span className="date-cell">
                                  {formatDate(application.updatedAt)}
                                </span>
                              </td>

                              <td>
                                <Link
                                  className="inline-link"
                                  href={`/admin/runner-applications/${application.id}`}
                                  aria-label={`Review ${application.fullName || "unnamed Runner"} application`}
                                >
                                  Review{" "}
                                  <span aria-hidden="true">→</span>
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {truncated ? (
                    <p className="muted small-copy">
                      Showing the first {applications.length} of{" "}
                      {totalCount} matching applications. Narrow the
                      filter to see more.
                    </p>
                  ) : null}
                </>
              )}
            </section>
          </div>

          <footer className="app-footer">
            <span>SaMi Administration</span>
            <span>Runner management</span>
          </footer>
        </main>
      </div>
    </div>
  );
}