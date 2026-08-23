"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  APP_CATEGORIES,
  type SamiApp,
} from "@/lib/sami-apps";

type AppsResponse = {
  apps?: SamiApp[];
  success?: boolean;
};

export default function BusinessOnboardingPage() {
  const router = useRouter();

  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [apps, setApps] = useState<SamiApp[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const [loadingApps, setLoadingApps] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadApps() {
      try {
        // The app catalog is public to the authenticated onboarding flow.
        // It is intentionally the full catalog, not only enabled apps.
        const response = await fetch("/api/apps/catalog", {
          cache: "no-store",
        });

        const data = (await response.json()) as AppsResponse;

        if (!response.ok || !data.success) {
          throw new Error("Failed to load SaMi apps.");
        }

        const list = Array.isArray(data.apps)
          ? data.apps
          : [];

        setApps(list);

        // Start with recommended apps selected.
        setSelected(
          list
            .filter((app) => app.recommended)
            .map((app) => app.key)
        );
      } catch (err) {
        console.error("App catalog error:", err);
        setError(
          "Could not load the SaMi app catalog. Refresh and try again."
        );
      } finally {
        setLoadingApps(false);
      }
    }

    loadApps();
  }, []);

  const groupedApps = useMemo(() => {
    return APP_CATEGORIES
      .map((category) => ({
        ...category,
        apps: apps.filter(
          (app) => app.category === category.key
        ),
      }))
      .filter((category) => category.apps.length > 0);
  }, [apps]);

  function toggleApp(appKey: string) {
    setSelected((current) =>
      current.includes(appKey)
        ? current.filter((key) => key !== appKey)
        : [...current, appKey]
    );
  }

  function selectAll() {
    setSelected(apps.map((app) => app.key));
  }

  function clearAll() {
    setSelected([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!businessName.trim()) {
      setError("Business name is required.");
      return;
    }

    if (selected.length === 0) {
      setError("Please select at least one SaMi app.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const businessResponse = await fetch(
        "/api/business/provision",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            businessName: businessName.trim(),
            businessSlug: businessName
              .toLowerCase()
              .trim()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, ""),
            email: email.trim() || undefined,
            phone: phone.trim() || undefined,
            appKeys: selected,
          }),
        }
      );

      const businessData = await businessResponse.json();

      if (!businessResponse.ok || !businessData.success) {
        throw new Error(
          businessData.error ||
            "Business setup failed."
        );
      }

      // Provisioning already saved the selected apps.
      // There is no second app-selection write here.
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      console.error("SaMi onboarding error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      );
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <p className="text-sm font-semibold text-blue-600">
            SaMi AI Business Workspace
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Set up your business
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Choose the tools your business needs. Only selected apps
            will be installed and enabled in your workspace.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <section className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold">
                Business details
              </h2>

              <div className="mt-5 space-y-4">
                <label className="block text-sm font-medium">
                  Business name

                  <input
                    required
                    value={businessName}
                    onChange={(e) =>
                      setBusinessName(e.target.value)
                    }
                    placeholder="SaMi Technologies"
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
                  />
                </label>

                <label className="block text-sm font-medium">
                  Business email

                  <input
                    type="email"
                    value={email}
                    onChange={(e) =>
                      setEmail(e.target.value)
                    }
                    placeholder="business@example.com"
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
                  />
                </label>

                <label className="block text-sm font-medium">
                  Business phone

                  <input
                    value={phone}
                    onChange={(e) =>
                      setPhone(e.target.value)
                    }
                    placeholder="+254..."
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
                  />
                </label>
              </div>

              <div className="mt-6 rounded-2xl bg-blue-50 p-4">
                <p className="text-sm font-semibold text-blue-900">
                  SaMi AI is always at the center
                </p>

                <p className="mt-1 text-xs leading-5 text-blue-700">
                  SaMi AI works across the business apps you enable.
                </p>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <h2 className="text-lg font-bold">
                    Choose your SaMi apps
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Selected: {selected.length}
                  </p>
                </div>

                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-sm font-semibold text-blue-600"
                  >
                    Select all
                  </button>

                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-sm font-semibold text-slate-500"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {loadingApps ? (
                <div className="mt-8 rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">
                  Loading SaMi apps...
                </div>
              ) : groupedApps.length === 0 ? (
                <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
                  No apps are available in the SaMi app catalog.
                </div>
              ) : (
                <div className="mt-6 space-y-7">
                  {groupedApps.map(
                    ({ key, name, apps: categoryApps }) => (
                      <div key={key}>
                        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                          {name}
                        </h3>

                        <div className="grid gap-3 sm:grid-cols-2">
                          {categoryApps.map((app) => {
                            const checked =
                              selected.includes(app.key);

                            return (
                              <button
                                key={app.key}
                                type="button"
                                onClick={() =>
                                  toggleApp(app.key)
                                }
                                className={`rounded-2xl border p-4 text-left transition ${
                                  checked
                                    ? "border-blue-500 bg-blue-50"
                                    : "border-slate-200 hover:bg-slate-50"
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <span
                                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs ${
                                      checked
                                        ? "border-blue-600 bg-blue-600 text-white"
                                        : "border-slate-300"
                                    }`}
                                  >
                                    {checked ? "✓" : ""}
                                  </span>

                                  <span>
                                    <span className="block text-sm font-semibold">
                                      {app.name}
                                    </span>

                                    {app.recommended && (
                                      <span className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wide text-blue-600">
                                        Recommended
                                      </span>
                                    )}

                                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                                      {app.description}
                                    </span>
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </section>
          </div>

          {error && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={
                loading ||
                loadingApps ||
                selected.length === 0
              }
              className="rounded-2xl bg-blue-600 px-7 py-3 font-semibold text-white shadow-lg transition hover:bg-blue-700 disabled:opacity-50"
            >
              {loading
                ? "Creating your SaMi workspace..."
                : "Create workspace & continue"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
