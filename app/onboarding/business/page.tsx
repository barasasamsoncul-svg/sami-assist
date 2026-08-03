"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type SamiApp = {
  id: string;
  name: string;
  description?: string;
  category?: string;
};

type AppsResponse = {
  apps?: SamiApp[];
  data?: SamiApp[];
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
        const response = await fetch("/api/apps", { cache: "no-store" });
        const data = (await response.json()) as AppsResponse;

        if (!response.ok) throw new Error("Failed to load SaMi apps.");

        const list = Array.isArray(data.apps)
          ? data.apps
          : Array.isArray(data.data) ? data.data : [];

        setApps(list);
      } catch (err) {
        console.error("App catalog error:", err);
        setError("Could not load the SaMi app catalog. Refresh and try again.");
      } finally {
        setLoadingApps(false);
      }
    }

    loadApps();
  }, []);

  const groupedApps = useMemo(() => {
    const groups = new Map<string, SamiApp[]>();

    for (const app of apps) {
      const category = app.category || "Other";
      groups.set(category, [...(groups.get(category) || []), app]);
    }

    return Array.from(groups.entries());
  }, [apps]);

  function createSlug(name: string) {
    return name.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function toggleApp(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!businessName.trim()) {
      setError("Business name is required.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const businessResponse = await fetch("/api/business/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          businessSlug: createSlug(businessName),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
        }),
      });

      const businessData = await businessResponse.json();

      if (!businessResponse.ok || !businessData.success) {
        throw new Error(businessData.error || "Business setup failed.");
      }

      const selectionResponse = await fetch("/api/apps/selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appIds: selected }),
      });

      const selectionData = await selectionResponse.json();

      if (!selectionResponse.ok || !selectionData.success) {
        throw new Error(
          selectionData.error ||
          "Business was created, but app selection could not be saved."
        );
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      console.error("SaMi onboarding error:", err);
      setError(err instanceof Error ? err.message : "Something went wrong.");
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
            Choose only the tools your business needs. Only selected apps
            will appear in your workspace.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <section className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold">Business details</h2>

              <div className="mt-5 space-y-4">
                <label className="block text-sm font-medium">
                  Business name
                  <input
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="SaMi Technologies"
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
                  />
                </label>

                <label className="block text-sm font-medium">
                  Business email
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="business@example.com"
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
                  />
                </label>

                <label className="block text-sm font-medium">
                  Business phone
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
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
                  <h2 className="text-lg font-bold">Choose your SaMi apps</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Selected: {selected.length}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelected(apps.map((app) => app.id))}
                  className="text-sm font-semibold text-blue-600"
                >
                  Select all
                </button>
              </div>

              {loadingApps ? (
                <div className="mt-8 rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">
                  Loading SaMi apps...
                </div>
              ) : groupedApps.length === 0 ? (
                <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
                  No apps were returned by the SaMi app catalog.
                </div>
              ) : (
                <div className="mt-6 space-y-7">
                  {groupedApps.map(([category, categoryApps]) => (
                    <div key={category}>
                      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                        {category}
                      </h3>

                      <div className="grid gap-3 sm:grid-cols-2">
                        {categoryApps.map((app) => {
                          const checked = selected.includes(app.id);

                          return (
                            <button
                              key={app.id}
                              type="button"
                              onClick={() => toggleApp(app.id)}
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
                                  {app.description && (
                                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                                      {app.description}
                                    </span>
                                  )}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
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
              disabled={loading || loadingApps}
              className="rounded-2xl bg-blue-600 px-7 py-3 font-semibold text-white shadow-lg transition hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Creating your SaMi workspace..." : "Create workspace & continue"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
