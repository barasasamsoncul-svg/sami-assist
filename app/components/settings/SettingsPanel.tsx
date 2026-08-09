"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { Building2, Check, ImagePlus, Loader2, Mail, Save, Trash2, UserRound } from "lucide-react";

type UserSettings = { id: string; fullName: string | null; email: string | null; createdAt: string };
type BusinessSettings = {
  id: string; name: string; slug: string; email: string | null;
  phone: string | null; logo: string | null; status: string;
};
type SettingsResponse = { success: boolean; user?: UserSettings; business?: BusinessSettings; error?: string };

const MAX_LOGO_BYTES = 900 * 1024;

export default function SettingsPanel() {
  const [user, setUser] = useState<UserSettings | null>(null);
  const [business, setBusiness] = useState<BusinessSettings | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadSettings() {
    try {
      setLoading(true); setError("");
      const response = await fetch("/api/business/settings", { cache: "no-store", credentials: "include" });
      const data = (await response.json()) as SettingsResponse;
      if (!response.ok || !data.success || !data.business) throw new Error(data.error || "Failed to load settings.");
      setUser(data.user ?? null); setBusiness(data.business);
      setName(data.business.name || ""); setSlug(data.business.slug || "");
      setEmail(data.business.email || ""); setPhone(data.business.phone || "");
      setLogo(data.business.logo || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings.");
    } finally { setLoading(false); }
  }

  useEffect(() => { loadSettings(); }, []);

  function normalizeSlug(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  }

  function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(""); setSuccess("");
    if (!file.type.startsWith("image/")) { setError("Please select an image file."); return; }
    if (file.size > MAX_LOGO_BYTES) { setError("Logo must be smaller than 900 KB."); return; }

    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") setLogo(reader.result); };
    reader.onerror = () => setError("Could not read the selected logo.");
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function saveSettings() {
    try {
      setSaving(true); setError(""); setSuccess("");
      const response = await fetch("/api/business/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, slug, email, phone, logo }),
      });
      const data = (await response.json()) as SettingsResponse;
      if (!response.ok || !data.success || !data.business) throw new Error(data.error || "Failed to save settings.");

      setBusiness(data.business);
      setName(data.business.name || ""); setSlug(data.business.slug || "");
      setEmail(data.business.email || ""); setPhone(data.business.phone || "");
      setLogo(data.business.logo || null);
      setSuccess("Settings saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally { setSaving(false); }
  }

  if (loading) {
    return <div className="flex min-h-[420px] items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><Loader2 size={18} className="animate-spin" />Loading settings...</div>
    </div>;
  }

  return <div className="mx-auto max-w-5xl pb-10">
    <div className="mb-8">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-blue-600 dark:text-blue-400">Workspace</p>
      <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">Settings</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">Manage your business profile, branding and account information.</p>
    </div>

    {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
    {success && <div className="mb-5 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300"><Check size={17}/>{success}</div>}

    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-gray-200/70 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-100 px-6 py-5 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10"><Building2 size={19} className="text-blue-600 dark:text-blue-400"/></div>
            <div><h2 className="font-semibold text-gray-900 dark:text-white">Business Profile</h2><p className="text-xs text-gray-500 dark:text-gray-400">Information and branding for your business.</p></div>
          </div>
        </div>

        <div className="space-y-6 p-6">
          <div>
            <label className="mb-3 block text-sm font-medium text-gray-800 dark:text-gray-200">Business logo</label>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                {logo ? <img src={logo} alt="Business logo" className="h-full w-full object-contain"/> : <Building2 size={30} className="text-gray-400"/>}
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
                    <ImagePlus size={16}/>{logo ? "Change logo" : "Add logo"}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoChange} className="hidden"/>
                  </label>
                  {logo && <button type="button" onClick={() => setLogo(null)} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300"><Trash2 size={16}/>Remove</button>}
                </div>
                <p className="text-xs text-gray-400">PNG, JPG, WEBP or SVG. Maximum 900 KB.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Business name" value={name} onChange={setName} placeholder="Your business name"/>
            <Field label="Business slug" value={slug} onChange={(v) => setSlug(normalizeSlug(v))} placeholder="your-business"/>
            <Field label="Business email" type="email" value={email} onChange={setEmail} placeholder="business@example.com"/>
            <Field label="Phone" value={phone} onChange={setPhone} placeholder="+254..."/>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-gray-200/70 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-100 px-6 py-5 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800"><UserRound size={19} className="text-gray-600 dark:text-gray-300"/></div>
            <div><h2 className="font-semibold text-gray-900 dark:text-white">Account</h2><p className="text-xs text-gray-500 dark:text-gray-400">Your SaMi account information.</p></div>
          </div>
        </div>
        <div className="grid gap-5 p-6 md:grid-cols-2">
          <ReadOnlyField label="Full name" value={user?.fullName || "Not set"} icon={<UserRound size={16}/>}/>
          <ReadOnlyField label="Account email" value={user?.email || "Not set"} icon={<Mail size={16}/>}/>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200/70 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-semibold text-gray-900 dark:text-white">Save your changes</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Changes are saved to your business in SaMi Control.</p></div>
          <button type="button" onClick={saveSettings} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 disabled:opacity-60">
            {saving ? <Loader2 size={17} className="animate-spin"/> : <Save size={17}/>}
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </section>
    </div>
  </div>;
}

function Field({label,value,onChange,placeholder,type="text"}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string;type?:string}) {
  return <label className="block">
    <span className="mb-2 block text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>
    <input type={type} value={value} onChange={(e)=>onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-gray-700 dark:bg-gray-950 dark:text-white"/>
  </label>;
}

function ReadOnlyField({label,value,icon}:{label:string;value:string;icon:React.ReactNode}) {
  return <div>
    <span className="mb-2 block text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300">{icon}<span className="truncate">{value}</span></div>
  </div>;
}
