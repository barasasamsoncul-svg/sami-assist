
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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

const FILTERS: { value: ApplicationStatus; label: string }[] = [
  { value: "submitted", label: "Submitted" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All applications" },
];

function formatDate(value: string | null) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export default function RunnerApplicationsPage() {
  const [filter, setFilter] =
    useState<ApplicationStatus>("submitted");

  const [applications, setApplications] =
    useState<RunnerApplication[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/admin/runner-applications?status=${encodeURIComponent(filter)}&limit=100`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        },
      );

      const data =
        (await response.json().catch(() => ({}))) as ApplicationsResponse;

      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }

      if (!response.ok || !data.ok) {
        throw new Error(
          data.error || "Runner applications could not be loaded.",
        );
      }

      setApplications(
        Array.isArray(data.applications)
          ? data.applications
          : [],
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load Runner applications.",
      );
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

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

        throw new Error(
          data.error || "Admin logout failed.",
        );
      }

      window.location.assign("/admin/login");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to sign out.",
      );
      setLogoutBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <Brand />
          <div className="product-tag">ADMIN WORKSPACE</div>
        </div>

        <div className="workspace-label">OPERATIONS</div>

        <nav className="sidebar-nav">
          <Link className="nav-item" href="/admin">
            <span className="nav-glyph">⌂</span>
            <span>Overview</span>
          </Link>

          <Link
            className="nav-item current"
            href="/admin/runner-applications"
          >
            <span className="nav-glyph">♙</span>
            <span>Runner applications</span>
          </Link>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-profile">
            <div className="avatar">SA</div>

            <div className="sidebar-profile-copy">
              <b>SaMi Administrator</b>
              <small>Admin workspace</small>
            </div>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="breadcrumbs">
            <strong>Admin</strong>
            <b>/</b>
            <span>Runner applications</span>
          </div>

          <div className="topbar-actions">
            <span className="account-pill">
              <i />
              Admin session
            </span>

            <button
              type="button"
              className="button ghost"
              onClick={logout}
              disabled={logoutBusy}
            >
              {logoutBusy ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </header>

        <main className="page-content">
          <div className="page-heading">
            <div>
              <div className="section-kicker">
                RUNNER MANAGEMENT
              </div>

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
                onClick={() => void loadApplications()}
                disabled={loading}
              >
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          <div className="view-stack">
            <div className="filter-bar">
              <select
                aria-label="Filter Runner applications by status"
                value={filter}
                onChange={(event) =>
                  setFilter(event.target.value as ApplicationStatus)
                }
              >
                {FILTERS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}

            <section className="surface-card">
              <div className="surface-heading">
                <div>
                  <h2>Applications</h2>
                  <p>
                    Runner accounts, service details and document
                    verification status.
                  </p>
                </div>

                <span className="soft-count">
                  {applications.length}
                </span>
              </div>

              {loading ? (
                <div className="empty-state">
                  <span className="mini-spinner" />
                  <p>Loading Runner applications…</p>
                </div>
              ) : applications.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">♙</div>
                  <h3>No applications found</h3>
                  <p>
                    There are no Runner applications matching this
                    verification status.
                  </p>
                </div>
              ) : (
                <div className="table-scroller">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Runner</th>
                        <th>Contact</th>
                        <th>Service area</th>
                        <th>Vehicle</th>
                        <th>Verification</th>
                        <th>Documents</th>
                        <th>Last updated</th>
                        <th />
                      </tr>
                    </thead>

                    <tbody>
                      {applications.map((application) => (
                        <tr key={application.id}>
                          <td>
                            <Link
                              className="table-title"
                              href={`/admin/runner-applications/${application.id}`}
                            >
                              <b>
                                {application.fullName || "Unnamed Runner"}
                              </b>
                              <small>
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
                              {application.serviceArea || "Not specified"}
                            </span>
                          </td>

                          <td>
                            <div>
                              {application.vehicleType || "Not specified"}
                            </div>
                            <small>
                              {application.vehicleRegistration || "No registration"}
                            </small>
                          </td>

                          <td>
                            <span className="timeline-state">
                              {statusLabel(
                                application.verificationStatus,
                              )}
                            </span>
                          </td>

                          <td>
                            <div>
                              {application.documentCount} total
                            </div>
                            <small>
                              {application.pendingDocumentCount} pending
                              {" · "}
                              {application.rejectedDocumentCount} rejected
                            </small>
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
                            >
                              Review →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
