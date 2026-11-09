"use client";

import Brand from "@/components/Brand";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

export default function AdminLoginForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const emailRef = useRef<HTMLInputElement | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setError("");
    setSubmitted(true);
    setBusy(true);

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");

    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ email, password }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error || "Admin sign-in failed.");
      }

      window.location.assign("/admin");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in. Please try again.",
      );
      setBusy(false);
      // Land the cursor back on the first field so the user can correct
      // and retry without a mouse.
      emailRef.current?.focus();
    }
  }

  const showInvalid = submitted && Boolean(error);

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

        <small className="muted">Authorised administrators only.</small>
      </aside>

      <section className="auth-main">
        <div className="auth-card">
          <h2 id="admin-login-heading">Admin sign in</h2>
          <p className="muted">
            Enter your administrator credentials to continue.
          </p>

          <form
            className="form-stack"
            onSubmit={submit}
            aria-labelledby="admin-login-heading"
            aria-busy={busy}
            noValidate
          >
            {/* Email */}
            <div className="field">
              <label htmlFor="admin-email">Email address</label>
              <input
                ref={emailRef}
                id="admin-email"
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
                placeholder="admin@example.com"
                autoFocus
                disabled={busy}
                aria-invalid={showInvalid || undefined}
                aria-describedby={error ? "admin-login-error" : undefined}
              />
            </div>

            {/* Password with inline toggle */}
            <div className="field">
              <label htmlFor="admin-password">Password</label>

              <div className="relative">
                <input
                  id="admin-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  maxLength={128}
                  placeholder="Enter your password"
                  disabled={busy}
                  aria-invalid={showInvalid || undefined}
                  aria-describedby={
                    error ? "admin-login-error" : undefined
                  }
                  style={{ paddingRight: "2.75rem" }}
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={busy}
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                  aria-pressed={showPassword}
                  tabIndex={-1}
                  className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <EyeIcon visible={showPassword} />
                </button>
              </div>
            </div>

            <div>
              <Link
                href="/admin/forgot-password"
                className="muted underline-offset-2 hover:underline"
              >
                Forgot your password?
              </Link>
            </div>

            {error ? (
              <div
                id="admin-login-error"
                role="alert"
                aria-live="assertive"
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className="inline-flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <span
                    aria-hidden="true"
                    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  />
                  Signing in…
                </>
              ) : (
                "Sign in to Admin"
              )}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function EyeIcon({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}