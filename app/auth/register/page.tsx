"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
} from "lucide-react";

import {
  APP_CATEGORIES,
  SAMI_APPS,
  getRecommendedAppKeys,
} from "@/lib/sami-apps";

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

  const selectedCount = selectedApps.length;

  const selectedSet = useMemo(
    () => new Set(selectedApps),
    [selectedApps]
  );

  function toggleApp(appKey: string) {
    setSelectedApps((current) =>
      current.includes(appKey)
        ? current.filter((key) => key !== appKey)
        : [...current, appKey]
    );
  }

  function toggleCategory(categoryKey: string) {
    setOpenCategories((current) =>
      current.includes(categoryKey)
        ? current.filter((key) => key !== categoryKey)
        : [...current, categoryKey]
    );
  }

  function selectAll() {
    setSelectedApps(SAMI_APPS.map((app) => app.key));
  }

  function clearAll() {
    setSelectedApps([]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (selectedApps.length === 0) {
      setError("Please select at least one SaMi app.");
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

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Registration failed."
        );
      }

      router.push("/auth/login?registered=true");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Registration failed."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
            <Sparkles className="h-4 w-4" />
            SaMi AI Business Workspace
          </div>

          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Create your SaMi workspace
          </h1>

          <p className="mx-auto mt-3 max-w-2xl text-slate-500">
            Create your account and choose the business apps you need.
            Your dashboard will only show the apps you select.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid gap-6 lg:grid-cols-[380px_1fr]"
        >
          <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:sticky lg:top-6">
            <h2 className="text-lg font-bold">
              Account & business
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Set up your account before choosing your workspace apps.
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Full Name
                </label>

                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Samson Barasa"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Email
                </label>

                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Password
                </label>

                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="border-t border-slate-100 pt-4">
                <h3 className="font-semibold">
                  Business
                </h3>

                <div className="mt-4 space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Business Name
                    </label>

                    <input
                      type="text"
                      required
                      value={businessName}
                      onChange={(e) =>
                        setBusinessName(e.target.value)
                      }
                      placeholder="My Business"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Phone
                      <span className="ml-1 font-normal text-slate-400">
                        (optional)
                      </span>
                    </label>

                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) =>
                        setPhone(e.target.value)
                      }
                      placeholder="+254..."
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || selectedCount === 0}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating workspace...
                </>
              ) : (
                "Create SaMi Account"
              )}
            </button>

            <p className="mt-4 text-center text-sm text-slate-500">
              Already have an account?{" "}
              <a
                href="/auth/login"
                className="font-semibold text-blue-600 hover:underline"
              >
                Login
              </a>
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-xl font-bold">
                  Choose your apps
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Select only what your business needs.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700">
                  {selectedCount} selected
                </span>

                <button
                  type="button"
                  onClick={selectAll}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
                >
                  All
                </button>

                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {APP_CATEGORIES.map((category) => {
                const apps = SAMI_APPS.filter(
                  (app) => app.category === category.key
                );

                const isOpen = openCategories.includes(
                  category.key
                );

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
                      onClick={() =>
                        toggleCategory(category.key)
                      }
                      className="flex w-full items-center justify-between bg-slate-50 px-4 py-4 text-left hover:bg-slate-100"
                    >
                      <div>
                        <div className="font-semibold">
                          {category.name}
                        </div>

                        <div className="mt-0.5 text-xs text-slate-500">
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
                          const selected = selectedSet.has(
                            app.key
                          );

                          return (
                            <button
                              type="button"
                              key={app.key}
                              onClick={() =>
                                toggleApp(app.key)
                              }
                              className={`relative rounded-xl border p-4 text-left transition ${
                                selected
                                  ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
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

            <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <strong className="text-slate-900">
                SaMi AI is always available.
              </strong>{" "}
              Your selected business apps determine what appears in
              your workspace. You can add or remove apps later.
            </div>
          </section>
        </form>
      </div>
    </main>
  );
}
