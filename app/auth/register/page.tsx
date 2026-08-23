"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";

import {
  APP_CATEGORIES,
  SAMI_APPS,
  getRecommendedAppKeys,
} from "@/lib/sami-apps";

// Debug info type
interface DebugInfo {
  steps: Array<{ step: string; timestamp: string; details?: any }>;
  errors: Array<{ step: string; error: string; stack?: string; timestamp: string }>;
  tableCheck: {
    totalTables: number;
    tables: string[];
    hasUsers: boolean;
    hasBusinesses: boolean;
  } | null;
  summary: {
    tablesInstalled: number;
    success: boolean;
    hasCoreTables: boolean;
    hasBusinessTables: boolean;
  };
}

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");

  const [selectedApps, setSelectedApps] = useState<string[]>(
    getRecommendedAppKeys()
  );

  const [openCategories, setOpenCategories] = useState<string[]>(
    APP_CATEGORIES.map((category) => category.key)
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Debug state
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [showDebugModal, setShowDebugModal] = useState(false);

  const selectedSet = useMemo(
    () => new Set(selectedApps),
    [selectedApps]
  );

  const selectedCount = selectedApps.length;

  function toggleApp(appKey: string) {
    setSelectedApps((current) => {
      if (current.includes(appKey)) {
        return current.filter((key) => key !== appKey);
      }
      return [...current, appKey];
    });
  }

  function toggleCategory(categoryKey: string) {
    setOpenCategories((current) => {
      if (current.includes(categoryKey)) {
        return current.filter((key) => key !== categoryKey);
      }
      return [...current, categoryKey];
    });
  }

  function selectAll() {
    setSelectedApps(SAMI_APPS.map((app) => app.key));
  }

  function clearAll() {
    setSelectedApps([]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) return;

    setError("");
    setDebugInfo(null);
    setShowDebugModal(false);

    if (selectedApps.length === 0) {
      setError("Please select at least one business app.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName,
          email,
          password,
          businessName,
          phone,
          appKeys: selectedApps,
        }),
      });

      const data = await response.json();

      // ✅ ALWAYS set debug info if it exists
      if (data.debug) {
        setDebugInfo(data.debug);
        setShowDebugModal(true); // ✅ Show debug modal
        console.log("🔍 Debug info received:", JSON.stringify(data.debug, null, 2));
      }

      if (!response.ok || !data.success) {
        // Show error but keep debug visible
        setError(data.error || "Registration failed.");
        setLoading(false);
        return;
      }

      // ✅ Success - keep debug visible, don't redirect yet
      setLoading(false);
      
      // ✅ Do NOT redirect automatically - let user click "Continue" after seeing debug

    } catch (error) {
      setError(error instanceof Error ? error.message : "Registration failed.");
      setLoading(false);
    }
  }

  // ✅ Function to continue to login after viewing debug
  function handleContinueToLogin() {
    router.push("/auth/login?registered=true");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto w-full max-w-7xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
            <Sparkles className="h-4 w-4" />
            SaMi AI Business Workspace
          </div>

          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Create your SaMi workspace
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-500 sm:text-lg">
            Create your account, tell SaMi about your business,
            and choose the apps your team needs.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid gap-6 lg:grid-cols-[380px_1fr]"
        >
          {/* Account */}
          <section className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:sticky lg:top-6">
            <div>
              <h2 className="text-xl font-bold">
                Account & business
              </h2>

              <p className="mt-1 text-sm leading-6 text-slate-500">
                Your account will become the owner of this
                business workspace.
              </p>
            </div>

            <div className="mt-7 space-y-5">
              <div>
                <label
                  htmlFor="fullName"
                  className="mb-2 block text-sm font-semibold"
                >
                  Full Name
                </label>

                <input
                  id="fullName"
                  type="text"
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) =>
                    setFullName(event.target.value)
                  }
                  placeholder="Samson Barasa"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold"
                >
                  Email
                </label>

                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-semibold"
                >
                  Password
                </label>

                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="At least 8 characters"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                />

                <p className="mt-2 text-xs text-slate-400">
                  Minimum 8 characters.
                </p>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <h3 className="font-bold">
                  Your business
                </h3>

                <div className="mt-4 space-y-5">
                  <div>
                    <label
                      htmlFor="businessName"
                      className="mb-2 block text-sm font-semibold"
                    >
                      Business Name
                    </label>

                    <input
                      id="businessName"
                      type="text"
                      required
                      value={businessName}
                      onChange={(event) =>
                        setBusinessName(event.target.value)
                      }
                      placeholder="My Business"
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="phone"
                      className="mb-2 block text-sm font-semibold"
                    >
                      Phone
                      <span className="ml-1 font-normal text-slate-400">
                        optional
                      </span>
                    </label>

                    <input
                      id="phone"
                      type="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(event) =>
                        setPhone(event.target.value)
                      }
                      placeholder="+254..."
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700"
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || selectedCount === 0}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Creating workspace...
                </>
              ) : (
                "Create SaMi Account"
              )}
            </button>

            <p className="mt-5 text-center text-sm text-slate-500">
              Already have an account?{" "}
              <Link
                href="/auth/login"
                className="font-semibold text-blue-600 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </section>

          {/* Apps */}
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold">
                  Choose your business apps
                </h2>

                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Select the applications this business should
                  have access to.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-700">
                  {selectedCount} selected
                </span>

                <button
                  type="button"
                  onClick={selectAll}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
                >
                  Select all
                </button>

                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {APP_CATEGORIES.map((category) => {
                const apps = SAMI_APPS.filter(
                  (app) => app.category === category.key
                );

                const isOpen = openCategories.includes(category.key);

                const categorySelected = apps.filter((app) =>
                  selectedSet.has(app.key)
                ).length;

                return (
                  <div
                    key={category.key}
                    className="overflow-hidden rounded-2xl border border-slate-200"
                  >
                    <button
                      type="button"
                      onClick={() => toggleCategory(category.key)}
                      className="flex w-full items-center justify-between bg-slate-50 px-5 py-4 text-left transition hover:bg-slate-100"
                    >
                      <div>
                        <div className="font-bold">
                          {category.name}
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                          {categorySelected} of {apps.length} selected
                        </div>
                      </div>

                      {isOpen ? (
                        <ChevronUp className="h-5 w-5 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-slate-400" />
                      )}
                    </button>

                    {isOpen && (
                      <div className="grid gap-3 p-4 sm:grid-cols-2">
                        {apps.map((app) => {
                          const selected = selectedSet.has(app.key);

                          return (
                            <button
                              key={app.key}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => toggleApp(app.key)}
                              className={`relative rounded-2xl border p-4 text-left transition ${
                                selected
                                  ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                                    selected
                                      ? "bg-blue-600 text-white"
                                      : "bg-slate-100 text-slate-500"
                                  }`}
                                >
                                  {selected ? (
                                    <Check className="h-5 w-5" />
                                  ) : (
                                    <span className="text-sm font-bold">
                                      {app.name.charAt(0)}
                                    </span>
                                  )}
                                </div>

                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold">
                                      {app.name}
                                    </span>

                                    {app.recommended && (
                                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                        Recommended
                                      </span>
                                    )}
                                  </div>

                                  <p className="mt-1 text-xs leading-5 text-slate-500">
                                    {app.description}
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-sm leading-6 text-blue-900">
              <strong>SaMi AI is always available.</strong>{" "}
              The apps you select determine which business
              applications are enabled for this workspace.
              You can add or remove apps later.
            </div>
          </section>
        </form>

        {/* ✅ DEBUG MODAL - Shows on screen after registration */}
        {showDebugModal && debugInfo && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <span>🔍 Registration Debug</span>
                  {debugInfo.summary.success ? (
                    <span className="text-green-600 text-sm font-normal bg-green-100 px-3 py-1 rounded-full">
                      ✅ SUCCESS
                    </span>
                  ) : (
                    <span className="text-red-600 text-sm font-normal bg-red-100 px-3 py-1 rounded-full">
                      ❌ FAILED
                    </span>
                  )}
                </h2>
                <button
                  onClick={() => setShowDebugModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition"
                >
                  <X className="h-6 w-6 text-slate-500" />
                </button>
              </div>

              {/* Summary Box */}
              <div
                className={`rounded-xl p-4 text-sm mb-4 ${
                  debugInfo.summary.success
                    ? "bg-green-50 border border-green-200 text-green-800"
                    : "bg-red-50 border border-red-200 text-red-800"
                }`}
              >
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <strong>Tables Installed:</strong> {debugInfo.summary.tablesInstalled}
                  </div>
                  <div>
                    <strong>Core Tables (users):</strong> {debugInfo.summary.hasCoreTables ? "✅ Yes" : "❌ No"}
                  </div>
                  <div>
                    <strong>Business Tables:</strong> {debugInfo.summary.hasBusinessTables ? "✅ Yes" : "❌ No"}
                  </div>
                  <div>
                    <strong>Status:</strong> {debugInfo.summary.success ? "✅ Success" : "❌ Failed"}
                  </div>
                </div>
              </div>

              {/* Steps */}
              <div className="mb-4">
                <strong className="text-sm">📋 Steps:</strong>
                <div className="mt-1 text-xs text-slate-600 space-y-1 max-h-40 overflow-auto bg-slate-50 rounded-lg p-3">
                  {debugInfo.steps.map((step, index) => (
                    <div key={index} className="border-b border-slate-100 pb-1 last:border-0">
                      {step.step}
                      {step.details && (
                        <span className="block text-slate-400 text-[10px] ml-2">
                          {typeof step.details === 'object' ? JSON.stringify(step.details) : step.details}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Errors */}
              {debugInfo.errors && debugInfo.errors.length > 0 && (
                <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3">
                  <strong className="text-sm text-red-800">❌ Errors:</strong>
                  <ul className="mt-1 text-xs text-red-700 space-y-1">
                    {debugInfo.errors.map((err, index) => (
                      <li key={index}>
                        <strong>{err.step}:</strong> {err.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tables Found */}
              {debugInfo.tableCheck && (
                <div className="mb-4">
                  <strong className="text-sm">
                    📊 Tables Found ({debugInfo.tableCheck.totalTables}):
                  </strong>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {debugInfo.tableCheck.tables.length > 0 ? (
                      debugInfo.tableCheck.tables.map((table) => (
                        <span
                          key={table}
                          className="bg-slate-100 rounded px-2 py-0.5 text-xs border border-slate-200"
                        >
                          {table}
                        </span>
                      ))
                    ) : (
                      <span className="text-red-600 text-sm font-semibold">
                        ⚠️ No tables found! Database is empty.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Raw Debug */}
              <details className="mb-4">
                <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-800">
                  Show Raw Debug Data
                </summary>
                <pre className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200 overflow-auto text-xs max-h-40">
                  {JSON.stringify(debugInfo, null, 2)}
                </pre>
              </details>

              {/* Actions */}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setShowDebugModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-xl hover:bg-slate-50 transition"
                >
                  Close
                </button>
                <button
                  onClick={handleContinueToLogin}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition"
                >
                  Continue to Login →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}