
"use client";

import Brand from "@/components/Brand";
import { useEffect, useState, type FormEvent } from "react";

type SetupStatus = {
  adminExists: boolean;
  tokenConfigured: boolean;
  setupAvailable: boolean;
};

export default function AdminSetupForm() {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    async function checkSetup() {
      try {
        const response = await fetch(
          "/api/admin/auth/setup-status",
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
          },
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.ok) {
          throw new Error(
            data.error || "Setup status could not be checked.",
          );
        }

        if (active) {
          setStatus({
            adminExists: Boolean(data.adminExists),
            tokenConfigured: Boolean(data.tokenConfigured),
            setupAvailable: Boolean(data.setupAvailable),
          });
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Setup status could not be checked.",
          );
        }
      } finally {
        if (active) {
          setChecking(false);
        }
      }
    }

    void checkSetup();

    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy || !status?.setupAvailable) return;

    setError("");
    setMessage("");
    setBusy(true);

    const form = new FormData(event.currentTarget);

    const fullName = String(form.get("fullName") || "")
      .trim()
      .replace(/\s+/g, " ");

    const email = String(form.get("email") || "")
      .trim()
      .toLowerCase();

    const password = String(form.get("password") || "");
    const bootstrapToken = String(form.get("token") || "");

    try {
      // Step 1: Create the first administrator through
      // the dedicated Admin bootstrap endpoint.
      const bootstrapResponse = await fetch(
        "/api/admin/auth/bootstrap",
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "x-admin-bootstrap-token": bootstrapToken,
          },
          body: JSON.stringify({
            fullName,
            email,
            password,
          }),
        },
      );

      const bootstrapData = await bootstrapResponse
        .json()
        .catch(() => ({}));

      if (!bootstrapResponse.ok || !bootstrapData.ok) {
        throw new Error(
          bootstrapData.error ||
            "Administrator account creation failed.",
        );
      }

      // Step 2: Sign in using the dedicated Admin login.
      // Bootstrap deliberately does not create any session.
      const loginResponse = await fetch(
        "/api/admin/auth/login",
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        },
      );

      const loginData = await loginResponse
        .json()
        .catch(() => ({}));

      if (!loginResponse.ok || !loginData.ok) {
        setStatus({
          adminExists: true,
          tokenConfigured: true,
          setupAvailable: false,
        });

        setMessage(
          "Your administrator account was created successfully, but automatic sign-in could not be completed. Sign in using your new credentials.",
        );

        return;
      }

      // Step 3: Enter the Admin dashboard.
      window.location.assign("/admin");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Administrator setup failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-wrap">
      <aside className="auth-aside">
        <Brand />

        <div>
          <div className="eyebrow">One-time setup</div>

          <h1>Set up operations.</h1>

          <p className="lead">
            Create the first SaMi administrator account
            using the private bootstrap token.
          </p>
        </div>

        <small className="muted">
          Keep your setup token private.
        </small>
      </aside>

      <section className="auth-main">
        <div className="auth-card">
          <h2>Administrator setup</h2>

          <p className="muted">
            This setup is available only until the first
            administrator account has been created.
          </p>

          {checking && (
            <p className="muted">
              Checking administrator setup configuration…
            </p>
          )}

          {!checking && status && !status.tokenConfigured && (
            <div className="error" role="alert">
              Administrator setup is not enabled in this
              deployment. Configure ADMIN_BOOTSTRAP_TOKEN
              in Vercel and redeploy.
              The token must contain at least 32 characters.
            </div>
          )}

          {!checking && status?.adminExists && (
            <div className="notice" role="status">
              <strong>An administrator already exists.</strong>

              <p>
                First-time setup is closed. Use the dedicated
                Admin login to access your account.
              </p>

              <a href="/admin/login">
                Go to Admin sign in
              </a>
            </div>
          )}

          {!checking && !status && (
            <div className="error" role="alert">
              {error ||
                "The setup status check failed. Refresh this page and try again."}
            </div>
          )}

          {message && (
            <div className="notice" role="status">
              <p>{message}</p>

              <a href="/admin/login">
                Continue to Admin sign in
              </a>
            </div>
          )}

          <form className="form-stack" onSubmit={submit}>
            <div className="field">
              <label htmlFor="token">Bootstrap token</label>

              <input
                id="token"
                name="token"
                type="password"
                required
                autoComplete="off"
              />
            </div>

            <div className="field">
              <label htmlFor="fullName">Full name</label>

              <input
                id="fullName"
                name="fullName"
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
              />
            </div>

            <div className="field">
              <label htmlFor="email">Email address</label>

              <input
                id="email"
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>

              <input
                id="password"
                name="password"
                type="password"
                minLength={14}
                maxLength={128}
                required
                autoComplete="new-password"
              />
            </div>

            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={
                busy ||
                checking ||
                !status?.setupAvailable
              }
            >
              {busy
                ? "Creating administrator…"
                : "Create administrator"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
