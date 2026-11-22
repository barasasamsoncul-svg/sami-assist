"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import Brand from "@/components/Brand";

type RunnerServiceType = "pickup_deliver" | "shop_deliver";

type AdminRunner = {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  serviceArea: string | null;
  vehicleType: string | null;
  serviceTypes: string[];
  isOnline: boolean;
  hasActiveJob: boolean;
};

type ErrandAssignment = {
  jobStatus: string;
  runnerId: string | null;
  runnerName: string | null;
  offerStatus: string | null;
  offerExpiresAt: string | null;
  completionSubmittedAt: string | null;
  completedAt: string | null;
} | null;

type AdminErrand = {
  id: string;
  publicCode: string;
  title: string;
  category: string;
  runnerServiceType: RunnerServiceType;
  description: string;
  status: string;
  hasLegacyProviderAssignment: boolean;
  serviceArea: string | null;
  pickupLocation: string | null;
  pickupCoordinates: { latitude: number | null; longitude: number | null };
  destinationLocation: string | null;
  destinationCoordinates: { latitude: number | null; longitude: number | null };
  distanceKm: number | null;
  serviceFeeAmount: number | null;
  runnerPayoutAmount: number | null;
  currency: string;
  paymentStatus: string;
  createdAt: string;
  customer: {
    name: string;
    email: string | null;
    phone: string | null;
  };
  assignment: ErrandAssignment;
};

type ErrandsResponse = {
  ok?: boolean;
  error?: string;
  errands?: AdminErrand[];
  runners?: AdminRunner[];
  runnerError?: string | null;
};

type Props = {
  adminName?: string;
};

function readable(value: string | null | undefined) {
  if (!value) return "Not provided";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function serviceLabel(value: RunnerServiceType) {
  return value === "shop_deliver" ? "Shop & Deliver" : "Pick Up & Deliver";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatMoney(value: number | null, currency: string) {
  if (value === null || !Number.isFinite(value)) return "Not set";
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: currency || "KES",
    maximumFractionDigits: 0,
  }).format(value);
}

function runnerLabel(runner: AdminRunner) {
  const name = runner.fullName || "Unnamed Runner";
  const area = runner.serviceArea ? " · " + runner.serviceArea : "";
  return name + area;
}

function getAssignmentLabel(errand: AdminErrand) {
  const assignment = errand.assignment;

  if (assignment?.jobStatus === "accepted") {
    return {
      label: "Accepted by " + (assignment.runnerName || "Runner"),
      className: "positive",
    };
  }

  if (assignment?.jobStatus === "in_progress") {
    return { label: "In progress", className: "positive" };
  }

  if (assignment?.jobStatus === "completion_submitted") {
    return { label: "Awaiting Admin confirmation", className: "attention" };
  }

  if (assignment?.jobStatus === "completed") {
    return { label: "Completed · Admin confirmed", className: "positive" };
  }

  if (assignment?.jobStatus === "cancelled") {
    return { label: "Runner job cancelled", className: "negative" };
  }

  if (
    assignment?.jobStatus === "offered" &&
    assignment.offerStatus === "offered"
  ) {
    const expiresAt = assignment.offerExpiresAt
      ? new Date(assignment.offerExpiresAt).getTime()
      : 0;

    if (expiresAt > 0 && expiresAt <= Date.now()) {
      return { label: "Offer expired", className: "attention" };
    }

    return {
      label: "Offer sent to " + (assignment.runnerName || "Runner"),
      className: "attention",
    };
  }

  if (assignment) {
    return { label: readable(assignment.jobStatus), className: "" };
  }

  if (errand.hasLegacyProviderAssignment) {
    return { label: "Legacy provider assignment", className: "attention" };
  }

  if (errand.status === "requested") {
    return { label: "Needs Admin assignment", className: "attention" };
  }

  return { label: readable(errand.status), className: "" };
}

export default function AdminErrandsPage({ adminName = "SaMi Administrator" }: Props) {
  const [errands, setErrands] = useState<AdminErrand[]>([]);
  const [runners, setRunners] = useState<AdminRunner[]>([]);
  const [filter, setFilter] = useState<"all" | "unassigned" | "pending_completion">("all");
  const [selectedRunnerByErrand, setSelectedRunnerByErrand] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assigningId, setAssigningId] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [error, setError] = useState("");
  const [runnerError, setRunnerError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadErrands = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    setError("");
    setRunnerError("");

    try {
      const response = await fetch("/api/admin/errands?status=all", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });

      const data = (await response.json().catch(() => ({}))) as ErrandsResponse;

      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Customer errands could not be loaded.");
      }

      const nextErrands = Array.isArray(data.errands) ? data.errands : [];
      const nextRunners = Array.isArray(data.runners) ? data.runners : [];

      setErrands(nextErrands);
      setRunners(nextRunners);
      setRunnerError(data.runnerError || "");
      // Never preselect a Runner. Admin must make an explicit choice
      // for every initial assignment or reassignment.
      setSelectedRunnerByErrand((current) => {
        const next: Record<string, string> = {};

        for (const errand of nextErrands) {
          if (current[errand.id]) {
            next[errand.id] = current[errand.id];
          }
        }

        return next;
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load customer errands.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadErrands();
  }, [loadErrands]);

  const visibleErrands = useMemo(() => {
    if (filter === "pending_completion") {
      return errands.filter(
        (errand) => errand.assignment?.jobStatus === "completion_submitted",
      );
    }

    if (filter === "unassigned") {
      return errands.filter(
        (errand) =>
          errand.status === "requested" &&
          !errand.assignment &&
          !errand.hasLegacyProviderAssignment,
      );
    }

    return errands;
  }, [errands, filter]);

  const availableRunnerCount = useMemo(
    () =>
      runners.filter(
        (runner) => runner.isOnline && !runner.hasActiveJob,
      ).length,
    [runners],
  );

  async function assignErrand(errand: AdminErrand) {
    const runnerId = selectedRunnerByErrand[errand.id] || "";

    if (!runnerId || assigningId) return;

    setAssigningId(errand.id);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/admin/errands", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          errandId: errand.id,
          runnerId,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "The errand could not be assigned.");
      }

      setSuccessMessage(
        data.message || "The Runner offer was created successfully.",
      );
      await loadErrands(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to assign this errand.",
      );
    } finally {
      setAssigningId("");
    }
  }


  async function confirmCompletion(errand: AdminErrand) {
    if (assigningId) return;

    const accepted = window.confirm(
      "Confirm that " + errand.publicCode +
      " has been completed? This will close the errand for the customer and Runner.",
    );
    if (!accepted) return;

    setAssigningId(errand.id);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/admin/errands", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "confirm_completion",
          errandId: errand.id,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Errand completion could not be confirmed.");
      }

      setSuccessMessage(
        data.message || "The errand has been confirmed complete.",
      );
      await loadErrands(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to confirm this errand completion.",
      );
    } finally {
      setAssigningId("");
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
        throw new Error(data.error || "Admin sign-out failed.");
      }

      window.location.assign("/admin/login");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to sign out.",
      );
      setLogoutBusy(false);
    }
  }

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

        <div className="workspace-label">WORKSPACE</div>

        <nav className="sidebar-nav" aria-label="Admin navigation">
          <Link className="nav-item" href="/admin">
            <span className="nav-glyph" aria-hidden="true">⌂</span>
            <span>Overview</span>
          </Link>

          <div className="workspace-label">OPERATIONS</div>

          <Link
            className="nav-item current"
            href="/admin/errands"
            aria-current="page"
          >
            <span className="nav-glyph" aria-hidden="true">↗</span>
            <span>Errands</span>
          </Link>

          <Link className="nav-item" href="/admin/runner-applications">
            <span className="nav-glyph" aria-hidden="true">♙</span>
            <span>Runner applications</span>
          </Link>

          <div className="workspace-label">ACCOUNT</div>

          <Link className="nav-item" href="/admin/security">
            <span className="nav-glyph" aria-hidden="true">⚙</span>
            <span>Security settings</span>
          </Link>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-profile">
            <div className="avatar" aria-hidden="true">SA</div>
            <div className="sidebar-profile-copy">
              <b>{adminName}</b>
              <small>Administrator</small>
            </div>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/admin">Admin</Link>
            <span aria-hidden="true">/</span>
            <strong aria-current="page">Errands</strong>
          </nav>

          <div className="topbar-actions">
            <span className="account-pill">
              <i aria-hidden="true" />
              Administrator session
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
              <div className="section-kicker">ERRAND OPERATIONS</div>
              <h1>Customer errands</h1>
              <p>
                Assign customer requests, monitor Runner progress and review
                submitted completions before closing errands.
              </p>
            </div>

            <div className="page-heading-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => void loadErrands(true)}
                disabled={loading || refreshing || !!assigningId}
                aria-busy={refreshing}
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          <div className="metrics-grid">
            <section className="metric-card">
              <span>Recent errands</span>
              <strong>{errands.length}</strong>
            </section>
            <section className="metric-card">
              <span>Needs assignment</span>
              <strong>
                {
                  errands.filter(
                    (errand) =>
                      errand.status === "requested" &&
                      !errand.assignment &&
                      !errand.hasLegacyProviderAssignment,
                  ).length
                }
              </strong>
            </section>
            <section className="metric-card">
              <span>Awaiting completion review</span>
              <strong>
                {errands.filter((errand) => errand.assignment?.jobStatus === "completion_submitted").length}
              </strong>
            </section>
            <section className="metric-card">
              <span>Online, no active errand</span>
              <strong>{availableRunnerCount}</strong>
            </section>
          </div>

          {error ? (
            <div className="alert error" role="alert" aria-live="assertive">
              {error}
            </div>
          ) : null}

          {successMessage ? (
            <div className="alert alert-neutral" role="status" aria-live="polite">
              <span aria-hidden="true">✓</span>
              <p>{successMessage}</p>
            </div>
          ) : null}

          {runnerError ? (
            <div className="alert alert-neutral" role="status">
              <span aria-hidden="true">!</span>
              <p>{runnerError}</p>
            </div>
          ) : null}

          <div className="view-stack">
            <section className="surface-card" aria-labelledby="errands-heading">
              <div className="surface-heading">
                <div>
                  <h2 id="errands-heading">Errand queue</h2>
                  <p>
                    Assign each request to one Runner. When a Runner submits
                    completion, review it here and confirm it before the errand is closed.
                  </p>
                </div>
                <span className="soft-count" aria-label={String(visibleErrands.length) + " errands"}>
                  {visibleErrands.length}
                </span>
              </div>

              <div className="filter-bar">
                <label htmlFor="admin-errand-filter" className="sr-only">
                  Filter errands
                </label>
                <select
                  id="admin-errand-filter"
                  value={filter}
                  onChange={(event) =>
                    setFilter(event.target.value as "all" | "unassigned" | "pending_completion")
                  }
                >
                  <option value="all">All recent errands</option>
                  <option value="unassigned">Needs Admin assignment</option>
                  <option value="pending_completion">Needs completion confirmation</option>
                </select>
              </div>

              {loading ? (
                <div className="empty-state" role="status" aria-live="polite">
                  <span className="mini-spinner" aria-hidden="true" />
                  <p>Loading customer errands…</p>
                </div>
              ) : visibleErrands.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon" aria-hidden="true">↗</div>
                  <h3>No errands in this view</h3>
                  <p>
                    New customer requests will appear here after they are
                    submitted.
                  </p>
                </div>
              ) : (
                <div className="table-scroller">
                  <table className="data-table">
                    <caption className="sr-only">
                      Customer errands and their Admin Runner assignments
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Errand</th>
                        <th scope="col">Customer</th>
                        <th scope="col">Pickup and destination</th>
                        <th scope="col">Fees</th>
                        <th scope="col">Runner</th>
                        <th scope="col">Dispatch status</th>
                        <th scope="col">
                          <span className="sr-only">Assignment action</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleErrands.map((errand) => {
                        const serviceRunners = runners.filter((runner) =>
                          runner.serviceTypes.includes(errand.runnerServiceType),
                        );
                        const availableRunners = serviceRunners.filter(
                          (runner) => runner.isOnline && !runner.hasActiveJob,
                        );
                        const selectedRunnerId =
                          selectedRunnerByErrand[errand.id] || "";
                        const assignmentLabel = getAssignmentLabel(errand);
                        const accepted =
                          errand.assignment?.jobStatus === "accepted" ||
                          errand.assignment?.jobStatus === "in_progress" ||
                          errand.assignment?.jobStatus === "completion_submitted" ||
                          errand.assignment?.jobStatus === "completed";
                        const canAssign =
                          errand.status === "requested" &&
                          !errand.hasLegacyProviderAssignment &&
                          !accepted;
                        const isBusy = assigningId === errand.id;
                        const awaitingCompletionReview =
                          errand.assignment?.jobStatus === "completion_submitted";

                        return (
                          <tr key={errand.id}>
                            <td>
                              <div className="table-title">
                                <b>{errand.title || "Untitled errand"}</b>
                                <small>{errand.publicCode}</small>
                              </div>
                              <span className="priority-label">
                                {readable(errand.category)}
                              </span>
                              <small className="date-cell">
                                {formatDate(errand.createdAt)}
                              </small>
                            </td>

                            <td>
                              <div>{errand.customer.name || "Customer"}</div>
                              <small>{errand.customer.phone || errand.customer.email || "No contact"}</small>
                            </td>

                            <td>
                              <div>
                                <b>From:</b>{" "}
                                {errand.pickupLocation || "Not specified"}
                              </div>
                              <small>
                                <b>To:</b>{" "}
                                {errand.destinationLocation || "Not specified"}
                              </small>
                              <span className="timeline-state">
                                {serviceLabel(errand.runnerServiceType)}
                              </span>
                            </td>

                            <td>
                              <div className="money-cell">
                                {formatMoney(errand.serviceFeeAmount, errand.currency)}
                              </div>
                              <small>
                                Runner: {formatMoney(errand.runnerPayoutAmount, errand.currency)}
                              </small>
                              <small>
                                Payment: {readable(errand.paymentStatus)}
                              </small>
                            </td>

                            <td>
                              {canAssign ? (
                                <div className="admin-errand-runner-select">
                                  <label
                                    className="sr-only"
                                    htmlFor={"runner-" + errand.id}
                                  >
                                    Select Runner for {errand.publicCode}
                                  </label>
                                  <select
                                    id={"runner-" + errand.id}
                                    value={selectedRunnerId}
                                    onChange={(event) =>
                                      setSelectedRunnerByErrand((current) => ({
                                        ...current,
                                        [errand.id]: event.target.value,
                                      }))
                                    }
                                    disabled={isBusy || serviceRunners.length === 0}
                                  >
                                    <option value="">
                                      {serviceRunners.length === 0
                                        ? "No matching Runner"
                                        : "Select Runner"}
                                    </option>
                                    {serviceRunners.map((runner) => (
                                      <option
                                        key={runner.id}
                                        value={runner.id}
                                        disabled={!runner.isOnline || runner.hasActiveJob}
                                      >
                                        {runnerLabel(runner)}
                                        {runner.isOnline ? " · Online" : " · Offline"}
                                        {runner.hasActiveJob ? " · Busy" : ""}
                                      </option>
                                    ))}
                                  </select>
                                  <small>
                                    {availableRunners.length > 0
                                      ? availableRunners.length + " eligible Runner(s) available"
                                      : serviceRunners.length > 0
                                        ? "No Runner for this service is currently online and free"
                                        : "No approved Runner has selected " + serviceLabel(errand.runnerServiceType)}
                                  </small>
                                </div>
                              ) : (
                                <div>
                                  <b>{errand.assignment?.runnerName || "—"}</b>
                                  <small className="date-cell">
                                    {awaitingCompletionReview
                                      ? "Runner submitted completion"
                                      : errand.assignment?.jobStatus === "completed"
                                        ? "Admin confirmed completion"
                                        : errand.assignment?.runnerId
                                          ? "Runner account linked"
                                          : "No Runner offer"}
                                  </small>
                                </div>
                              )}
                            </td>

                            <td>
                              <span className={"status-badge " + assignmentLabel.className}>
                                {assignmentLabel.label}
                              </span>
                              {errand.assignment?.offerExpiresAt &&
                              errand.assignment.jobStatus === "offered" ? (
                                <small className="date-cell">
                                  Expires {formatDate(errand.assignment.offerExpiresAt)}
                                </small>
                              ) : null}
                              {awaitingCompletionReview && errand.assignment?.completionSubmittedAt ? (
                                <small className="date-cell">
                                  Submitted {formatDate(errand.assignment.completionSubmittedAt)}
                                </small>
                              ) : null}
                              {errand.assignment?.jobStatus === "completed" && errand.assignment.completedAt ? (
                                <small className="date-cell">
                                  Confirmed {formatDate(errand.assignment.completedAt)}
                                </small>
                              ) : null}
                            </td>

                            <td>
                              {awaitingCompletionReview ? (
                                <button
                                  type="button"
                                  className="button small"
                                  onClick={() => void confirmCompletion(errand)}
                                  disabled={isBusy || !!assigningId}
                                  aria-busy={isBusy}
                                >
                                  {isBusy ? "Confirming…" : "Confirm completion"}
                                </button>
                              ) : canAssign ? (
                                <button
                                  type="button"
                                  className="button small"
                                  onClick={() => void assignErrand(errand)}
                                  disabled={!selectedRunnerId || isBusy || !!assigningId || availableRunners.length === 0}
                                  aria-busy={isBusy}
                                >
                                  {isBusy
                                    ? "Assigning…"
                                    : errand.assignment
                                      ? "Reassign"
                                      : "Assign"}
                                </button>
                              ) : accepted ? (
                                <span className="timeline-state">
                                  {errand.assignment?.jobStatus === "completed"
                                    ? "Admin confirmed"
                                    : "Runner accepted"}
                                </span>
                              ) : (
                                <span className="timeline-state">View only</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <footer className="app-footer">
            <span>SaMi Administration</span>
            <span>Consider it done.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
