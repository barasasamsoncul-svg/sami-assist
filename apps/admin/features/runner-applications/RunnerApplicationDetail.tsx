"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import Brand from "@/components/Brand";
import RunnerApplicationDecision from "@/apps/admin/features/runner-applications/RunnerApplicationDecision";
import RunnerDocumentDecision from "@/apps/admin/features/runner-applications/RunnerDocumentDecision";

type RunnerDocument = {
  id: string;
  documentType: string;
  categoryKey: string | null;
  categoryLabel: string | null;
  requirementKey: string | null;
  requirementTitle: string | null;
  requirementInstructions: string | null;
  required: boolean | null;
  reviewStatus: string;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  fileUrl: string | null;
  fileUrlExpiresInSeconds: number;
  fileRemovedFromStorage: boolean;
};

type RunnerApplication = {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string;
  accountStatus: string;
  verificationStatus: string;
  serviceArea: string | null;
  vehicleType: string | null;
  vehicleRegistration: string | null;
  selectedCategories: {
    key: string;
    label: string | null;
  }[];
  documents: RunnerDocument[];
  createdAt: string;
  updatedAt: string;
};

type DetailResponse = {
  ok?: boolean;
  error?: string;
  application?: RunnerApplication;
};

type Props = {
  runnerId: string;
};

function readable(value: string | null | undefined) {
  if (!value) return "Not provided";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getInitials(fullName: string | null): string {
  if (!fullName) return "R";
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}

export default function RunnerApplicationDetail({ runnerId }: Props) {
  const [application, setApplication] = useState<RunnerApplication | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  useEffect(() => {
    const isRefresh = application !== null && refreshTick > 0;

    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError("");

    async function loadApplication() {
      try {
        const response = await fetch(
          `/api/admin/runner-applications/${encodeURIComponent(runnerId)}`,
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
          },
        );

        const data =
          (await response.json().catch(() => ({}))) as DetailResponse;

        if (response.status === 401) {
          window.location.assign("/admin/login");
          return;
        }

        if (!response.ok || !data.application) {
          throw new Error(
            data.error || "Runner application could not be loaded.",
          );
        }

        if (activeRef.current) {
          setApplication(data.application);
        }
      } catch (cause) {
        if (activeRef.current) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load Runner application.",
          );
        }
      } finally {
        if (activeRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void loadApplication();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runnerId, refreshTick]);

  const refresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  const showInitialLoading = loading && !application && !error;
  const showErrorState = !loading && error && !application;
  const showContent = !!application;

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
            <span className="nav-glyph" aria-hidden="true">
              ⌂
            </span>
            <span>Overview</span>
          </Link>

          <div className="workspace-label">OPERATIONS</div>

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

          <div className="workspace-label">ACCOUNT</div>

          <Link className="nav-item" href="/admin/security">
            <span className="nav-glyph" aria-hidden="true">
              ⚙
            </span>
            <span>Security settings</span>
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
            <Link href="/admin/runner-applications">
              Runner applications
            </Link>
            <span aria-hidden="true">/</span>
            <strong aria-current="page">Application details</strong>
          </nav>

          <div className="topbar-actions">
            <span className="account-pill">
              <i aria-hidden="true" />
              Admin session
            </span>
          </div>
        </header>

        <main id="main-content" className="page-content">
          <div className="page-heading">
            <div>
              <div className="section-kicker">RUNNER MANAGEMENT</div>
              <h1>Application review</h1>
              <p>
                Inspect Runner account information, verify submitted
                documents and record onboarding decisions.
              </p>
            </div>

            <div className="page-heading-actions">
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing || loading}
                className="button ghost"
                aria-busy={refreshing}
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
              <Link
                href="/admin/runner-applications"
                className="button ghost"
              >
                <span aria-hidden="true">←</span> All applications
              </Link>
            </div>
          </div>

          {showInitialLoading ? (
            <div
              className="empty-state"
              role="status"
              aria-live="polite"
            >
              <span className="mini-spinner" aria-hidden="true" />
              <p>Loading application details…</p>
            </div>
          ) : null}

          {showErrorState ? (
            <div className="surface-card">
              <div className="alert error" role="alert">
                {error}
              </div>
              <p>
                <Link
                  href="/admin/runner-applications"
                  className="inline-link"
                >
                  Return to Runner applications
                </Link>
              </p>
            </div>
          ) : null}

          {showContent && application ? (
            <div className="view-stack">
              {error ? (
                <div className="alert error" role="alert" aria-live="polite">
                  {error}
                </div>
              ) : null}

              {/* ── Profile hero ───────────────────────────────────── */}
              <section
                className="provider-profile-hero"
                aria-labelledby="profile-hero-heading"
              >
                <div className="profile-avatar-large" aria-hidden="true">
                  {getInitials(application.fullName)}
                </div>

                <div className="profile-hero-copy">
                  <div className="section-kicker">RUNNER PROFILE</div>

                  <h2 id="profile-hero-heading">
                    {application.fullName || "Unnamed Runner"}
                  </h2>

                  <p>
                    {application.email || "Not provided"}
                    {" · "}
                    {application.phone}
                  </p>

                  <div className="profile-badges">
                    <span className="timeline-state">
                      Verification:{" "}
                      {readable(application.verificationStatus)}
                    </span>
                    <span className="timeline-state">
                      Account: {readable(application.accountStatus)}
                    </span>
                  </div>
                </div>
              </section>

              {/* ── Personal and account information ──────────────── */}
              <section
                className="surface-card"
                aria-labelledby="personal-heading"
              >
                <div className="surface-heading">
                  <div>
                    <h2 id="personal-heading">
                      Personal and account information
                    </h2>
                    <p>
                      Identity and registration information supplied by
                      this Runner.
                    </p>
                  </div>
                </div>

                <div className="detail-info-grid">
                  <Detail
                    label="Full name"
                    value={application.fullName || "Not provided"}
                  />
                  <Detail
                    label="Email address"
                    value={application.email || "Not provided"}
                  />
                  <Detail label="Phone number" value={application.phone} />
                  <Detail
                    label="Service area"
                    value={application.serviceArea || "Not provided"}
                  />
                  <Detail
                    label="Vehicle type"
                    value={readable(application.vehicleType)}
                  />
                  <Detail
                    label="Vehicle registration"
                    value={application.vehicleRegistration || "Not provided"}
                  />
                  <Detail
                    label="Application created"
                    value={formatDate(application.createdAt)}
                  />
                  <Detail
                    label="Last updated"
                    value={formatDate(application.updatedAt)}
                  />
                </div>
              </section>

              {/* ── Selected service categories ───────────────────── */}
              <section
                className="surface-card"
                aria-labelledby="categories-heading"
              >
                <div className="surface-heading">
                  <div>
                    <h2 id="categories-heading">
                      Selected service categories
                    </h2>
                    <p>
                      Services this Runner selected during registration.
                    </p>
                  </div>
                  <span className="soft-count" aria-hidden="true">
                    {application.selectedCategories.length}
                  </span>
                </div>

                {application.selectedCategories.length === 0 ? (
                  <div className="empty-state">
                    <p>No service categories were recorded.</p>
                  </div>
                ) : (
                  <div className="profile-badges">
                    {application.selectedCategories.map((category) => (
                      <span key={category.key} className="priority-label">
                        {category.label || readable(category.key)}
                      </span>
                    ))}
                  </div>
                )}
              </section>

              {/* ── Verification documents ────────────────────────── */}
              <section
                className="surface-card"
                aria-labelledby="documents-heading"
              >
                <div className="surface-heading">
                  <div>
                    <h2 id="documents-heading">
                      Verification documents
                    </h2>
                    <p>
                      Review each document individually. Rejected and
                      replacement-required files are removed from R2.
                    </p>
                  </div>
                  <span className="soft-count" aria-hidden="true">
                    {application.documents.length}
                  </span>
                </div>

                {application.documents.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon" aria-hidden="true">
                      ▤
                    </div>
                    <h3>No documents submitted</h3>
                    <p>
                      This Runner has not submitted verification
                      documents yet.
                    </p>
                  </div>
                ) : (
                  <div className="attention-list">
                    {application.documents.map((document) => {
                      const documentTitle =
                        document.requirementTitle ||
                        readable(document.documentType);

                      const metaLine = [
                        document.categoryLabel,
                        document.required
                          ? "Required document"
                          : "Optional document",
                      ]
                        .filter(Boolean)
                        .join(" · ");

                      return (
                        <article
                          key={document.id}
                          className="rounded-xl border border-slate-200 p-4"
                          aria-labelledby={`doc-heading-${document.id}`}
                        >
                          <div className="attention-row">
                            <div
                              className="attention-mark blue"
                              aria-hidden="true"
                            >
                              ▤
                            </div>

                            <div className="attention-copy">
                              <h3 id={`doc-heading-${document.id}`}>
                                {documentTitle}
                              </h3>

                              {metaLine ? <small>{metaLine}</small> : null}

                              <small>
                                Submitted: {formatDate(document.submittedAt)}
                                {document.reviewedAt
                                  ? ` · Reviewed: ${formatDate(document.reviewedAt)}`
                                  : null}
                              </small>

                              {document.requirementInstructions ? (
                                <small>
                                  Instructions:{" "}
                                  {document.requirementInstructions}
                                </small>
                              ) : null}

                              {document.rejectionReason ? (
                                <small className="text-red-700">
                                  Review reason: {document.rejectionReason}
                                </small>
                              ) : null}

                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="timeline-state">
                                  {readable(document.reviewStatus)}
                                </span>

                                {document.required === false ? (
                                  <span className="timeline-state">
                                    Optional
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="provider-actions">
                              {document.fileUrl ? (
                                <div className="flex flex-col items-end gap-1">
                                  <a
                                    className="button ghost"
                                    href={document.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`View ${documentTitle} in a new tab`}
                                  >
                                    View document{" "}
                                    <span aria-hidden="true">↗</span>
                                  </a>
                                  <span className="text-xs text-slate-500">
                                    Link expires in{" "}
                                    {Math.max(
                                      1,
                                      Math.round(
                                        document.fileUrlExpiresInSeconds / 60,
                                      ),
                                    )}{" "}
                                    min
                                  </span>
                                </div>
                              ) : (
                                <span className="muted small-copy">
                                  {document.fileRemovedFromStorage
                                    ? "File removed from R2"
                                    : "Document unavailable"}
                                </span>
                              )}
                            </div>
                          </div>

                          <RunnerDocumentDecision
                            runnerId={application.id}
                            documentId={document.id}
                            reviewStatus={document.reviewStatus}
                            fileUrl={document.fileUrl}
                          />
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* ── Application decision ──────────────────────────── */}
              <RunnerApplicationDecision
                runnerId={application.id}
                verificationStatus={application.verificationStatus}
              />
            </div>
          ) : null}

          <footer className="app-footer">
            <span>SaMi Administration</span>
            <span>Runner application review</span>
          </footer>
        </main>
      </div>
    </div>
  );
}