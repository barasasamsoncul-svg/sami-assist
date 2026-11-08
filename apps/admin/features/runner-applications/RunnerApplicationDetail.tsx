"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function RunnerApplicationDetail({
  runnerId,
}: Props) {
  const [application, setApplication] =
    useState<RunnerApplication | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadApplication() {
      setLoading(true);
      setError("");

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

        if (active) {
          setApplication(data.application);
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load Runner application.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadApplication();

    return () => {
      active = false;
    };
  }, [runnerId]);

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <Brand />
          <div className="product-tag">ADMIN WORKSPACE</div>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="sidebar-nav" aria-label="Admin navigation">
          <Link className="nav-item" href="/admin">
            <span className="nav-glyph">⌂</span>
            <span>Overview</span>
          </Link>

          <div className="workspace-label">OPERATIONS</div>

          <Link
            className="nav-item current"
            href="/admin/runner-applications"
            aria-current="page"
          >
            <span className="nav-glyph">♙</span>
            <span>Runner applications</span>
          </Link>

          <div className="workspace-label">ACCOUNT</div>

          <Link className="nav-item" href="/admin/security">
            <span className="nav-glyph">⚙</span>
            <span>Security settings</span>
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
            <Link href="/admin">Admin</Link>
            <b>/</b>
            <Link href="/admin/runner-applications">
              Runner applications
            </Link>
            <b>/</b>
            <strong>Application details</strong>
          </div>

          <div className="topbar-actions">
            <span className="account-pill">
              <i />
              Admin session
            </span>
          </div>
        </header>

        <main className="page-content">
          <div className="page-heading">
            <div>
              <div className="section-kicker">
                RUNNER MANAGEMENT
              </div>

              <h1>Application review</h1>

              <p>
                Inspect Runner account information, verify submitted
                documents and record onboarding decisions.
              </p>
            </div>

            <div className="page-heading-actions">
              <Link
                href="/admin/runner-applications"
                className="button ghost"
              >
                ← All applications
              </Link>
            </div>
          </div>

          {loading && (
            <div className="empty-state">
              <span className="mini-spinner" />
              <p>Loading application details…</p>
            </div>
          )}

          {!loading && error && (
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
          )}

          {!loading && !error && application && (
            <div className="view-stack">
              <section className="provider-profile-hero">
                <div className="profile-avatar-large">
                  {(application.fullName || "R")
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase())
                    .join("")}
                </div>

                <div className="profile-hero-copy">
                  <div className="section-kicker">
                    RUNNER PROFILE
                  </div>

                  <h2>
                    {application.fullName || "Unnamed Runner"}
                  </h2>

                  <p>
                    {application.email || "No email provided"}
                    {" · "}
                    {application.phone}
                  </p>

                  <div className="profile-badges">
                    <span className="timeline-state">
                      {readable(application.verificationStatus)}
                    </span>

                    <span className="timeline-state">
                      Account: {readable(application.accountStatus)}
                    </span>
                  </div>
                </div>
              </section>

              <section className="surface-card">
                <div className="surface-heading">
                  <div>
                    <h2>Personal and account information</h2>
                    <p>
                      Identity and registration information supplied
                      by this Runner.
                    </p>
                  </div>
                </div>

                <div className="detail-info-grid">
                  <div>
                    <small>Full name</small>
                    <b>{application.fullName || "Not provided"}</b>
                  </div>

                  <div>
                    <small>Email address</small>
                    <b>{application.email || "Not provided"}</b>
                  </div>

                  <div>
                    <small>Phone number</small>
                    <b>{application.phone}</b>
                  </div>

                  <div>
                    <small>Service area</small>
                    <b>{application.serviceArea || "Not provided"}</b>
                  </div>

                  <div>
                    <small>Vehicle type</small>
                    <b>{readable(application.vehicleType)}</b>
                  </div>

                  <div>
                    <small>Vehicle registration</small>
                    <b>
                      {application.vehicleRegistration || "Not provided"}
                    </b>
                  </div>

                  <div>
                    <small>Application created</small>
                    <b>{formatDate(application.createdAt)}</b>
                  </div>

                  <div>
                    <small>Last updated</small>
                    <b>{formatDate(application.updatedAt)}</b>
                  </div>
                </div>
              </section>

              <section className="surface-card">
                <div className="surface-heading">
                  <div>
                    <h2>Selected service categories</h2>
                    <p>
                      Services this Runner selected during registration.
                    </p>
                  </div>

                  <span className="soft-count">
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
                      <span
                        key={category.key}
                        className="priority-label"
                      >
                        {category.label || readable(category.key)}
                      </span>
                    ))}
                  </div>
                )}
              </section>

              <section className="surface-card">
                <div className="surface-heading">
                  <div>
                    <h2>Verification documents</h2>
                    <p>
                      Review documents individually. Rejected and
                      replacement-required files are removed from R2.
                    </p>
                  </div>

                  <span className="soft-count">
                    {application.documents.length}
                  </span>
                </div>

                {application.documents.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">▤</div>
                    <h3>No documents submitted</h3>
                    <p>
                      This Runner has not submitted verification
                      documents yet.
                    </p>
                  </div>
                ) : (
                  <div className="attention-list">
                    {application.documents.map((document) => (
                      <article
                        key={document.id}
                        className="rounded-xl border border-slate-200 p-4"
                      >
                        <div className="attention-row">
                          <div className="attention-mark blue">
                            ▤
                          </div>

                          <div className="attention-copy">
                            <b>
                              {document.requirementTitle ||
                                readable(document.documentType)}
                            </b>

                            <small>
                              {document.categoryLabel
                                ? `${document.categoryLabel} · `
                                : ""}
                              {document.required
                                ? "Required document"
                                : "Optional document"}
                            </small>

                            <small>
                              Submitted: {formatDate(document.submittedAt)}
                            </small>

                            {document.requirementInstructions && (
                              <small>
                                Instructions:{" "}
                                {document.requirementInstructions}
                              </small>
                            )}

                            {document.rejectionReason && (
                              <small className="text-red-700">
                                Review reason: {document.rejectionReason}
                              </small>
                            )}

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className="timeline-state">
                                {readable(document.reviewStatus)}
                              </span>

                              {document.reviewedAt && (
                                <span className="text-xs text-slate-500">
                                  Reviewed: {formatDate(document.reviewedAt)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="provider-actions">
                            {document.fileUrl ? (
                              <a
                                className="button ghost"
                                href={document.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                View document ↗
                              </a>
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
                    ))}
                  </div>
                )}

                <p className="muted small-copy">
                  Document links are temporary and expire after one hour.
                  Reload the application to obtain fresh links.
                </p>
              </section>

              <RunnerApplicationDecision
                runnerId={application.id}
                verificationStatus={application.verificationStatus}
              />
            </div>
          )}

          <footer className="app-footer">
            <span>SaMi Administration</span>
            <span>Runner application review</span>
          </footer>
        </main>
      </div>
    </div>
  );
}