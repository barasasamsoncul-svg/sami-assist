"use client";

import {
  AppWindow,
  BellRing,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  Database,
  ImagePlus,
  Loader2,
  Palette,
  Save,
  Settings2,
  Shield,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { ChangeEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { APP_CATEGORIES, SAMI_APPS, type SamiApp } from "@/lib/sami-apps";

type UserSettings = {
  id: string;
  fullName: string | null;
  email: string | null;
  createdAt: string;
};

type BusinessSettings = {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  logo: string | null;
  status: string;
};

type SettingsResponse = {
  success: boolean;
  user?: UserSettings;
  business?: BusinessSettings;
  settings?: Record<string, Record<string, unknown>>;
  appKeys?: string[];
  apps?: SamiApp[];
  error?: string;
};

type SectionKey =
  | "general"
  | "appearance"
  | "notifications"
  | "security"
  | "data"
  | "apps"
  | string;

const MAX_LOGO_BYTES = 900 * 1024;

const APP_SETTING_DEFINITIONS: Record<
  string,
  { label: string; description: string; fields: Array<{ key: string; label: string; type: "text" | "number" | "boolean" | "select"; options?: string[]; defaultValue: unknown }> }
> = {
  accounting: {
    label: "Accounting",
    description: "Accounting defaults used by SaMi financial tools.",
    fields: [
      { key: "currency", label: "Default currency", type: "select", options: ["KES", "USD", "EUR", "GBP"], defaultValue: "KES" },
      { key: "fiscalYearStart", label: "Fiscal year starts", type: "select", options: ["January", "April", "July", "October"], defaultValue: "January" },
      { key: "lockPostedEntries", label: "Lock posted entries", type: "boolean", defaultValue: true },
    ],
  },
  invoicing: {
    label: "Invoicing",
    description: "Invoice numbering, payment and tax defaults.",
    fields: [
      { key: "invoicePrefix", label: "Invoice prefix", type: "text", defaultValue: "INV-" },
      { key: "defaultDueDays", label: "Default payment terms (days)", type: "number", defaultValue: 30 },
      { key: "taxEnabled", label: "Enable tax on new invoices", type: "boolean", defaultValue: true },
    ],
  },
  expenses: {
    label: "Expenses",
    description: "Control how expenses are recorded and approved.",
    fields: [
      { key: "approvalRequired", label: "Require expense approval", type: "boolean", defaultValue: false },
      { key: "defaultCategory", label: "Default expense category", type: "text", defaultValue: "General" },
      { key: "receiptRequired", label: "Require receipt attachment", type: "boolean", defaultValue: false },
    ],
  },
  crm: {
    label: "CRM",
    description: "Customer and lead-management defaults.",
    fields: [
      { key: "defaultPipeline", label: "Default pipeline", type: "text", defaultValue: "Sales" },
      { key: "leadFollowUpDays", label: "Lead follow-up reminder (days)", type: "number", defaultValue: 3 },
      { key: "autoCreateCustomer", label: "Create customer from won lead", type: "boolean", defaultValue: true },
    ],
  },
  inventory: {
    label: "Inventory",
    description: "Stock and warehouse defaults.",
    fields: [
      { key: "lowStockThreshold", label: "Low-stock threshold", type: "number", defaultValue: 5 },
      { key: "valuationMethod", label: "Inventory valuation", type: "select", options: ["FIFO", "Average Cost"], defaultValue: "FIFO" },
      { key: "allowNegativeStock", label: "Allow negative stock", type: "boolean", defaultValue: false },
    ],
  },
  sales: {
    label: "Sales",
    description: "Quotation and order defaults.",
    fields: [
      { key: "quoteValidityDays", label: "Quote validity (days)", type: "number", defaultValue: 30 },
      { key: "defaultSalesTax", label: "Default sales tax (%)", type: "number", defaultValue: 16 },
      { key: "autoConvertWonQuotes", label: "Convert accepted quotes to orders", type: "boolean", defaultValue: true },
    ],
  },
  employees: {
    label: "Employees",
    description: "Workforce defaults.",
    fields: [
      { key: "workWeek", label: "Work week", type: "select", options: ["Monday-Friday", "Monday-Saturday", "Sunday-Thursday"], defaultValue: "Monday-Friday" },
      { key: "defaultLeaveDays", label: "Default annual leave days", type: "number", defaultValue: 21 },
      { key: "employeeSelfService", label: "Allow employee self-service", type: "boolean", defaultValue: true },
    ],
  },
  projects: {
    label: "Projects",
    description: "Project and task defaults.",
    fields: [
      { key: "weekStartsOn", label: "Week starts on", type: "select", options: ["Monday", "Sunday"], defaultValue: "Monday" },
      { key: "defaultTaskPriority", label: "Default task priority", type: "select", options: ["Low", "Normal", "High"], defaultValue: "Normal" },
      { key: "taskNotifications", label: "Task notifications", type: "boolean", defaultValue: true },
    ],
  },
  pos_shop: {
    label: "POS Shop",
    description: "Retail point-of-sale defaults.",
    fields: [
      { key: "taxInclusive", label: "Prices include tax", type: "boolean", defaultValue: true },
      { key: "receiptFooter", label: "Receipt footer", type: "text", defaultValue: "Thank you for your business." },
      { key: "allowDiscounts", label: "Allow cashier discounts", type: "boolean", defaultValue: true },
    ],
  },
  pos_restaurant: {
    label: "POS Restaurant",
    description: "Restaurant point-of-sale defaults.",
    fields: [
      { key: "taxInclusive", label: "Prices include tax", type: "boolean", defaultValue: true },
      { key: "defaultTableService", label: "Default service", type: "select", options: ["Dine-in", "Takeaway", "Delivery"], defaultValue: "Dine-in" },
      { key: "kitchenNotifications", label: "Kitchen notifications", type: "boolean", defaultValue: true },
    ],
  },
  documents: {
    label: "Documents",
    description: "Document workspace defaults.",
    fields: [
      { key: "defaultFolder", label: "Default folder", type: "text", defaultValue: "General" },
      { key: "versioning", label: "Keep document versions", type: "boolean", defaultValue: true },
      { key: "aiSearch", label: "Allow SaMi AI document search", type: "boolean", defaultValue: true },
    ],
  },
  email_marketing: {
    label: "Email Marketing",
    description: "Email campaign defaults.",
    fields: [
      { key: "senderName", label: "Default sender name", type: "text", defaultValue: "" },
      { key: "senderEmail", label: "Default sender email", type: "text", defaultValue: "" },
      { key: "trackingEnabled", label: "Campaign tracking", type: "boolean", defaultValue: true },
    ],
  },
  sms_marketing: {
    label: "SMS Marketing",
    description: "SMS campaign defaults.",
    fields: [
      { key: "senderId", label: "Default sender ID", type: "text", defaultValue: "SaMi" },
      { key: "deliveryReports", label: "Delivery reports", type: "boolean", defaultValue: true },
      { key: "unicodeEnabled", label: "Allow Unicode messages", type: "boolean", defaultValue: true },
    ],
  },
  helpdesk: {
    label: "Helpdesk",
    description: "Customer support defaults.",
    fields: [
      { key: "defaultPriority", label: "Default ticket priority", type: "select", options: ["Low", "Normal", "High", "Urgent"], defaultValue: "Normal" },
      { key: "autoAssign", label: "Auto-assign new tickets", type: "boolean", defaultValue: false },
      { key: "customerNotifications", label: "Notify customers on updates", type: "boolean", defaultValue: true },
    ],
  },
};

const sectionMeta: Array<{ key: SectionKey; label: string; description: string; icon: typeof Settings2 }> = [
  { key: "general", label: "General", description: "Business identity and workspace basics.", icon: Building2 },
  { key: "appearance", label: "Appearance", description: "Theme and interface preferences.", icon: Palette },
  { key: "notifications", label: "Notifications", description: "Choose what SaMi should notify you about.", icon: BellRing },
  { key: "security", label: "Security", description: "Account and access controls.", icon: Shield },
  { key: "data", label: "Data & AI", description: "AI memory, data and workspace behavior.", icon: Database },
  { key: "apps", label: "Apps", description: "Add apps and manage enabled modules.", icon: AppWindow },
];

function inputClass() {
  return "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500";
}

function buttonClass(active = false) {
  return active
    ? "bg-blue-600 text-white shadow-sm"
    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800";
}

export default function SettingsPanel({ initialSection = "general" }: { initialSection?: string }) {
  const [section, setSection] = useState<SectionKey>(initialSection);
  const [user, setUser] = useState<UserSettings | null>(null);
  const [business, setBusiness] = useState<BusinessSettings | null>(null);
  const [stored, setStored] = useState<Record<string, Record<string, unknown>>>({});
  const [enabledKeys, setEnabledKeys] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<SamiApp[]>(SAMI_APPS);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [generalSaving, setGeneralSaving] = useState(false);
  const [savingSection, setSavingSection] = useState("");
  const [appsSaving, setAppsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [appSearch, setAppSearch] = useState("");

  useEffect(() => setSection(initialSection), [initialSection]);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/business/settings", { cache: "no-store", credentials: "include" });
      const data = (await response.json()) as SettingsResponse;
      if (!response.ok || !data.success || !data.business) throw new Error(data.error || "Could not load settings.");

      setUser(data.user ?? null);
      setBusiness(data.business);
      setStored(data.settings ?? {});
      setEnabledKeys(data.appKeys ?? []);
      setCatalog(data.apps?.length ? data.apps : SAMI_APPS);
      setName(data.business.name || "");
      setSlug(data.business.slug || "");
      setEmail(data.business.email || "");
      setPhone(data.business.phone || "");
      setLogo(data.business.logo || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function normalizeSlug(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  }

  function updateStored(sectionKey: string, key: string, value: unknown) {
    setStored((current) => ({
      ...current,
      [sectionKey]: { ...(current[sectionKey] ?? {}), [key]: value },
    }));
  }

  async function saveSection(sectionKey: string) {
    try {
      setSavingSection(sectionKey);
      setError("");
      setNotice("");
      const response = await fetch("/api/business/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ section: sectionKey, settings: stored[sectionKey] ?? {} }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not save settings.");
      setStored(data.settings ?? stored);
      setNotice(`${sectionMeta.find((item) => item.key === sectionKey)?.label ?? "Settings"} updated.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setSavingSection("");
    }
  }

  async function saveGeneral() {
    try {
      setGeneralSaving(true);
      setError("");
      setNotice("");
      const response = await fetch("/api/business/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, slug, email, phone, logo }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.business) throw new Error(data.error || "Could not save business profile.");
      setBusiness(data.business);
      setName(data.business.name || "");
      setSlug(data.business.slug || "");
      setEmail(data.business.email || "");
      setPhone(data.business.phone || "");
      setLogo(data.business.logo || null);
      setNotice("Business profile updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save business profile.");
    } finally {
      setGeneralSaving(false);
    }
  }

  async function updateApps(nextKeys: string[]) {
    try {
      setAppsSaving(true);
      setError("");
      setNotice("");
      const response = await fetch("/api/apps/selection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ appKeys: nextKeys }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not update apps.");
      setEnabledKeys(data.appKeys ?? nextKeys);
      setNotice("Apps updated. Your dashboard is now using the new app selection.");
      window.dispatchEvent(new CustomEvent("sami:apps-updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update apps.");
    } finally {
      setAppsSaving(false);
    }
  }

  function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setNotice("");
    if (!file.type.startsWith("image/")) return setError("Please select an image file.");
    if (file.size > MAX_LOGO_BYTES) return setError("Logo must be smaller than 900 KB.");

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setLogo(reader.result);
    };
    reader.onerror = () => setError("Could not read the selected logo.");
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  const enabledApps = useMemo(
    () => catalog.filter((app) => enabledKeys.includes(app.key)),
    [catalog, enabledKeys]
  );

  const filteredCatalog = useMemo(() => {
    const q = appSearch.trim().toLowerCase();
    return catalog.filter((app) => !q || `${app.name} ${app.description}`.toLowerCase().includes(q));
  }, [catalog, appSearch]);

  const appSpecificSections = enabledApps.filter((app) => APP_SETTING_DEFINITIONS[app.key]);

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">Loading workspace settings...</div>;
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">Workspace control center</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950 dark:text-white sm:text-3xl">Settings</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Every setting is separate. App settings only appear for apps actually enabled in this workspace.</p>
      </div>

      {(error || notice) && (
        <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
          error
            ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
            : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
        }`}>
          <span>{error || notice}</span>
          <button onClick={() => { setError(""); setNotice(""); }} className="rounded-lg p-1 hover:bg-black/5 dark:hover:bg-white/10"><X size={16} /></button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="px-3 pb-2 pt-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Workspace</p>
          </div>
          <nav className="space-y-1">
            {sectionMeta.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.key} onClick={() => setSection(item.key)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${buttonClass(section === item.key)}`}>
                  <Icon size={17} />
                  <span className="min-w-0 flex-1">
                    <span className="block">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[10px] opacity-60">{item.description}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          {appSpecificSections.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Enabled app settings</p>
              <div className="space-y-1">
                {appSpecificSections.map((app) => (
                  <button key={app.key} onClick={() => setSection(`app:${app.key}`)} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm ${buttonClass(section === `app:${app.key}`)}`}>
                    <Settings2 size={15} />
                    <span className="truncate">{app.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        <main className="min-w-0">
          {section === "general" && (
            <Section title="Business profile" description="These are the core identity details used across SaMi.">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
                  {logo ? <img src={logo} alt="Business logo" className="h-full w-full object-contain" /> : <Building2 size={30} className="text-slate-400" />}
                </div>
                <div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500">
                    <ImagePlus size={16} /> {logo ? "Change logo" : "Add logo"}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoChange} className="hidden" />
                  </label>
                  {logo && <button type="button" onClick={() => setLogo(null)} className="ml-2 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"><Trash2 size={16} /> Remove</button>}
                  <p className="mt-2 text-xs text-slate-400">PNG, JPG, WEBP or SVG. Maximum 900 KB.</p>
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Business name" value={name} onChange={setName} />
                <Field label="Business slug" value={slug} onChange={(v) => setSlug(normalizeSlug(v))} />
                <Field label="Business email" type="email" value={email} onChange={setEmail} />
                <Field label="Phone" value={phone} onChange={setPhone} />
              </div>

              <SaveButton loading={generalSaving} onClick={saveGeneral} label="Save business profile" />
            </Section>
          )}

          {section === "appearance" && (
            <Section title="Appearance" description="Interface preferences are independent settings, not business profile data.">
              <SettingRow title="Theme" description="Choose the theme used by the SaMi workspace.">
                <Select value={String(stored.appearance?.theme ?? "system")} options={["system", "light", "dark"]} onChange={(v) => updateStored("appearance", "theme", v)} />
              </SettingRow>
              <SettingRow title="Compact navigation" description="Use a tighter sidebar when you need more workspace room.">
                <Toggle checked={Boolean(stored.appearance?.compactNav ?? false)} onChange={(v) => updateStored("appearance", "compactNav", v)} />
              </SettingRow>
              <SaveButton loading={savingSection === "appearance"} onClick={() => saveSection("appearance")} label="Save appearance" />
            </Section>
          )}

          {section === "notifications" && (
            <Section title="Notifications" description="Control the notifications generated by your workspace.">
              <SettingRow title="Business activity" description="Notify you about important business activity.">
                <Toggle checked={Boolean(stored.notifications?.businessActivity ?? true)} onChange={(v) => updateStored("notifications", "businessActivity", v)} />
              </SettingRow>
              <SettingRow title="Invoice reminders" description="Receive reminders about overdue or upcoming invoice payments.">
                <Toggle checked={Boolean(stored.notifications?.invoiceReminders ?? true)} onChange={(v) => updateStored("notifications", "invoiceReminders", v)} />
              </SettingRow>
              <SettingRow title="AI task completion" description="Notify you when SaMi finishes a background task.">
                <Toggle checked={Boolean(stored.notifications?.aiTasks ?? true)} onChange={(v) => updateStored("notifications", "aiTasks", v)} />
              </SettingRow>
              <SaveButton loading={savingSection === "notifications"} onClick={() => saveSection("notifications")} label="Save notifications" />
            </Section>
          )}

          {section === "security" && (
            <Section title="Security" description="Account information and workspace access behavior.">
              <Info label="Account name" value={user?.fullName || "Not set"} />
              <Info label="Account email" value={user?.email || "Not set"} />
              <Info label="Business status" value={business?.status || "Unknown"} />
              <SettingRow title="Require confirmation for destructive AI actions" description="SaMi should ask before performing actions that can delete or overwrite business data.">
                <Toggle checked={Boolean(stored.security?.confirmDestructiveAi ?? true)} onChange={(v) => updateStored("security", "confirmDestructiveAi", v)} />
              </SettingRow>
              <SaveButton loading={savingSection === "security"} onClick={() => saveSection("security")} label="Save security settings" />
            </Section>
          )}

          {section === "data" && (
            <Section title="Data & AI" description="Control how SaMi uses workspace data and AI memory.">
              <SettingRow title="AI memory" description="Allow SaMi to remember useful business context between conversations.">
                <Toggle checked={Boolean(stored.data?.aiMemory ?? true)} onChange={(v) => updateStored("data", "aiMemory", v)} />
              </SettingRow>
              <SettingRow title="Use enabled apps as AI context" description="Let SaMi use data from your enabled business apps when answering questions.">
                <Toggle checked={Boolean(stored.data?.appContext ?? true)} onChange={(v) => updateStored("data", "appContext", v)} />
              </SettingRow>
              <SettingRow title="Activity history" description="Keep workspace activity history available for review.">
                <Toggle checked={Boolean(stored.data?.activityHistory ?? true)} onChange={(v) => updateStored("data", "activityHistory", v)} />
              </SettingRow>
              <SaveButton loading={savingSection === "data"} onClick={() => saveSection("data")} label="Save data & AI settings" />
            </Section>
          )}

          {section === "apps" && (
            <Section title="Apps" description={`Real workspace app selection. ${enabledApps.length} app${enabledApps.length === 1 ? "" : "s"} currently enabled.`}>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input value={appSearch} onChange={(e) => setAppSearch(e.target.value)} placeholder="Search apps..." className={inputClass()} />
              </div>

              <div className="space-y-6">
                {APP_CATEGORIES.map((category) => {
                  const apps = filteredCatalog.filter((app) => app.category === category.key);
                  if (!apps.length) return null;
                  return (
                    <div key={category.key}>
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{category.name}</h3>
                      <div className="grid gap-3 md:grid-cols-2">
                        {apps.map((app) => {
                          const enabled = enabledKeys.includes(app.key);
                          return (
                            <button
                              key={app.key}
                              type="button"
                              disabled={appsSaving}
                              onClick={() => updateApps(enabled ? enabledKeys.filter((key) => key !== app.key) : [...enabledKeys, app.key])}
                              className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
                                enabled
                                  ? "border-blue-500/50 bg-blue-50 dark:border-blue-500/40 dark:bg-blue-950/20"
                                  : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                              }`}
                            >
                              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${enabled ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                                <AppWindow size={18} />
                              </div>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-slate-900 dark:text-white">{app.name}</span>
                                <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{app.description}</span>
                              </span>
                              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${enabled ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                                {enabled ? "Enabled" : "Add"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-slate-400">App changes are saved immediately. There is no generic Save Changes button for app selection.</p>
            </Section>
          )}

          {section.startsWith("app:") && (() => {
            const appKey = section.slice(4);
            const app = enabledApps.find((item) => item.key === appKey);
            const definition = APP_SETTING_DEFINITIONS[appKey];
            if (!app) return <Section title="App unavailable" description="This app is no longer enabled in this workspace."><button onClick={() => setSection("apps")} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Manage apps</button></Section>;
            if (!definition) return <Section title={`${app.name} settings`} description="This app is enabled, but it has no extra settings registered yet."><div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">The app is connected to the workspace. App-specific controls will appear here as its business features are implemented.</div></Section>;

            return (
              <Section title={`${definition.label} settings`} description={definition.description}>
                {definition.fields.map((field) => {
                  const current = stored[appKey]?.[field.key] ?? field.defaultValue;
                  return (
                    <SettingRow key={field.key} title={field.label} description={`Default for ${definition.label}.`}>
                      {field.type === "boolean" ? (
                        <Toggle checked={Boolean(current)} onChange={(v) => updateStored(appKey, field.key, v)} />
                      ) : field.type === "select" ? (
                        <Select value={String(current)} options={field.options ?? []} onChange={(v) => updateStored(appKey, field.key, v)} />
                      ) : (
                        <input type={field.type} value={String(current)} onChange={(e) => updateStored(appKey, field.key, field.type === "number" ? Number(e.target.value) : e.target.value)} className={`${inputClass()} max-w-xs`} />
                      )}
                    </SettingRow>
                  );
                })}
                <SaveButton loading={savingSection === appKey} onClick={() => saveSection(appKey)} label={`Save ${definition.label} settings`} />
              </Section>
            );
          })()}
        </main>
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
        <h2 className="text-lg font-bold text-slate-950 dark:text-white">{title}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      <div className="space-y-5 p-6">{children}</div>
    </section>
  );
}

function SettingRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-950/50">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass()} />
    </label>
  );
}

function Select({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass()} appearance-none pr-10`}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-7 w-12 rounded-full transition ${checked ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"}`}>
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-6" : "left-1"}`} />
    </button>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{value}</p></div>;
}

function SaveButton({ loading, onClick, label }: { loading: boolean; onClick: () => void; label: string }) {
  return (
    <div className="flex justify-end pt-2">
      <button type="button" onClick={onClick} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-60">
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {loading ? "Saving..." : label}
      </button>
    </div>
  );
}
