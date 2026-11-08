import Link from "next/link";

import Brand from "@/components/Brand";

type AdminDashboardProps = {
  user: {
    full_name: string;
    email: string;
  };
};

export default function AdminDashboard({
  user,
}: AdminDashboardProps) {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <Brand />
          <div className="product-tag">ADMIN WORKSPACE</div>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="sidebar-nav" aria-label="Admin navigation">
          <Link
            className="nav-item current"
            href="/admin"
            aria-current="page"
          >
            <span className="nav-glyph">⌂</span>
            <span>Overview</span>
          </Link>

          <div className="workspace-label">OPERATIONS</div>

          <Link
            className="nav-item"
            href="/admin/runner-applications"
          >
            <span className="nav-glyph">♙</span>
            <span>Runner applications</span>
          </Link>

          <div className="workspace-label">ACCOUNT</div>

          <Link
            className="nav-item"
            href="/admin/security"
          >
            <span className="nav-glyph">⚙</span>
            <span>Security settings</span>
          </Link>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-profile">
            <div className="avatar">
              {user.full_name
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join("")}
            </div>

            <div className="sidebar-profile-copy">
              <b>{user.full_name}</b>
              <small>Administrator</small>
            </div>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="breadcrumbs">
            <strong>Admin</strong>
            <b>/</b>
            <span>Overview</span>
          </div>

          <div className="topbar-actions">
            <span className="account-pill">
              <i />
              Administrator session
            </span>
          </div>
        </header>

        <main className="page-content">
          <section className="welcome-banner">
            <div className="welcome-copy">
              <span className="welcome-badge">
                SAMI ADMINISTRATION
              </span>

              <h2>
                Welcome back, {user.full_name}.
              </h2>

              <p>
                Your central workspace for overseeing SaMi operations,
                managing people and maintaining service quality.
              </p>

              <Link
                className="button button-large"
                href="/admin/runner-applications"
              >
                Review Runner applications
                <span aria-hidden="true">→</span>
              </Link>
            </div>

            <div className="welcome-ornament" aria-hidden="true">
              <div className="ornament-circle one">S</div>
              <div className="ornament-circle two">A</div>
              <div className="ornament-line" />
              <div className="ornament-chip">
                <b>SaMi</b> Operations
              </div>
            </div>
          </section>

          <div className="page-heading" style={{ marginTop: 30 }}>
            <div>
              <div className="section-kicker">
                MANAGEMENT
              </div>

              <h1>Your workspace</h1>

              <p>
                Access the operational areas assigned to your
                administrator account.
              </p>
            </div>
          </div>

          <div className="view-stack">
            <section className="surface-card">
              <div className="surface-heading">
                <div>
                  <h2>Runner management</h2>
                  <p>
                    Manage Runner onboarding and verification.
                  </p>
                </div>

                <span className="soft-count">01</span>
              </div>

              <div className="attention-row">
                <div className="attention-mark blue">
                  ♙
                </div>

                <div className="attention-copy">
                  <b>Runner applications</b>
                  <small>
                    Review registrations, submitted documents
                    and verification records.
                  </small>
                </div>

                <Link
                  className="button ghost"
                  href="/admin/runner-applications"
                >
                  Open
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </section>

            <section className="surface-card">
              <div className="surface-heading">
                <div>
                  <h2>Administrator account</h2>
                  <p>
                    Currently authenticated administrator.
                  </p>
                </div>
              </div>

              <div className="detail-info-grid">
                <div>
                  <small>Administrator</small>
                  <b>{user.full_name}</b>
                </div>

                <div>
                  <small>Email address</small>
                  <b>{user.email}</b>
                </div>

                <div>
                  <small>Access level</small>
                  <b>Administrator</b>
                </div>

                <div>
                  <small>Session</small>
                  <b>Authenticated</b>
                </div>
              </div>

              <div className="mt-5">
                <Link
                  className="button ghost"
                  href="/admin/security"
                >
                  Manage account security
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
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