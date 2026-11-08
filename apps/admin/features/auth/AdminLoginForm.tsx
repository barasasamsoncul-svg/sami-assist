
"use client";

import Brand from "@/components/Brand";
import { FormEvent, useState } from "react";

export default function AdminLoginForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setBusy(true);

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          email: String(form.get("email") || "").trim(),
          password: String(form.get("password") || ""),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Admin sign-in failed.");
      }

      window.location.assign("/admin");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in. Please try again."
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
          <div className="eyebrow">SaMi Administration</div>
          <h1>Operations, under control.</h1>
          <p className="lead">
            Manage your SaMi platform, oversee operations and coordinate
            your teams from one workspace.
          </p>
        </div>

        <small className="muted">
          Authorised administrators only.
        </small>
      </aside>

      <section className="auth-main">
        <div className="auth-card">
          <h2>Admin sign in</h2>
          <p className="muted">
            Enter your administrator credentials to continue.
          </p>

          <form className="form-stack" onSubmit={submit}>
            <div className="field">
              <label htmlFor="admin-email">Email address</label>
              <input
                id="admin-email"
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
                placeholder="admin@example.com"
              />
            </div>

            <div className="field">
              <label htmlFor="admin-password">Password</label>

              <input
                id="admin-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                maxLength={128}
                placeholder="Enter your password"
              />

              <button
                type="button"
                className="secondary"
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? "Hide password" : "Show password"}
              </button>
            </div>

            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in to Admin"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
