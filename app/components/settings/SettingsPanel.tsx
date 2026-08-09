"use client";

import { ChangeEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CreditCard,
  ImagePlus,
  KeyRound,
  Loader2,
  Package,
  Palette,
  Plus,
  Save,
  Shield,
  UserRound,
} from "lucide-react";
import { SAMI_APPS, type SamiApp } from "@/lib/sami-apps";

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

type AppValue = string | boolean | number;
type AppSettings = Record<string, Record<string, AppValue>>;

type WorkspaceSettings = {
  appearance: { theme: "system" | "light" | "dark"; compactMode: boolean };
  notifications: { email: boolean; browser: boolean; invoiceReminders: boolean; paymentAlerts: boolean };
  security: { sessionTimeout: string; requireReauthForSensitiveActions: boolean };
  ai: { enabled: boolean; suggestions: boolean; memory: boolean };
  billing: { currency: string; taxInclusive: boolean };
  apps: AppSettings;
};

type SettingsResponse = {
  success: boolean;
  user?: UserSettings;
  business?: BusinessSettings;
  settings?: WorkspaceSettings;
  appKeys?: string[];
  error?: string;
};

const MAX_LOGO_BYTES = 900 * 1024;

const APP_FEATURES: Record<
  string,
  {
    description: string;
    fields: Array<{
      key: string;
      label: string;
      type: "text" | "number" | "toggle" | "select";
      options?: string[];
      placeholder?: string;
    }>;
  }
> = {
  invoicing: {
    description: "Defaults used when creating and sending invoices.",
    fields: [
      { key: "invoicePrefix", label: "Invoice prefix", type: "text", placeholder: "INV" },
      { key: "defaultTaxRate", label: "Default tax rate (%)", type: "number", placeholder: "16" },
      { key: "paymentTerms", label: "Default payment terms", type: "select", options: ["Due on receipt", "7 days", "14 days", "30 days", "60 days"] },
      { key: "autoNumbering", label: "Automatic invoice numbering", type: "toggle" },
      { key: "showPaymentDetails", label: "Show payment details on invoices", type: "toggle" },
      { key: "sendReceiptAfterPayment", label: "Send receipt after payment", type: "toggle" },
    ],
  },
  accounting: {
    description: "Financial reporting and accounting defaults.",
    fields: [
      { key: "currency", label: "Default currency", type: "select", options: ["KES", "USD", "EUR", "GBP"] },
      { key: "fiscalYearStart", label: "Fiscal year starts", type: "select", options: ["January", "April", "July", "October"] },
      { key: "enableTaxTracking", label: "Enable tax tracking", type: "toggle" },
      { key: "lockClosedPeriods", label: "Lock closed accounting periods", type: "toggle" },
    ],
  },
  expenses: {
    description: "Expense capture, receipts and approval behaviour.",
    fields: [
      { key: "requireReceipt", label: "Require receipt", type: "toggle" },
      { key: "approvalWorkflow", label: "Approval workflow", type: "select", options: ["None", "Owner approval", "Manager approval"] },
      { key: "allowPersonalExpenses", label: "Allow personal expense claims", type: "toggle" },
    ],
  },
  inventory: {
    description: "Stock and product behaviour.",
    fields: [
      { key: "lowStockThreshold", label: "Low-stock threshold", type: "number", placeholder: "5" },
      { key: "defaultUnit", label: "Default unit", type: "select", options: ["pcs", "kg", "litres", "boxes", "units"] },
      { key: "allowNegativeStock", label: "Allow negative stock", type: "toggle" },
      { key: "trackStockMovements", label: "Track stock movements", type: "toggle" },
    ],
  },
  crm: {
    description: "Customer and relationship-management defaults.",
    fields: [
      { key: "customerCodePrefix", label: "Customer code prefix", type: "text", placeholder: "CUS" },
      { key: "requireCustomerEmail", label: "Require customer email", type: "toggle" },
      { key: "autoCreateLeadActivity", label: "Create follow-up activity automatically", type: "toggle" },
    ],
  },
  sales: {
    description: "Sales documents and customer-order defaults.",
    fields: [
      { key: "quotePrefix", label: "Quotation prefix", type: "text", placeholder: "QUO" },
      { key: "orderPrefix", label: "Sales order prefix", type: "text", placeholder: "SO" },
      { key: "requireQuoteApproval", label: "Require quotation approval", type: "toggle" },
    ],
  },
  pos_shop: {
    description: "Retail point-of-sale defaults.",
    fields: [
      { key: "receiptPrefix", label: "Receipt prefix", type: "text", placeholder: "POS" },
      { key: "allowCashSales", label: "Allow cash sales", type: "toggle" },
      { key: "allowCreditSales", label: "Allow credit sales", type: "toggle" },
    ],
  },
  pos_restaurant: {
    description: "Restaurant point-of-sale defaults.",
    fields: [
      { key: "receiptPrefix", label: "Receipt prefix", type: "text", placeholder: "RST" },
      { key: "tableService", label: "Enable table service", type: "toggle" },
      { key: "kitchenTickets", label: "Enable kitchen tickets", type: "toggle" },
    ],
  },
  employees: {
    description: "Workforce and employee-management preferences.",
    fields: [
      { key: "employeeCodePrefix", label: "Employee code prefix", type: "text", placeholder: "EMP" },
      { key: "requireEmployeeEmail", label: "Require employee email", type: "toggle" },
      { key: "enableEmployeeSelfService", label: "Enable employee self-service", type: "toggle" },
    ],
  },
  projects: {
    description: "Project and task-management defaults.",
    fields: [
      { key: "projectCodePrefix", label: "Project code prefix", type: "text", placeholder: "PRJ" },
      { key: "allowBillableProjects", label: "Allow billable projects", type: "toggle" },
      { key: "requireTaskDueDate", label: "Require task due dates", type: "toggle" },
    ],
  },
  documents: {
    description: "Document organisation and access defaults.",
    fields: [
      { key: "defaultVisibility", label: "Default document visibility", type: "select", options: ["Private", "Business", "Team"] },
      { key: "versionDocuments", label: "Keep document versions", type: "toggle" },
    ],
  },
};

const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  appearance: { theme: "system", compactMode: false },
  notifications: { email: true, browser: true, invoiceReminders: true, paymentAlerts: true },
  security: { sessionTimeout: "30 days", requireReauthForSensitiveActions: true },
  ai: { enabled: true, suggestions: true, memory: true },
  billing: { currency: "KES", taxInclusive: false },
  apps: {},
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  invoicing: { invoicePrefix: "INV", defaultTaxRate: 16, paymentTerms: "30 days", autoNumbering: true, showPaymentDetails: true, sendReceiptAfterPayment: true },
  accounting: { currency: "KES", fiscalYearStart: "January", enableTaxTracking: true, lockClosedPeriods: false },
  expenses: { requireReceipt: true, approvalWorkflow: "Owner approval", allowPersonalExpenses: false },
  inventory: { lowStockThreshold: 5, defaultUnit: "pcs", allowNegativeStock: false, trackStockMovements: true },
  crm: { customerCodePrefix: "CUS", requireCustomerEmail: false, autoCreateLeadActivity: true },
  sales: { quotePrefix: "QUO", orderPrefix: "SO", requireQuoteApproval: false },
  pos_shop: { receiptPrefix: "POS", allowCashSales: true, allowCreditSales: false },
  pos_restaurant: { receiptPrefix: "RST", tableService: true, kitchenTickets: true },
  employees: { employeeCodePrefix: "EMP", requireEmployeeEmail: true, enableEmployeeSelfService: false },
  projects: { projectCodePrefix: "PRJ", allowBillableProjects: true, requireTaskDueDate: false },
  documents: { defaultVisibility: "Business", versionDocuments: true },
};

function mergeSettings(input?: Partial<WorkspaceSettings>): WorkspaceSettings {
  return {
    appearance: { ...DEFAULT_WORKSPACE_SETTINGS.appearance, ...(input?.appearance || {}) },
    notifications: { ...DEFAULT_WORKSPACE_SETTINGS.notifications, ...(input?.notifications || {}) },
    security: { ...DEFAULT_WORKSPACE_SETTINGS.security, ...(input?.security || {}) },
    ai: { ...DEFAULT_WORKSPACE_SETTINGS.ai, ...(input?.ai || {}) },
    billing: { ...DEFAULT_WORKSPACE_SETTINGS.billing, ...(input?.billing || {}) },
    apps: { ...DEFAULT_APP_SETTINGS, ...(input?.apps || {}) },
  };
}

export default function SettingsPanel() {
  const [user, setUser] = useState<UserSettings | null>(null);
  const [business, setBusiness] = useState<BusinessSettings | null>(null);
  const [enabledKeys, setEnabledKeys] = useState<string[]>([]);
  const [settings, setSettings] = useState<WorkspaceSettings>(DEFAULT_WORKSPACE_SETTINGS);
  const [section, setSection] = useState("business");
  const [expandedApps, setExpandedApps] = useState<Record<string, boolean>>({});
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const enabledApps = useMemo(() => SAMI_APPS.filter((app) => enabledKeys.includes(app.key)), [enabledKeys]);
  const availableApps = useMemo(() => SAMI_APPS.filter((app) => !enabledKeys.includes(app.key)), [enabledKeys]);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/business/settings", { cache: "no-store", credentials: "include" });
      const data = (await response.json()) as SettingsResponse;
      if (!response.ok || !data.success || !data.business) throw new Error(data.error || "Failed to load settings.");
      setUser(data.user || null);
      setBusiness(data.business);
      setName(data.business.name || "");
      setSlug(data.business.slug || "");
      setEmail(data.business.email || "");
      setPhone(data.business.phone || "");
      setLogo(data.business.logo || null);
      setEnabledKeys(data.appKeys || []);
      setSettings(mergeSettings(data.settings));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function normalizeSlug(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  }

  function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) { setError("Please select an image file."); return; }
    if (file.size > MAX_LOGO_BYTES) { setError("Logo must be smaller than 900 KB."); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") setLogo(reader.result); };
    reader.onerror = () => setError("Could not read the selected logo.");
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function updateGroup<K extends keyof WorkspaceSettings>(group: K, patch: Partial<WorkspaceSettings[K]>) {
    setSettings((current) => ({ ...current, [group]: { ...(current[group] as object), ...patch } } as WorkspaceSettings));
  }

  function updateAppSetting(appKey: string, key: string, value: AppValue) {
    setSettings((current) => ({
      ...current,
      apps: { ...current.apps, [appKey]: { ...(current.apps[appKey] || {}), [key]: value } },
    }));
  }

  async function saveAll() {
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const response = await fetch("/api/business/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, slug, email, phone, logo, settings }),
      });
      const data = (await response.json()) as SettingsResponse;
      if (!response.ok || !data.success || !data.business) throw new Error(data.error || "Failed to save settings.");
      setBusiness(data.business);
      setSettings(mergeSettings(data.settings));
      setSuccess("Settings saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function addApp(appKey: string) {
    try {
      setAdding(appKey);
      setError("");
      setSuccess("");
      const next = [...enabledKeys, appKey];
      const response = await fetch("/api/apps/selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ appKeys: next }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to add this app.");
      setEnabledKeys(Array.isArray(data.appKeys) ? data.appKeys : next);
      setSuccess(`${SAMI_APPS.find((app) => app.key === appKey)?.name || "App"} added to this workspace.`);
      setSection("apps");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add app.");
    } finally {
      setAdding(null);
    }
  }

  if (loading) {
    return <div className="flex min-h-[520px] items-center justify-center"><div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><Loader2 size={18} className="animate-spin" />Loading settings…</div></div>;
  }

  const nav = [
    { id: "business", label: "Business", icon: <Building2 size={17} /> },
    { id: "account", label: "Account", icon: <UserRound size={17} /> },
    { id: "apps", label: "Apps & features", icon: <Package size={17} />, badge: String(enabledApps.length) },
    { id: "appearance", label: "Appearance", icon: <Palette size={17} /> },
    { id: "notifications", label: "Notifications", icon: <Bell size={17} /> },
    { id: "security", label: "Security", icon: <Shield size={17} /> },
    { id: "ai", label: "AI & automation", icon: <KeyRound size={17} /> },
    { id: "billing", label: "Billing & defaults", icon: <CreditCard size={17} /> },
  ];

  return (
    <div className="h-full overflow-y-auto p-5 sm:p-7 lg:p-9">
      <div className="mx-auto max-w-7xl pb-12">
        <header className="mb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-blue-600 dark:text-blue-400">SaMi Workspace</p>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">Settings</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">Manage your business, account, workspace behaviour, enabled apps and the features that become available when you add apps.</p>
        </header>

        {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
        {success && <div className="mb-5 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300"><Check size={17} />{success}</div>}

        <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:sticky lg:top-0">
            {nav.map((item) => <button key={item.id} type="button" onClick={() => setSection(item.id)} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${section === item.id ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"}`}>
              {item.icon}<span className="flex-1">{item.label}</span>{item.badge && <span className={`rounded-full px-2 py-0.5 text-[10px] ${section === item.id ? "bg-white/15" : "bg-gray-100 dark:bg-gray-800"}`}>{item.badge}</span>}
            </button>)}
          </aside>

          <div className="min-w-0">
            {section === "business" && <BusinessSection business={business} name={name} slug={slug} email={email} phone={phone} logo={logo} setName={setName} setSlug={setSlug} setEmail={setEmail} setPhone={setPhone} setLogo={setLogo} handleLogoChange={handleLogoChange} />}
            {section === "account" && <AccountSection user={user} />}
            {section === "apps" && <AppsSection enabledApps={enabledApps} availableApps={availableApps} adding={adding} addApp={addApp} expandedApps={expandedApps} setExpandedApps={setExpandedApps} settings={settings} updateAppSetting={updateAppSetting} />}
            {section === "appearance" && <AppearanceSection settings={settings} updateGroup={updateGroup} />}
            {section === "notifications" && <NotificationsSection settings={settings} updateGroup={updateGroup} />}
            {section === "security" && <SecuritySection settings={settings} updateGroup={updateGroup} />}
            {section === "ai" && <AISection settings={settings} updateGroup={updateGroup} />}
            {section === "billing" && <BillingSection settings={settings} updateGroup={updateGroup} />}

            <div className="mt-6 flex flex-col gap-3 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-sm font-semibold text-gray-900 dark:text-white">Save workspace changes</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Business profile and settings are saved to SaMi Control.</p></div>
              <button type="button" onClick={saveAll} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 disabled:opacity-60"><Save size={17} />{saving ? "Saving…" : "Save changes"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BusinessSection(p: any) {
  return <Section icon={<Building2 />} title="Business profile" description="Your business identity, contact information and branding.">
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">{p.logo ? <img src={p.logo} alt="Business logo" className="h-full w-full object-contain" /> : <Building2 size={30} className="text-gray-400" />}</div>
        <div><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"><ImagePlus size={16} />{p.logo ? "Change logo" : "Add logo"}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={p.handleLogoChange} className="hidden" /></label><button type="button" onClick={() => p.setLogo(null)} disabled={!p.logo} className="ml-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium disabled:opacity-40 dark:border-gray-700">Remove</button><p className="mt-2 text-xs text-gray-400">PNG, JPG, WEBP or SVG. Maximum 900 KB.</p></div>
      </div>
      <div className="grid gap-5 md:grid-cols-2"><Field label="Business name" value={p.name} onChange={p.setName} placeholder="Your business name" /><Field label="Business slug" value={p.slug} onChange={(v: string) => p.setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80))} placeholder="your-business" /><Field label="Business email" type="email" value={p.email} onChange={p.setEmail} placeholder="business@example.com" /><Field label="Phone" value={p.phone} onChange={p.setPhone} placeholder="+254…" /></div>
    </div>
  </Section>;
}

function AccountSection({ user }: { user: UserSettings | null }) {
  return <Section icon={<UserRound />} title="Account" description="Your SaMi identity and account information."><div className="grid gap-5 md:grid-cols-2"><ReadOnly label="Full name" value={user?.fullName || "Not set"} /><ReadOnly label="Email" value={user?.email || "Not set"} /><ReadOnly label="Account ID" value={user?.id || "—"} /><ReadOnly label="Member since" value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-KE", { dateStyle: "medium" }) : "—"} /></div></Section>;
}

function AppsSection({ enabledApps, availableApps, adding, addApp, expandedApps, setExpandedApps, settings, updateAppSetting }: any) {
  return <div className="space-y-6">
    <Section icon={<Package />} title="Enabled apps" description="Only apps selected for this business appear here. Each enabled app can expose additional settings.">
      <div className="divide-y dark:divide-gray-800">{enabledApps.length === 0 ? <p className="py-2 text-sm text-gray-500">No optional apps are enabled.</p> : enabledApps.map((app: SamiApp) => <AppCard key={app.key} app={app} expanded={expandedApps[app.key] !== false} toggle={() => setExpandedApps((current: Record<string, boolean>) => ({ ...current, [app.key]: current[app.key] === false }))} values={settings.apps[app.key] || {}} update={(key: string, value: AppValue) => updateAppSetting(app.key, key, value)} />)}</div>
    </Section>

    <Section icon={<Plus />} title="Add an app" description="Add new capabilities after registration. The selection is stored for this business and the app schema is installed when one is available.">
      {availableApps.length === 0 ? <p className="text-sm text-gray-500">All currently available SaMi apps are enabled.</p> : <div className="grid gap-3 sm:grid-cols-2">{availableApps.map((app: SamiApp) => <div key={app.key} className="flex items-center gap-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-800"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"><Package size={18} /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{app.name}</p><p className="mt-1 text-xs text-gray-500">{app.description}</p></div><button type="button" disabled={adding === app.key} onClick={() => addApp(app.key)} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{adding === app.key ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}Add</button></div>)}</div>}
    </Section>
  </div>;
}

function AppCard({ app, expanded, toggle, values, update }: any) {
  const config = APP_FEATURES[app.key];
  return <div className="py-5"><button type="button" onClick={toggle} className="flex w-full items-center gap-3 text-left"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"><Package size={18} /></div><div className="min-w-0 flex-1"><p className="font-semibold">{app.name}</p><p className="mt-1 text-xs text-gray-500">{app.description}</p></div>{expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>{expanded && <div className="mt-4 rounded-2xl bg-gray-50 p-5 dark:bg-gray-800/40">{config ? <><p className="mb-4 text-xs text-gray-500">{config.description}</p><div className="grid gap-4 md:grid-cols-2">{config.fields.map((field) => field.type === "toggle" ? <label key={field.key} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"><span className="text-sm font-medium">{field.label}</span><input type="checkbox" checked={Boolean(values[field.key])} onChange={(e) => update(field.key, e.target.checked)} className="h-4 w-4" /></label> : field.type === "select" ? <label key={field.key} className="block"><span className="mb-2 block text-sm font-medium">{field.label}</span><select value={String(values[field.key] ?? DEFAULT_APP_SETTINGS[app.key]?.[field.key] ?? "")} onChange={(e) => update(field.key, e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900">{field.options?.map((option) => <option key={option}>{option}</option>)}</select></label> : <Field key={field.key} label={field.label} value={String(values[field.key] ?? DEFAULT_APP_SETTINGS[app.key]?.[field.key] ?? "")} onChange={(value) => update(field.key, field.type === "number" ? Number(value) : value)} type={field.type} placeholder={field.placeholder} />)}</div></> : <p className="text-sm text-gray-500">This app is enabled. Its dedicated operational settings will appear here as the module registers them.</p>}</div>}</div>;
}

function AppearanceSection({ settings, updateGroup }: any) {
  return <Section icon={<Palette />} title="Appearance" description="Control how SaMi looks and behaves on this device."><div className="grid gap-5 md:grid-cols-2"><SelectField label="Theme" value={settings.appearance.theme} options={["system", "light", "dark"]} onChange={(theme) => updateGroup("appearance", { theme })} /><Toggle label="Compact workspace mode" checked={settings.appearance.compactMode} onChange={(compactMode) => updateGroup("appearance", { compactMode })} /></div></Section>;
}

function NotificationsSection({ settings, updateGroup }: any) {
  return <Section icon={<Bell />} title="Notifications" description="Choose which workspace events can notify you."><div className="grid gap-3 md:grid-cols-2"><Toggle label="Email notifications" checked={settings.notifications.email} onChange={(email) => updateGroup("notifications", { email })} /><Toggle label="Browser notifications" checked={settings.notifications.browser} onChange={(browser) => updateGroup("notifications", { browser })} /><Toggle label="Invoice reminders" checked={settings.notifications.invoiceReminders} onChange={(invoiceReminders) => updateGroup("notifications", { invoiceReminders })} /><Toggle label="Payment alerts" checked={settings.notifications.paymentAlerts} onChange={(paymentAlerts) => updateGroup("notifications", { paymentAlerts })} /></div></Section>;
}

function SecuritySection({ settings, updateGroup }: any) {
  return <Section icon={<Shield />} title="Security" description="Basic workspace session and sensitive-action controls."><div className="grid gap-5 md:grid-cols-2"><SelectField label="Session timeout" value={settings.security.sessionTimeout} options={["1 day", "7 days", "30 days", "90 days"]} onChange={(sessionTimeout) => updateGroup("security", { sessionTimeout })} /><Toggle label="Require re-authentication for sensitive actions" checked={settings.security.requireReauthForSensitiveActions} onChange={(requireReauthForSensitiveActions) => updateGroup("security", { requireReauthForSensitiveActions })} /></div></Section>;
}

function AISection({ settings, updateGroup }: any) {
  return <Section icon={<KeyRound />} title="AI & automation" description="Control SaMi AI assistance and memory features."><div className="grid gap-3 md:grid-cols-2"><Toggle label="Enable AI assistance" checked={settings.ai.enabled} onChange={(enabled) => updateGroup("ai", { enabled })} /><Toggle label="AI suggestions" checked={settings.ai.suggestions} onChange={(suggestions) => updateGroup("ai", { suggestions })} /><Toggle label="AI workspace memory" checked={settings.ai.memory} onChange={(memory) => updateGroup("ai", { memory })} /></div></Section>;
}

function BillingSection({ settings, updateGroup }: any) {
  return <Section icon={<CreditCard />} title="Billing & defaults" description="Business-wide financial defaults. Plan and subscription controls can be expanded here later."><div className="grid gap-5 md:grid-cols-2"><SelectField label="Default currency" value={settings.billing.currency} options={["KES", "USD", "EUR", "GBP"]} onChange={(currency) => updateGroup("billing", { currency })} /><Toggle label="Prices are tax-inclusive" checked={settings.billing.taxInclusive} onChange={(taxInclusive) => updateGroup("billing", { taxInclusive })} /></div></Section>;
}

function Section({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"><div className="border-b border-gray-100 px-6 py-5 dark:border-gray-800"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">{icon}</div><div><h2 className="font-semibold text-gray-900 dark:text-white">{title}</h2><p className="text-xs text-gray-500 dark:text-gray-400">{description}</p></div></div></div><div className="p-6">{children}</div></section>;
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <label className="block"><span className="mb-2 block text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-gray-700 dark:bg-gray-950 dark:text-white" /></label>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-2 block text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white">{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950"><span className="pr-4 text-sm font-medium">{label}</span><button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${checked ? "left-6" : "left-1"}`} /></button></label>;
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return <div><span className="mb-2 block text-sm font-medium">{label}</span><div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300">{value}</div></div>;
}
