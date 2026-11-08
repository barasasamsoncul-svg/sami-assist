
"use client";

import Brand from "@/components/Brand";
import Link from "next/link";
import { FormEvent, useState } from "react";

type RecoveryStep = "email" | "verify" | "complete";

export default function AdminForgotPasswordPage() {
  const [step, setStep] = useState<RecoveryStep>("email");
  const [email, setEmail] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setMessage("");
    setBusy(true);

    try {
      const response = await fetch(
        "/api/admin/auth/forgot-password",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            email: email.trim(),
          }),
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to process your request. Please try again.",
        );
      }

      if (
        typeof data.challengeId !== "string" ||
        !data.challengeId
      ) {
        throw new Error(
          "A verification session could not be created. Please try again.",
        );
      }

      setChallengeId(data.challengeId);
      setMessage(
        "If this email belongs to an active SaMi administrator, a six-digit verification code has been sent. Check your inbox and spam folder. The code expires in 10 minutes.",
      );
      setStep("verify");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to request a verification code.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyAndResetPassword(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError("");
    setBusy(true);

    const form = new FormData(event.currentTarget);

    const code = String(form.get("code") || "").trim();
    const newPassword = String(
      form.get("newPassword") || "",
    );
    const confirmPassword = String(
      form.get("confirmPassword") || "",
    );

    if (!/^[0-9]{6}$/.test(code)) {
      setError("Enter the six-digit verification code.");
      setBusy(false);
      return;
    }

    if (
      newPassword.length < 14 ||
      newPassword.length > 128
    ) {
      setError(
        "Your new password must contain between 14 and 128 characters.",
      );
      setBusy(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("The passwords do not match.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch(
        "/api/admin/auth/reset-password",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            challengeId,
            code,
            newPassword,
          }),
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Your password could not be changed. Please try again.",
        );
      }

      setMessage(
        data.message ||
          "Your administrator password has been changed successfully. Sign in again using your new password.",
      );
      setChallengeId("");
      setStep("complete");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to verify your code. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function useDifferentEmail() {
    setChallengeId("");
    setError("");
    setMessage("");
    setStep("email");
  }

  return (
    <main className="auth-wrap">
      <aside className="auth-aside">
        <Brand />

        <div>
          <div className="eyebrow">SaMi Administration</div>

          <h1>
            Secure access,
            <br />
            restored.
          </h1>

          <p className="lead">
            Recover access to your administrator workspace
            through a secure email verification code.
          </p>
        </div>

        <small className="muted">
          Authorised administrators only.
        </small>
      </aside>

      <section className="auth-main">
        <div className="auth-card">
          {step === "email" && (
            <>
              <h2>Forgot your password?</h2>

              <p className="muted">
                Enter the email address associated with your
                administrator account. We will send you a
                six-digit verification code.
              </p>

              <form
                className="form-stack"
                onSubmit={requestCode}
              >
                <div className="field">
                  <label htmlFor="recovery-email">
                    Administrator email
                  </label>

                  <input
                    id="recovery-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) =>
                      setEmail(event.target.value)
                    }
                    required
                    maxLength={254}
                    placeholder="admin@example.com"
                    disabled={busy}
                  />
                </div>

                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}

                <button type="submit" disabled={busy}>
                  {busy
                    ? "Sending verification code…"
                    : "Send verification code"}
                </button>
              </form>

              <p className="muted">
                Remembered your password?{" "}
                <Link href="/admin/login">
                  Return to sign in
                </Link>
              </p>
            </>
          )}

          {step === "verify" && (
            <>
              <h2>Verify your email</h2>

              <p className="muted">
                Enter the six-digit code sent to your
                administrator email address, then choose
                your new password.
              </p>

              {message && (
                <p className="muted" role="status">
                  {message}
                </p>
              )}

              <form
                className="form-stack"
                onSubmit={verifyAndResetPassword}
              >
                <div className="field">
                  <label htmlFor="recovery-code">
                    Six-digit verification code
                  </label>

                  <input
                    id="recovery-code"
                    name="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    placeholder="000000"
                    required
                    disabled={busy}
                  />
                </div>

                <div className="field">
                  <label htmlFor="recovery-new-password">
                    New password
                  </label>

                  <input
                    id="recovery-new-password"
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={14}
                    maxLength={128}
                    placeholder="Enter your new password"
                    required
                    disabled={busy}
                  />

                  <small className="muted">
                    Use between 14 and 128 characters.
                  </small>
                </div>

                <div className="field">
                  <label htmlFor="recovery-confirm-password">
                    Confirm new password
                  </label>

                  <input
                    id="recovery-confirm-password"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={14}
                    maxLength={128}
                    placeholder="Enter your new password again"
                    required
                    disabled={busy}
                  />
                </div>

                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}

                <button type="submit" disabled={busy}>
                  {busy
                    ? "Verifying and updating password…"
                    : "Verify code and change password"}
                </button>
              </form>

              <button
                type="button"
                className="secondary"
                onClick={useDifferentEmail}
                disabled={busy}
              >
                Use a different email address
              </button>
            </>
          )}

          {step === "complete" && (
            <>
              <h2>Password changed</h2>

              <p className="muted" role="status">
                {message}
              </p>

              <p className="muted">
                For security, all existing administrator
                sessions have been signed out. Sign in again
                using your new password.
              </p>

              <Link
                href="/admin/login"
                className="button"
              >
                Return to Admin sign in
              </Link>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
