"use client";

import { useState, type FormEvent } from "react";

export default function AdminSecurityForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }

    if (newPassword.length < 14 || newPassword.length > 128) {
      setError("Your new password must contain between 14 and 128 characters.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/admin/auth/change-password", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
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
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while changing your password.",
      );
    } finally {
      setSaving(false);
    }
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
    }
  }

  return (
    <section className="space-y-8">
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
        className="max-w-xl space-y-5 rounded-xl border border-slate-200 bg-white p-6"
      >
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Change password
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Use a password between 14 and 128 characters.
          </p>
        </div>

        <div>
          <label
            htmlFor="admin-current-password"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Current password
          </label>
          <input
            id="admin-current-password"
            type="password"
            autoComplete="current-password"
            required
            minLength={1}
            maxLength={128}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        </div>

        <div>
          <label
            htmlFor="admin-new-password"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            New password
          </label>
          <input
            id="admin-new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={14}
            maxLength={128}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        </div>

        <div>
          <label
            htmlFor="admin-confirm-password"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Confirm new password
          </label>
          <input
            id="admin-confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={14}
            maxLength={128}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {message && (
          <p role="status" className="text-sm text-green-700">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Changing password..." : "Change password"}
        </button>
      </form>

      <div className="max-w-xl rounded-xl border border-red-200 bg-white p-6">
        <h3 className="text-base font-semibold text-slate-900">
          Sign out
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          End your current Admin session on this browser.
        </p>

        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="mt-4 rounded-lg border border-red-300 px-5 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loggingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </section>
  );
}