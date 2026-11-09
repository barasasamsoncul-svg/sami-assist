"use client";

import { useRef, useState, type FormEvent } from "react";

type SignOutStage = "idle" | "confirming";

const MIN_PASSWORD = 14;
const MAX_PASSWORD = 128;

export default function AdminSecurityForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [signOutStage, setSignOutStage] = useState<SignOutStage>("idle");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const currentRef = useRef<HTMLInputElement | null>(null);
  const newRef = useRef<HTMLInputElement | null>(null);
  const confirmRef = useRef<HTMLInputElement | null>(null);

  const trimmedNew = newPassword;
  const trimmedConfirm = confirmPassword;

  const newLength = trimmedNew.length;
  const newTooShort = newLength > 0 && newLength < MIN_PASSWORD;
  const newTooLong = newLength > MAX_PASSWORD;
  const newLengthValid = newLength >= MIN_PASSWORD && newLength <= MAX_PASSWORD;

  const hasConfirm = trimmedConfirm.length > 0;
  const passwordsMatch = hasConfirm && trimmedNew === trimmedConfirm;
  const passwordsDontMatch = hasConfirm && trimmedNew !== trimmedConfirm;

  const canSubmit =
    !saving &&
    currentPassword.length > 0 &&
    newLengthValid &&
    passwordsMatch;

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (trimmedNew !== trimmedConfirm) {
      setError("The new passwords do not match.");
      confirmRef.current?.focus();
      return;
    }

    if (!newLengthValid) {
      setError(
        `Your new password must contain between ${MIN_PASSWORD} and ${MAX_PASSWORD} characters.`,
      );
      newRef.current?.focus();
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/admin/auth/change-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || "Unable to change your password.");
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage(
        result?.message ||
          "Your password has been changed. Other active Admin sessions have been revoked.",
      );

      // Return focus to the top of the form so the success is announced
      // and the user knows the form was reset.
      currentRef.current?.focus();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while changing your password.",
      );
      currentRef.current?.focus();
    } finally {
      setSaving(false);
    }
  }

  function startSignOut() {
    setError("");
    setMessage("");
    setSignOutStage("confirming");
  }

  function cancelSignOut() {
    setSignOutStage("idle");
  }

  async function handleLogout() {
    setError("");
    setMessage("");
    setLoggingOut(true);

    try {
      const response = await fetch("/api/admin/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error("Unable to sign out. Please try again.");
      }

      window.location.assign("/admin/login");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to sign out.",
      );
      setLoggingOut(false);
      setSignOutStage("idle");
    }
  }

  return (
    <section className="space-y-8" aria-busy={saving || loggingOut}>
      <div>
        <h2 className="text-xl font-semibold text-slate-900">
          Account security
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Manage your Admin password and active session.
        </p>
      </div>

      <form
        onSubmit={handlePasswordChange}
        aria-labelledby="change-password-heading"
        className="max-w-xl space-y-5 rounded-xl border border-slate-200 bg-white p-6"
        noValidate
      >
        <div>
          <h3
            id="change-password-heading"
            className="text-base font-semibold text-slate-900"
          >
            Change password
          </h3>
          <p
            id="change-password-hint"
            className="mt-1 text-sm text-slate-500"
          >
            Use a password between {MIN_PASSWORD} and {MAX_PASSWORD}{" "}
            characters. Changing your password signs you out of other
            browsers.
          </p>
        </div>

        {/* Current password */}
        <PasswordField
          id="admin-current-password"
          label="Current password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={setCurrentPassword}
          visible={showCurrent}
          onToggleVisible={() => setShowCurrent((v) => !v)}
          inputRef={currentRef}
          disabled={saving}
          minLength={1}
          maxLength={MAX_PASSWORD}
        />

        {/* New password */}
        <div className="space-y-2">
          <PasswordField
            id="admin-new-password"
            label="New password"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
            visible={showNew}
            onToggleVisible={() => setShowNew((v) => !v)}
            inputRef={newRef}
            disabled={saving}
            minLength={MIN_PASSWORD}
            maxLength={MAX_PASSWORD}
            ariaInvalid={newTooShort || newTooLong}
            ariaDescribedBy="admin-new-password-counter"
          />

          <div
            id="admin-new-password-counter"
            className="flex items-center justify-between gap-3 text-xs"
            aria-live="polite"
          >
            <span
              className={
                newTooShort || newTooLong
                  ? "text-amber-700"
                  : newLengthValid
                    ? "text-green-600"
                    : "text-slate-500"
              }
            >
              {newLength === 0
                ? `${MIN_PASSWORD}–${MAX_PASSWORD} characters required`
                : newTooShort
                  ? `${MIN_PASSWORD - newLength} more character${MIN_PASSWORD - newLength === 1 ? "" : "s"} required`
                  : newTooLong
                    ? `${newLength - MAX_PASSWORD} character${newLength - MAX_PASSWORD === 1 ? "" : "s"} over the limit`
                    : "Length requirement met"}
            </span>
            <span className="text-slate-500">
              {newLength} / {MAX_PASSWORD}
            </span>
          </div>
        </div>

        {/* Confirm password */}
        <div className="space-y-2">
          <PasswordField
            id="admin-confirm-password"
            label="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            visible={showConfirm}
            onToggleVisible={() => setShowConfirm((v) => !v)}
            inputRef={confirmRef}
            disabled={saving}
            minLength={MIN_PASSWORD}
            maxLength={MAX_PASSWORD}
            ariaInvalid={passwordsDontMatch}
            ariaDescribedBy="admin-confirm-password-status"
          />

          <div
            id="admin-confirm-password-status"
            className="text-xs"
            aria-live="polite"
          >
            {passwordsMatch ? (
              <span className="inline-flex items-center gap-1 text-green-600">
                <span aria-hidden="true">✓</span>
                Passwords match
              </span>
            ) : passwordsDontMatch ? (
              <span className="inline-flex items-center gap-1 text-red-600">
                <span aria-hidden="true">✕</span>
                Passwords do not match
              </span>
            ) : (
              <span className="text-slate-500">
                Re-enter the new password to confirm
              </span>
            )}
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        ) : null}

        {message ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800"
          >
            {message}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          aria-busy={saving}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Changing password…" : "Change password"}
        </button>
      </form>

      {/* Sign out card */}
      <div className="max-w-xl rounded-xl border border-red-200 bg-white p-6">
        <h3 className="text-base font-semibold text-slate-900">Sign out</h3>
        <p className="mt-1 text-sm text-slate-600">
          End your current Admin session on this browser.
        </p>

        {signOutStage === "idle" ? (
          <button
            type="button"
            onClick={startSignOut}
            disabled={loggingOut || saving}
            className="mt-4 rounded-lg border border-red-300 px-5 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Sign out
          </button>
        ) : (
          <div className="mt-4 space-y-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              Confirm sign out
            </p>
            <p className="text-sm text-amber-900">
              You will be signed out of this browser and returned to the
              Admin sign-in page. Any unsaved changes on this page will be
              lost.
            </p>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={cancelSignOut}
                disabled={loggingOut}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                aria-busy={loggingOut}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loggingOut ? "Signing out…" : "Yes, sign out"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function PasswordField({
  id,
  label,
  autoComplete,
  value,
  onChange,
  visible,
  onToggleVisible,
  inputRef,
  disabled,
  minLength,
  maxLength,
  ariaInvalid,
  ariaDescribedBy,
}: {
  id: string;
  label: string;
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
  visible: boolean;
  onToggleVisible: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  disabled: boolean;
  minLength: number;
  maxLength: number;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
}) {
  const toggleLabel = visible
    ? `Hide ${label.toLowerCase()}`
    : `Show ${label.toLowerCase()}`;

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>

      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          maxLength={maxLength}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-invalid={ariaInvalid || undefined}
          aria-describedby={ariaDescribedBy}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-11 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
        />

        <button
          type="button"
          onClick={onToggleVisible}
          disabled={disabled}
          aria-label={toggleLabel}
          aria-pressed={visible}
          tabIndex={-1}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {visible ? (
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
          ) : (
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
          )}
        </button>
      </div>
    </div>
  );
}