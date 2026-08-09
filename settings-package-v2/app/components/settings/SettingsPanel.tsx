"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bell,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CreditCard,
  ImagePlus,
  KeyRound,
  Loader2,
  Mail,
  Package,
  Palette,
  Plus,
  Save,
  Settings2,
  Shield,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { APP_CATEGORIES, SAMI_APPS, type SamiApp, type SamiAppCategory } from "@/lib/sami-apps";

type UserSettings = { id: string; fullName: string | null; email: string | null; createdAt: string };
type BusinessSettings = {
  id: string; name: string; slug: string; email: string | null; phone: string | null;
  logo: string | null; status: string;
};
type SettingsResponse = { success: boolean; user?: UserSettings; business?: BusinessSettings; appKeys?: string[]; apps?: SamiApp[]; error?: string };

const MAX_LOGO_BYTES = 900 * 1024;

const APP_FEATURES: Record<string, { title: string; description: string; fields: Array<{ key: string; label: string; type?: "text" | "number" | "toggle" | "select"; options?: string[]; placeholder?: string }> }> = {
  invoicing: {
    title: "Invoicing",
    description: "Control defaults used when creating invoices.",
    fields: [
      { key: "invoice_prefix", label: "Invoice prefix", placeholder: "INV" },
      { key: "default_tax_rate", label: "Default tax rate (%)", type: "number", placeholder: "16" },
      { key: "payment_terms", label: "Default payment terms", type: "select", options: ["Due on receipt", "7 days", "14 days", "30 days", "60 days"] },
      { key: "auto_numbering", label: "Automatic invoice numbering", type: "toggle" },
      { key: "show_payment_details", label: "Show payment details on invoices", type: "toggle" },
    ],
  },
  accounting: {
    title: "Accounting",
    description: "Configure accounting and reporting preferences.",
    fields: [
      { key: "currency", label: "Currency", type: "select", options: ["KES", "USD", "EUR", "GBP"] },
      { key: "fiscal_year_start", label: "Fiscal year starts", type: "select", options: ["January", "April", "July", "October"] },
      { key: "enable_tax_tracking", label: "Enable tax tracking", type: "toggle" },
    ],
  },
  inventory: {
    title: "Inventory",
    description: "Control stock and product behaviour.",
    fields: [
      { key: "low_stock_threshold", label: "Low-stock threshold", type: "number", placeholder: "5" },
      { key: "default_unit", label: "Default unit", type: "select", options: ["pcs", "kg", "litres", "boxes", "units"] },
      { key: "allow_negative_stock", label: "Allow negative stock", type: "toggle" },
      { key: "track_stock_movements", label: "Track stock movements", type: "toggle" },
    ],
  },
  expenses: {
    title: "Expenses",
    description: "Set how expenses are recorded and approved.",
    fields: [
      { key: "require_receipt", label: "Require receipt for expenses", type: "toggle" },
      { key: "expense_approval", label: "Approval workflow", type: "select", options: ["None", "Owner approval", "Manager approval"] },
    ],
  },
  customers: {
    title: "Customers",
    description: "Customer-management preferences.",
    fields: [
      { key: "customer_code_prefix", label: "Customer code prefix", placeholder: "CUS" },
      { key: "require_customer_email", label: "Require customer email", type: "toggle" },
    ],
  },
};

const DEFAULTS: Record<string, Record<string, string | boolean>> = {
  invoicing: { invoice_prefix: "INV", default_tax_rate: "16", payment_terms: "30 days", auto_numbering: true, show_payment_details: true },
  accounting: { currency: "KES", fiscal_year_start: "January", enable_tax_tracking: true },
  inventory: { low_stock_threshold: "5", default_unit: "pcs", allow_negative_stock: false, track_stock_movements: true },
  expenses: { require_receipt: true, expense_approval: "Owner approval" },
  customers: { customer_code_prefix: "CUS", require_customer_email: false },
};

export default function SettingsPanel() {
  const [user, setUser] = useState<UserSettings | null>(null);
  const [business, setBusiness] = useState<BusinessSettings | null>(null);
  const [enabledKeys, setEnabledKeys] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<SamiApp[]>([]);
  const [settings, setSettings] = useState<Record<string, Record<string, string | boolean>>>({});
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

  const enabledApps = useMemo(() => catalog.filter((app) => enabledKeys.includes(app.key)), [catalog, enabledKeys]);
  const availableApps = useMemo(() => catalog.filter((app) => !enabledKeys.includes(app.key)), [catalog, enabledKeys]);

  async function load() {
    try {
      setLoading(true); setError("");
      const [settingsRes, appsRes, catalogRes] = await Promise.all([
        fetch("/api/business/settings", { cache: "no-store", credentials: "include" }),
        fetch("/api/apps", { cache: "no-store", credentials: "include" }),
        fetch("/api/apps/catalog", { cache: "no-store", credentials: "include" }),
      ]);
      const data = (await settingsRes.json()) as SettingsResponse;
      const appsData = await appsRes.json();
      const catalogData = await catalogRes.json();
      if (!settingsRes.ok || !data.success || !data.business) throw new Error(data.error || "Failed to load settings.");
      const apps = Array.isArray(catalogData.apps) ? catalogData.apps : Array.isArray(appsData.apps) ? appsData.apps : [];
      const keys = Array.isArray(appsData.appKeys) ? appsData.appKeys : Array.isArray(data.appKeys) ? data.appKeys : [];
      setUser(data.user ?? null); setBusiness(data.business); setCatalog(apps); setEnabledKeys(keys);
      setName(data.business.name || ""); setSlug(data.business.slug || ""); setEmail(data.business.email || ""); setPhone(data.business.phone || ""); setLogo(data.business.logo || null);
      const initial: Record<string, Record<string, string | boolean>> = {};
      keys.forEach((key: string) => { if (APP_FEATURES[key]) initial[key] = { ...(DEFAULTS[key] || {}) }; });
      setSettings(initial);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load settings."); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function normalizeSlug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80); }

  function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please select an image file."); return; }
    if (file.size > MAX_LOGO_BYTES) { setError("Logo must be smaller than 900 KB."); return; }
    const reader = new FileReader(); reader.onload = () => { if (typeof reader.result === "string") setLogo(reader.result); }; reader.readAsDataURL(file); event.target.value = "";
  }

  async function saveBusiness() {
    try {
      setSaving(true); setError(""); setSuccess("");
      const res = await fetch("/api/business/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ name, slug, email, phone, logo }) });
      const data = await res.json(); if (!res.ok || !data.success) throw new Error(data.error || "Failed to save settings.");
      setBusiness(data.business); setSuccess("Business settings saved.");
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to save settings."); }
    finally { setSaving(false); }
  }

  async function addApp(appKey: string) {
    try {
      setAdding(appKey); setError(""); setSuccess("");
      const next = [...enabledKeys, appKey];
      const res = await fetch("/api/apps/selection", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ appKeys: next }) });
      const data = await res.json(); if (!res.ok || !data.success) throw new Error(data.error || "Unable to add this app.");
      setEnabledKeys(Array.isArray(data.appKeys) ? data.appKeys : next); setSuccess("App added. Reloading your workspace…");
      setTimeout(() => window.location.reload(), 500);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to add app."); }
    finally { setAdding(null); }
  }

  function updateAppSetting(appKey: string, key: string, value: string | boolean) {
    setSettings((current) => ({ ...current, [appKey]: { ...(current[appKey] || {}), [key]: value } }));
  }

  if (loading) return <div className="flex min-h-[420px] items-center justify-center"><div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><Loader2 size={18} className="animate-spin" />Loading settings…</div></div>;

  return <div className="mx-auto max-w-6xl pb-12 text-gray-900 dark:text-gray-100">
    <header className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-blue-600 dark:text-blue-400">SaMi Workspace</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">Settings</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">Everything that controls your account, business workspace, enabled apps and app-specific features.</p></header>
    {error && <div className="mb-5 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</div>}
    {success && <div className="mb-5 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300"><Check size={17}/>{success}</div>}

    <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
      <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:sticky lg:top-5">
        <SettingNav active={section} id="business" icon={<Building2 size={17}/>} label="Business" onClick={setSection}/>
        <SettingNav active={section} id="account" icon={<UserRound size={17}/>} label="Account" onClick={setSection}/>
        <SettingNav active={section} id="apps" icon={<Package size={17}/>} label="Apps & Features" onClick={setSection} badge={String(enabledApps.length)}/>
        <SettingNav active={section} id="notifications" icon={<Bell size={17}/>} label="Notifications" onClick={setSection}/>
        <SettingNav active={section} id="security" icon={<Shield size={17}/>} label="Security" onClick={setSection}/>
        <SettingNav active={section} id="appearance" icon={<Palette size={17}/>} label="Appearance" onClick={setSection}/>
        <SettingNav active={section} id="billing" icon={<CreditCard size={17}/>} label="Plan & Billing" onClick={setSection}/>
      </aside>

      <main className="min-w-0 space-y-6">
        {section === "business" && <BusinessSection {...{name,setName,slug,setSlug,email,setEmail,phone,setPhone,logo,setLogo,handleLogoChange,saving,saveBusiness,business}} />}
        {section === "account" && <AccountSection user={user} />}
        {section === "apps" && <AppsSection enabledApps={enabledApps} availableApps={availableApps} adding={adding} addApp={addApp} expandedApps={expandedApps} setExpandedApps={setExpandedApps} settings={settings} updateAppSetting={updateAppSetting} />}
        {section === "notifications" && <SimpleSection icon={<Bell/>} title="Notifications" description="Control how SaMi keeps you informed." rows={["Business activity alerts","Invoice and payment reminders","Low-stock alerts","AI workspace notifications"]} />}
        {section === "security" && <SimpleSection icon={<Shield/>} title="Security" description="Security controls for your SaMi account." rows={["Change password","Active sessions","Sign out of other devices","Two-step verification"]} />}
        {section === "appearance" && <SimpleSection icon={<Palette/>} title="Appearance" description="Visual preferences are controlled from the workspace theme button." rows={["Light / dark theme","Compact workspace density","Sidebar behaviour"]} />}
        {section === "billing" && <SimpleSection icon={<CreditCard/>} title="Plan & Billing" description="Your workspace starts on the Free plan. Billing controls can be added here as paid plans are introduced." rows={["Current plan: Free","Usage and limits","Upgrade plan","Billing history"]} />}
      </main>
    </div>
  </div>;
}

function BusinessSection(p: any) { return <section className="rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"><Header icon={<Building2/>} title="Business profile" description="Identity, contact information and branding."/><div className="space-y-6 p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">{p.logo ? <img src={p.logo} alt="Business logo" className="h-full w-full object-contain"/> : <Building2 size={30} className="text-gray-400"/>}</div><div><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"><ImagePlus size={16}/>{p.logo ? "Change logo" : "Add logo"}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={p.handleLogoChange} className="hidden"/></label>{p.logo && <button type="button" onClick={()=>p.setLogo(null)} className="ml-2 inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm"><Trash2 size={16}/>Remove</button>}<p className="mt-2 text-xs text-gray-400">PNG, JPG, WEBP or SVG. Maximum 900 KB.</p></div></div><div className="grid gap-5 md:grid-cols-2"><Field label="Business name" value={p.name} onChange={p.setName}/><Field label="Business slug" value={p.slug} onChange={(v:string)=>p.setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80))}/><Field label="Business email" value={p.email} onChange={p.setEmail} type="email"/><Field label="Phone" value={p.phone} onChange={p.setPhone}/></div><div className="flex justify-end border-t pt-5 dark:border-gray-800"><button onClick={p.saveBusiness} disabled={p.saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{p.saving?<Loader2 size={17} className="animate-spin"/>:<Save size={17}/>} {p.saving?"Saving…":"Save business"}</button></div></div></section>; }

function AccountSection({user}:{user:UserSettings|null}) { return <section className="rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"><Header icon={<UserRound/>} title="Account" description="Your SaMi identity and account information."/><div className="grid gap-5 p-6 md:grid-cols-2"><ReadOnly label="Full name" value={user?.fullName||"Not set"}/><ReadOnly label="Email" value={user?.email||"Not set"}/><ReadOnly label="Account ID" value={user?.id||"—"}/><ReadOnly label="Member since" value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-KE",{dateStyle:"medium"}):"—"}/></div></section>; }

function AppsSection({enabledApps,availableApps,adding,addApp,expandedApps,setExpandedApps,settings,updateAppSetting}:{enabledApps:SamiApp[];availableApps:SamiApp[];adding:string|null;addApp:(key:string)=>void;expandedApps:Record<string,boolean>;setExpandedApps:any;settings:Record<string,Record<string,string|boolean>>;updateAppSetting:(a:string,k:string,v:string|boolean)=>void}) { return <div className="space-y-6"><section className="rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"><Header icon={<Package/>} title="Your apps" description="These apps are installed for this business. Each enabled app can expose its own settings below."/><div className="divide-y dark:divide-gray-800">{enabledApps.length===0?<div className="p-6 text-sm text-gray-500">No apps enabled.</div>:enabledApps.map(app=><AppSettingCard key={app.key} app={app} enabled expanded={expandedApps[app.key]!==false} toggle={()=>setExpandedApps((x:any)=>({...x,[app.key]:x[app.key]===false}))} values={settings[app.key]||{}} update={(k,v)=>updateAppSetting(app.key,k,v)}/>)}</div></section><section className="rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"><Header icon={<Plus/>} title="Add more apps" description="Add another SaMi business module after registration. The app is provisioned for this tenant and will appear in the dashboard after reload."/><div className="grid gap-3 p-6 sm:grid-cols-2">{availableApps.length===0?<div className="text-sm text-gray-500">All available apps are already enabled.</div>:availableApps.map(app=><div key={app.key} className="flex items-center gap-3 rounded-2xl border p-4 dark:border-gray-800"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"><Package size={18}/></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{app.name}</p><p className="truncate text-xs text-gray-500">{app.description}</p></div><button disabled={adding===app.key} onClick={()=>addApp(app.key)} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{adding===app.key?<Loader2 size={14} className="animate-spin"/>:<Plus size={14}/>}Add</button></div>)}</div></section></div>; }

function AppSettingCard({app,enabled,expanded,toggle,values,update}:{app:SamiApp;enabled:boolean;expanded:boolean;toggle:()=>void;values:Record<string,string|boolean>;update:(k:string,v:string|boolean)=>void}) { const cfg=APP_FEATURES[app.key]; return <div className="p-5"><button onClick={toggle} className="flex w-full items-center gap-3 text-left"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"><Package size={18}/></div><div className="min-w-0 flex-1"><p className="font-semibold">{app.name}</p><p className="text-xs text-gray-500">{app.description}</p></div>{expanded?<ChevronDown size={18}/>:<ChevronRight size={18}/>}</button>{expanded&&<div className="mt-5 rounded-2xl bg-gray-50 p-5 dark:bg-gray-800/40">{cfg?<><p className="mb-4 text-xs text-gray-500">{cfg.description}</p><div className="grid gap-4 md:grid-cols-2">{cfg.fields.map(f=>f.type==="toggle"?<label key={f.key} className="flex items-center justify-between rounded-xl border bg-white p-4 dark:border-gray-700 dark:bg-gray-900"><span className="text-sm font-medium">{f.label}</span><input type="checkbox" checked={Boolean(values[f.key] ?? DEFAULTS[app.key]?.[f.key])} onChange={e=>update(f.key,e.target.checked)} className="h-4 w-4"/></label>:f.type==="select"?<label key={f.key} className="block"><span className="mb-2 block text-sm font-medium">{f.label}</span><select value={String(values[f.key] ?? DEFAULTS[app.key]?.[f.key] ?? "")} onChange={e=>update(f.key,e.target.value)} className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900">{f.options?.map(o=><option key={o}>{o}</option>)}</select></label>:<Field key={f.key} label={f.label} value={String(values[f.key] ?? DEFAULTS[app.key]?.[f.key] ?? "")} onChange={v=>update(f.key,v)} type={f.type||"text"} placeholder={f.placeholder}/>)}</div><p className="mt-4 text-[11px] text-gray-400">These controls are ready in the workspace UI. Persisting each app's operational settings should be wired to that app's tenant schema as its tables are finalized.</p></>:<p className="text-sm text-gray-500">{app.name} is enabled. No dedicated feature controls have been registered for this module yet.</p>}</div>}</div>; }

function SimpleSection({icon,title,description,rows}:{icon:React.ReactNode;title:string;description:string;rows:string[]}) { return <section className="rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"><Header icon={icon} title={title} description={description}/><div className="divide-y dark:divide-gray-800">{rows.map((r,i)=><div key={r} className="flex items-center justify-between p-5"><div><p className="text-sm font-semibold">{r}</p><p className="mt-1 text-xs text-gray-500">{i===0?"Available in this settings area.":"Control will be connected as the underlying feature is implemented."}</p></div><ChevronRight size={17} className="text-gray-400"/></div>)}</div></section>; }

function Header({icon,title,description}:{icon:React.ReactNode;title:string;description:string}) { return <div className="border-b p-6 dark:border-gray-800"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">{icon}</div><div><h2 className="font-semibold">{title}</h2><p className="text-xs text-gray-500">{description}</p></div></div></div>; }
function SettingNav({active,id,icon,label,onClick,badge}:{active:string;id:string;icon:React.ReactNode;label:string;onClick:(id:string)=>void;badge?:string}) { return <button onClick={()=>onClick(id)} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium ${active===id?"bg-blue-600 text-white":"text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"}`}>{icon}<span className="flex-1">{label}</span>{badge&&<span className={`rounded-full px-2 py-0.5 text-[10px] ${active===id?"bg-white/15":"bg-gray-100 dark:bg-gray-800"}`}>{badge}</span>}</button>; }
function Field({label,value,onChange,placeholder,type="text"}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string;type?:string}) { return <label className="block"><span className="mb-2 block text-sm font-medium">{label}</span><input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"/></label>; }
function ReadOnly({label,value}:{label:string;value:string}) { return <div><span className="mb-2 block text-sm font-medium">{label}</span><div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300">{value}</div></div>; }
