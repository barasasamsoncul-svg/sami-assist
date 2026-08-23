"use client";

import {
  AppWindow,
  BellRing,
  Building2,
  Check,
  ChevronDown,
  CreditCard,
  Database,
  ImagePlus,
  Loader2,
  LogOut,
  Palette,
  Save,
  Settings2,
  Shield,
  Trash2,
  UserRound,
  Users,
  X,
  Key,
  Monitor,
  Smartphone,
  Tablet,
  UserPlus,
  Crown,
  Send,
  Plus,
  Copy,
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react";
import { ChangeEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { APP_CATEGORIES, SAMI_APPS, type SamiApp } from "@/lib/sami-apps";

// ============================================================================
// TYPES
// ============================================================================

type UserSettings = {
  id: string;
  fullName: string | null;
  email: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
};

type BusinessSettings = {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  status: string;
  type: string | null;
  country: string | null;
  currency: string | null;
  timezone: string | null;
  tax_id: string | null;
  registration_number: string | null;
  website: string | null;
  address: string | null;
  industry: string | null;
  founded_year: number | null;
  employee_count: number | null;
};

type TeamMember = {
  user_id: string;
  full_name: string;
  email: string;
  role: "owner" | "admin" | "manager" | "member";
  permissions: string[];
  status: "active" | "invited" | "suspended";
  invited_at: string;
  last_active_at: string | null;
  created_at: string;
};

type Session = {
  id: string;
  device: string;
  browser: string;
  os: string;
  ip: string;
  location: string;
  last_active: string;
  created_at: string;
  expires_at: string;
  is_current: boolean;
};

type ApiKey = {
  id: string;
  name: string;
  key_preview: string;
  permissions: string[];
  last_used: string | null;
  created_at: string;
  expires_at: string | null;
};

type BillingInfo = {
  id: string;
  business_id: string;
  plan: "free" | "pro" | "business" | "enterprise";
  status: "active" | "past_due" | "canceled" | "trialing";
  current_period_end: string | null;
};

type SettingsResponse = {
  success: boolean;
  user?: UserSettings;
  business?: BusinessSettings;
  settings?: Record<string, Record<string, unknown>>;
  appKeys?: string[];
  apps?: SamiApp[];
  team?: TeamMember[];
  sessions?: Session[];
  apiKeys?: ApiKey[];
  billing?: BillingInfo;
  error?: string;
};

type SectionKey =
  | "general"
  | "account"
  | "team"
  | "billing"
  | "appearance"
  | "notifications"
  | "security"
  | "data"
  | "apps"
  | `app:${string}`
  | "sessions"
  | "api-keys";

const MAX_LOGO_BYTES = 900 * 1024;

// ============================================================================
// CONSTANTS
// ============================================================================

const COUNTRIES = [
  "Kenya", "United States", "United Kingdom", "Canada", "Australia",
  "Nigeria", "South Africa", "Ghana", "Egypt", "Morocco",
  "Germany", "France", "Italy", "Spain", "Netherlands",
  "India", "China", "Japan", "Singapore", "UAE",
];

const CURRENCIES = ["KES", "USD", "EUR", "GBP", "NGN", "ZAR", "GHS", "EGP", "AED", "INR", "CNY", "JPY", "SGD"];

const TIMEZONES = [
  "Africa/Nairobi", "Africa/Lagos", "Africa/Cairo", "Africa/Johannesburg",
  "America/New_York", "America/Los_Angeles", "America/Chicago", "America/Denver",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid",
  "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Asia/Shanghai",
  "Australia/Sydney", "Australia/Melbourne", "Pacific/Auckland",
];

const BUSINESS_TYPES = [
  "Sole Proprietorship", "Partnership", "Limited Liability Company (LLC)",
  "Corporation (C-Corp)", "Corporation (S-Corp)", "Non-Profit",
  "Cooperative", "Public Limited Company (PLC)", "Private Limited Company (Ltd)",
  "Joint Venture", "Trust", "Other",
];

const INDUSTRIES = [
  "Technology & Software", "Financial Services", "Healthcare", "Retail",
  "Manufacturing", "Education", "Construction", "Real Estate",
  "Agriculture", "Transportation & Logistics", "Hospitality & Tourism",
  "Media & Entertainment", "Professional Services", "Non-Profit",
  "Government", "Energy & Utilities", "Telecommunications", "Other",
];

// ============================================================================
// APP SETTING DEFINITIONS
// ============================================================================

const APP_SETTING_DEFINITIONS: Record<
  string,
  { label: string; description: string; fields: Array<{ key: string; label: string; type: "text" | "number" | "boolean" | "select" | "textarea"; options?: string[]; defaultValue: unknown }> }
> = {
  accounting: {
    label: "Accounting",
    description: "Accounting defaults used by SaMi financial tools.",
    fields: [
      { key: "currency", label: "Default currency", type: "select", options: ["KES", "USD", "EUR", "GBP", "NGN", "ZAR"], defaultValue: "KES" },
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
      { key: "defaultPipeline", label: "Default pipeline", type: "select", options: ["Sales", "Support", "Onboarding"], defaultValue: "Sales" },
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
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function inputClass() {
  return "w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500";
}

function normalizeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SettingsPanel({ initialSection = "general" }: { initialSection?: string }) {
  // State
  const [section, setSection] = useState<SectionKey>(initialSection as SectionKey);
  const [user, setUser] = useState<UserSettings | null>(null);
  const [business, setBusiness] = useState<BusinessSettings | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [stored, setStored] = useState<Record<string, Record<string, unknown>>>({});
  const [enabledKeys, setEnabledKeys] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<SamiApp[]>(SAMI_APPS);

  // Business form
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
const [uploadingLogo, setUploadingLogo] = useState(false);
  const [businessType, setBusinessType] = useState("");
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState("");
  const [timezone, setTimezone] = useState("");
  const [taxId, setTaxId] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [industry, setIndustry] = useState("");
  const [foundedYear, setFoundedYear] = useState<number | null>(null);
  const [employeeCount, setEmployeeCount] = useState<number | null>(null);


  // Account form
  const [fullName, setFullName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  // UI State
  const [generalSaving, setGeneralSaving] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [savingSection, setSavingSection] = useState("");
  const [appsSaving, setAppsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [appSearch, setAppSearch] = useState("");

  // Modals
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "manager" | "member">("member");
  const [apiKeyName, setApiKeyName] = useState("");
  const [apiKeyPermissions, setApiKeyPermissions] = useState<string[]>([]);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

  // Data Loading
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
      setTeam(data.team ?? []);
      setBilling(data.billing ?? null);
      setSessions(data.sessions ?? []);
      setApiKeys(data.apiKeys ?? []);
      setName(data.business.name || "");
      setSlug(data.business.slug || "");
      setEmail(data.business.email || "");
      setPhone(data.business.phone || "");
      setLogo(data.business.logo_url || null);
      setBusinessType(data.business.type || "");
      setCountry(data.business.country || "");
      setCurrency(data.business.currency || "KES");
      setTimezone(data.business.timezone || "Africa/Nairobi");
      setTaxId(data.business.tax_id || "");
      setRegistrationNumber(data.business.registration_number || "");
      setWebsite(data.business.website || "");
      setAddress(data.business.address || "");
      setIndustry(data.business.industry || "");
      setFoundedYear(data.business.founded_year || null);
      setEmployeeCount(data.business.employee_count || null);
      if (data.user) {
        setFullName(data.user.fullName || "");
        setAccountEmail(data.user.email || "");
        setTwoFactorEnabled(data.user.twoFactorEnabled || false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => setSection(initialSection as SectionKey), [initialSection]);

 /// Business Profile
async function saveGeneral() {
  try {
    setGeneralSaving(true);
    setError("");
    setNotice("");

    let logoUrl = logo;

    // Upload the newly selected logo first
    if (logoFile) {
  setUploadingLogo(true);

  logoUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read the logo file."));
      }
    };

    reader.onerror = () => {
      reject(new Error("Could not read the logo file."));
    };

    reader.readAsDataURL(logoFile);
  });
}

    // Save the business profile and logo URL
    const response = await fetch("/api/business/settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        name,
        slug,
        email,
        phone,
        logo_url: logoUrl,
        type: businessType,
        country,
        currency,
        timezone,
        taxId,
        registrationNumber,
        website,
        address,
        industry,
        foundedYear,
        employeeCount,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success || !data.business) {
      throw new Error(
        data.error || "Could not save business profile."
      );
    }

    setBusiness(data.business);

    // Use the permanent database URL after saving
    setLogo(data.business.logo_url ?? null);
    setLogoFile(null);

    setNotice("Business profile updated.");
    setTimeout(() => setNotice(""), 3000);
  } catch (error) {
    setError(
      error instanceof Error
        ? error.message
        : "Could not save business profile."
    );
  } finally {
    setUploadingLogo(false);
    setGeneralSaving(false);
  }
}

const handleLogoChange = (
  event: React.ChangeEvent<HTMLInputElement>
) => {
  const file = event.target.files?.[0];

  if (!file) return;

  const allowedTypes = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/svg+xml",
  ];

  if (!allowedTypes.includes(file.type)) {
    alert("Please select a PNG, JPG, WEBP or SVG image.");
    event.target.value = "";
    return;
  }

  if (file.size > 900 * 1024) {
    alert("Logo must be smaller than 900 KB.");
    event.target.value = "";
    return;
  }

  setLogoFile(file);

  const previewUrl = URL.createObjectURL(file);
  setLogo(previewUrl);
};

  // Account
  async function saveAccount() {
    try {
      setAccountSaving(true);
      setError("");
      setNotice("");
      const payload: any = { fullName, email: accountEmail, twoFactorEnabled };
      if (newPassword) {
        if (newPassword !== confirmPassword) throw new Error("Passwords do not match.");
        if (newPassword.length < 8) throw new Error("Password must be at least 8 characters.");
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
        payload.confirmPassword = confirmPassword;
      }
      const response = await fetch("/api/user/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not save account settings.");
      setUser(data.user);
      setNotice("Account updated.");
      setTimeout(() => setNotice(""), 3000);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordModal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save account settings.");
    } finally {
      setAccountSaving(false);
    }
  }

  // Team
  async function inviteTeamMember() {
    try {
      const response = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not send invitation.");
      await load();
      setShowInviteModal(false);
      setInviteEmail("");
      setNotice("Team member added.");
      setTimeout(() => setNotice(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send invitation.");
    }
  }

  // Sessions
  async function revokeSession(sessionId: string) {
    if (!confirm("Revoke this session?")) return;
    try {
      const response = await fetch("/api/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not revoke session.");
      await load();
      setNotice("Session revoked.");
      setTimeout(() => setNotice(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke session.");
    }
  }

  async function revokeAllSessions() {
    if (!confirm("Revoke all other sessions?")) return;
    try {
      const response = await fetch("/api/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId: 'all' }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not revoke sessions.");
      await load();
      setNotice("All other sessions revoked.");
      setTimeout(() => setNotice(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke sessions.");
    }
  }

  // API Keys
  async function createApiKey() {
    try {
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: apiKeyName, permissions: apiKeyPermissions }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not create API key.");
      setNewApiKey(data.apiKey.key);
      await load();
      setShowApiKeyModal(false);
      setApiKeyName("");
      setApiKeyPermissions([]);
      setTimeout(() => setNewApiKey(null), 30000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create API key.");
    }
  }

  async function deleteApiKey(keyId: string) {
    if (!confirm("Delete this API key?")) return;
    try {
      const response = await fetch("/api/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ keyId }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not delete API key.");
      await load();
      setNotice("API key deleted.");
      setTimeout(() => setNotice(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete API key.");
    }
  }

  // Apps
  async function updateApps(nextKeys: string[]) {
    try {
      setAppsSaving(true);
      setError("");
      const response = await fetch("/api/apps/selection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ appKeys: nextKeys }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not update apps.");
      setEnabledKeys(data.appKeys ?? nextKeys);
      setNotice("Apps updated.");
      setTimeout(() => setNotice(""), 3000);
      window.dispatchEvent(new CustomEvent("sami:apps-updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update apps.");
    } finally {
      setAppsSaving(false);
    }
  }

  // Settings
  function updateStored(sectionKey: string, key: string, value: unknown) {
    setStored((current) => ({
      ...current,
      [sectionKey]: { ...(current[sectionKey] ?? {}), [key]: value },
    }));
    // Auto-save after 500ms debounce
    clearTimeout((window as any)._settingsTimeout);
    (window as any)._settingsTimeout = setTimeout(() => {
      saveSection(sectionKey);
    }, 500);
  }

  async function saveSection(sectionKey: string) {
    try {
      setSavingSection(sectionKey);
      const response = await fetch("/api/business/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ section: sectionKey, settings: stored[sectionKey] ?? {} }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not save settings.");
      setStored(data.settings ?? stored);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setSavingSection("");
    }
  }

  // Derived State
  const enabledApps = useMemo(() => catalog.filter((app) => enabledKeys.includes(app.key)), [catalog, enabledKeys]);
  const filteredCatalog = useMemo(() => {
    const q = appSearch.trim().toLowerCase();
    return catalog.filter((app) => !q || `${app.name} ${app.description}`.toLowerCase().includes(q));
  }, [catalog, appSearch]);
  const appSpecificSections = enabledApps.filter((app) => APP_SETTING_DEFINITIONS[app.key]);

  const roleLabels = { owner: "Owner", admin: "Admin", manager: "Manager", member: "Member" };
  const roleColors = {
    owner: "text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400",
    admin: "text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400",
    manager: "text-blue-600 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400",
    member: "text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-400",
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={28} className="animate-spin text-blue-600" />
        <span className="ml-3 text-sm text-gray-500">Loading settings...</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-6 px-4">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your workspace and account preferences.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
          {business?.name || "Workspace"}
        </div>
      </div>

      {/* Notice */}
      {notice && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          <Check size={16} />
          {notice}
        </div>
      )}

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Content */}
      {section === "general" && (
        <div className="space-y-6">
          {/* Logo */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-start gap-6">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                {logo ? <img src={logo} alt="Logo" className="h-full w-full object-contain" /> : <Building2 size={28} className="text-gray-400" />}
              </div>
              <div className="flex-1">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  <ImagePlus size={16} /> {logo ? "Change Logo" : "Upload Logo"}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoChange} className="hidden" />
                </label>
                {logo && (
                  <button onClick={() => setLogo(null)} className="ml-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300">
                    <Trash2 size={16} className="inline mr-1" /> Remove
                  </button>
                )}
                <p className="mt-2 text-xs text-gray-400">PNG, JPG, WEBP or SVG. Max 900 KB.</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass()} placeholder="Acme Corp" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Slug</label>
                <input value={slug} onChange={(e) => setSlug(normalizeSlug(e.target.value))} className={inputClass()} placeholder="acme-corp" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass()} placeholder="info@acme.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Phone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass()} placeholder="+254 700 000 000" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Type</label>
                <select value={businessType} onChange={(e) => setBusinessType(e.target.value)} className={inputClass()}>
                  <option value="">Select type</option>
                  {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Industry</label>
                <select value={industry} onChange={(e) => setIndustry(e.target.value)} className={inputClass()}>
                  <option value="">Select industry</option>
                  {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Country</label>
                <select value={country} onChange={(e) => setCountry(e.target.value)} className={inputClass()}>
                  <option value="">Select country</option>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Currency</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass()}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Timezone</label>
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass()}>
                  {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tax ID / VAT</label>
                <input value={taxId} onChange={(e) => setTaxId(e.target.value)} className={inputClass()} placeholder="TAX-123456" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Registration Number</label>
                <input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} className={inputClass()} placeholder="REG-123456" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Website</label>
                <input value={website} onChange={(e) => setWebsite(e.target.value)} className={inputClass()} placeholder="https://acme.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Founded Year</label>
                <input type="number" value={foundedYear?.toString() || ""} onChange={(e) => setFoundedYear(e.target.value ? parseInt(e.target.value) : null)} className={inputClass()} placeholder="2020" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Employee Count</label>
                <input type="number" value={employeeCount?.toString() || ""} onChange={(e) => setEmployeeCount(e.target.value ? parseInt(e.target.value) : null)} className={inputClass()} placeholder="50" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Address</label>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass()} rows={3} placeholder="123 Business Street, City, Country" />
              </div>
            </div>
            <div className="mt-6 flex justify-end border-t border-gray-100 pt-6 dark:border-gray-800">
              <button onClick={saveGeneral} disabled={generalSaving} className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
                {generalSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {generalSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {section === "account" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass()} placeholder="John Doe" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
              <input type="email" value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} className={inputClass()} placeholder="john@acme.com" />
            </div>
            <div className="md:col-span-2">
              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Password</p>
                  <p className="mt-1 text-xs text-gray-500">••••••••</p>
                </div>
                <button onClick={() => setShowPasswordModal(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Change Password
                </button>
              </div>
            </div>
            <div className="md:col-span-2">
              <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Two-Factor Authentication</p>
                  <p className="mt-1 text-xs text-gray-500">Add an extra layer of security</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">{twoFactorEnabled ? "Enabled" : "Disabled"}</span>
                  <button
                    onClick={() => { setTwoFactorEnabled(!twoFactorEnabled); saveAccount(); }}
                    className={`relative h-6 w-11 rounded-full transition ${twoFactorEnabled ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}
                  >
                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${twoFactorEnabled ? "right-1" : "left-1"}`} />
                  </button>
                </div>
              </div>
            </div>
            <div className="md:col-span-2 grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <p className="text-xs text-gray-500">Account Created</p>
                <p className="mt-1 font-medium text-gray-900 dark:text-white">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Unknown"}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <p className="text-xs text-gray-500">Last Login</p>
                <p className="mt-1 font-medium text-gray-900 dark:text-white">{user?.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <p className="text-xs text-gray-500">Email Verified</p>
                <p className="mt-1 font-medium text-gray-900 dark:text-white">{user?.emailVerified ? "✅ Yes" : "❌ No"}</p>
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end border-t border-gray-100 pt-6 dark:border-gray-800">
            <button onClick={saveAccount} disabled={accountSaving} className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
              {accountSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {accountSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {section === "team" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">Team Members</h3>
              <p className="text-sm text-gray-500">{team.filter(m => m.status === "active").length} active members</p>
            </div>
            <button onClick={() => setShowInviteModal(true)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              <UserPlus size={16} /> Add Member
            </button>
          </div>
          <div className="space-y-3">
            {team.map((member) => (
              <div key={member.user_id} className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  <UserRound size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 dark:text-white">{member.full_name}</p>
                  <p className="text-sm text-gray-500">{member.email}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${roleColors[member.role as keyof typeof roleColors]}`}>
                  {roleLabels[member.role as keyof typeof roleLabels]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {section === "billing" && billing && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Crown size={20} className="text-amber-500" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  {billing.plan === "free" ? "Free" : billing.plan === "pro" ? "Pro" : billing.plan === "business" ? "Business" : "Enterprise"}
                </h3>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                  billing.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" :
                  "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                }`}>
                  {billing.status === "active" ? "Active" : billing.status === "past_due" ? "Past Due" : "Canceled"}
                </span>
              </div>
              {billing.current_period_end && (
                <p className="mt-2 text-sm text-gray-600">Period ends: {new Date(billing.current_period_end).toLocaleDateString()}</p>
              )}
            </div>
            {billing.plan !== "enterprise" && (
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                {billing.plan === "free" ? "Upgrade Plan" : "Manage Plan"}
              </button>
            )}
          </div>
        </div>
      )}

      {section === "appearance" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Theme</p>
                <p className="text-sm text-gray-500">System, Light, or Dark mode</p>
              </div>
              <select value={String(stored.appearance?.theme ?? "system")} onChange={(e) => updateStored("appearance", "theme", e.target.value)} className={inputClass() + " w-40"}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Compact Navigation</p>
                <p className="text-sm text-gray-500">Tighter sidebar layout</p>
              </div>
              <button
                onClick={() => updateStored("appearance", "compactNav", !Boolean(stored.appearance?.compactNav ?? false))}
                className={`relative h-6 w-11 rounded-full transition ${Boolean(stored.appearance?.compactNav ?? false) ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}
              >
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${Boolean(stored.appearance?.compactNav ?? false) ? "right-1" : "left-1"}`} />
              </button>
            </div>
          </div>
        </div>
      )}

      {section === "notifications" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Business Activity</p>
                <p className="text-sm text-gray-500">Important business notifications</p>
              </div>
              <button
                onClick={() => updateStored("notifications", "businessActivity", !Boolean(stored.notifications?.businessActivity ?? true))}
                className={`relative h-6 w-11 rounded-full transition ${Boolean(stored.notifications?.businessActivity ?? true) ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}
              >
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${Boolean(stored.notifications?.businessActivity ?? true) ? "right-1" : "left-1"}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Invoice Reminders</p>
                <p className="text-sm text-gray-500">Overdue and upcoming invoice reminders</p>
              </div>
              <button
                onClick={() => updateStored("notifications", "invoiceReminders", !Boolean(stored.notifications?.invoiceReminders ?? true))}
                className={`relative h-6 w-11 rounded-full transition ${Boolean(stored.notifications?.invoiceReminders ?? true) ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}
              >
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${Boolean(stored.notifications?.invoiceReminders ?? true) ? "right-1" : "left-1"}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">AI Task Completion</p>
                <p className="text-sm text-gray-500">When SaMi finishes a background task</p>
              </div>
              <button
                onClick={() => updateStored("notifications", "aiTasks", !Boolean(stored.notifications?.aiTasks ?? true))}
                className={`relative h-6 w-11 rounded-full transition ${Boolean(stored.notifications?.aiTasks ?? true) ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}
              >
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${Boolean(stored.notifications?.aiTasks ?? true) ? "right-1" : "left-1"}`} />
              </button>
            </div>
          </div>
        </div>
      )}

      {section === "security" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <p className="text-xs text-gray-500">Account Name</p>
                <p className="mt-1 font-medium text-gray-900 dark:text-white">{user?.fullName || "Not set"}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <p className="text-xs text-gray-500">Account Email</p>
                <p className="mt-1 font-medium text-gray-900 dark:text-white">{user?.email || "Not set"}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <p className="text-xs text-gray-500">Two-Factor Auth</p>
                <p className="mt-1 font-medium text-gray-900 dark:text-white">{twoFactorEnabled ? "✅ Enabled" : "❌ Disabled"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Confirm Destructive AI Actions</p>
                <p className="text-sm text-gray-500">Ask before deleting or overwriting data</p>
              </div>
              <button
                onClick={() => updateStored("security", "confirmDestructiveAi", !Boolean(stored.security?.confirmDestructiveAi ?? true))}
                className={`relative h-6 w-11 rounded-full transition ${Boolean(stored.security?.confirmDestructiveAi ?? true) ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}
              >
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${Boolean(stored.security?.confirmDestructiveAi ?? true) ? "right-1" : "left-1"}`} />
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setSection("sessions")} className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
              <Monitor size={16} /> Manage Sessions
            </button>
            <button onClick={() => setSection("api-keys")} className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
              <Key size={16} /> API Keys
            </button>
          </div>
        </div>
      )}

      {section === "sessions" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">Active Sessions</h3>
              <p className="text-sm text-gray-500">{sessions.length} active session{sessions.length === 1 ? "" : "s"}</p>
            </div>
            {sessions.filter(s => !s.is_current).length > 0 && (
              <button onClick={revokeAllSessions} className="text-sm text-red-600 hover:text-red-700 dark:text-red-400">Revoke All Other Sessions</button>
            )}
          </div>
          <div className="space-y-3">
            {sessions.map((session) => (
              <div key={session.id} className={`flex items-center gap-4 rounded-lg border p-4 ${session.is_current ? "border-blue-200 bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/20" : "border-gray-200 dark:border-gray-700"}`}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-700">
                  {session.device?.includes("Mobile") ? <Smartphone size={16} /> : session.device?.includes("Tablet") ? <Tablet size={16} /> : <Monitor size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {session.device || "Unknown Device"}
                    {session.is_current && <span className="ml-2 text-xs text-blue-600">(Current)</span>}
                  </p>
                  <p className="text-sm text-gray-500">{session.browser || "Unknown"} • {session.os || "Unknown"} • {session.location || "Unknown"}</p>
                  <p className="text-xs text-gray-400">Last active: {new Date(session.last_active).toLocaleString()}</p>
                </div>
                {!session.is_current && (
                  <button onClick={() => revokeSession(session.id)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600">
                    <LogOut size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-6">
            <button onClick={() => setSection("security")} className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
              <Shield size={16} /> Back to Security
            </button>
          </div>
        </div>
      )}

      {section === "api-keys" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">API Keys</h3>
              <p className="text-sm text-gray-500">{apiKeys.length} key{apiKeys.length === 1 ? "" : "s"}</p>
            </div>
            <button onClick={() => setShowApiKeyModal(true)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              <Plus size={16} /> Create Key
            </button>
          </div>
          {newApiKey && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="mt-0.5 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-amber-800 dark:text-amber-200">Your new API key</p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">Copy this key now. It won't be shown again.</p>
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-white p-3 dark:bg-gray-950">
                    <code className="flex-1 text-sm font-mono text-gray-900 break-all">{newApiKey}</code>
                    <button onClick={() => { navigator.clipboard.writeText(newApiKey); setNotice("Copied!"); }} className="rounded p-2 text-gray-400 hover:text-gray-600">
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
                <button onClick={() => setNewApiKey(null)} className="rounded p-1 text-amber-600 hover:bg-amber-200/50">
                  <X size={16} />
                </button>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {apiKeys.map((key) => (
              <div key={key.id} className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-700">
                  <Key size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 dark:text-white">{key.name}</p>
                  <p className="text-sm text-gray-500">{key.key_preview}</p>
                  <p className="text-xs text-gray-400">Created {new Date(key.created_at).toLocaleDateString()}{key.last_used && ` • Last used ${new Date(key.last_used).toLocaleDateString()}`}</p>
                </div>
                <button onClick={() => deleteApiKey(key.id)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <button onClick={() => setSection("security")} className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
              <Shield size={16} /> Back to Security
            </button>
          </div>
        </div>
      )}

      {section === "data" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">AI Memory</p>
                <p className="text-sm text-gray-500">Remember business context between conversations</p>
              </div>
              <button
                onClick={() => updateStored("data", "aiMemory", !Boolean(stored.data?.aiMemory ?? true))}
                className={`relative h-6 w-11 rounded-full transition ${Boolean(stored.data?.aiMemory ?? true) ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}
              >
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${Boolean(stored.data?.aiMemory ?? true) ? "right-1" : "left-1"}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">AI App Context</p>
                <p className="text-sm text-gray-500">Use data from enabled apps when answering</p>
              </div>
              <button
                onClick={() => updateStored("data", "appContext", !Boolean(stored.data?.appContext ?? true))}
                className={`relative h-6 w-11 rounded-full transition ${Boolean(stored.data?.appContext ?? true) ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}
              >
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${Boolean(stored.data?.appContext ?? true) ? "right-1" : "left-1"}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Activity History</p>
                <p className="text-sm text-gray-500">Keep workspace activity history</p>
              </div>
              <button
                onClick={() => updateStored("data", "activityHistory", !Boolean(stored.data?.activityHistory ?? true))}
                className={`relative h-6 w-11 rounded-full transition ${Boolean(stored.data?.activityHistory ?? true) ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}
              >
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${Boolean(stored.data?.activityHistory ?? true) ? "right-1" : "left-1"}`} />
              </button>
            </div>
          </div>
        </div>
      )}

      {section === "apps" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-6">
            <h3 className="font-medium text-gray-900 dark:text-white">Apps & Modules</h3>
            <p className="text-sm text-gray-500">{enabledApps.length} app{enabledApps.length === 1 ? "" : "s"} enabled</p>
          </div>
          <div className="mb-4">
            <input value={appSearch} onChange={(e) => setAppSearch(e.target.value)} placeholder="Search apps..." className={inputClass() + " max-w-sm"} />
          </div>
          <div className="space-y-6">
            {APP_CATEGORIES.map((category) => {
              const apps = filteredCatalog.filter((app) => app.category === category.key);
              if (!apps.length) return null;
              return (
                <div key={category.key}>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">{category.name}</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    {apps.map((app) => {
                      const enabled = enabledKeys.includes(app.key);
                      return (
                        <button
                          key={app.key}
                          onClick={() => updateApps(enabled ? enabledKeys.filter((k) => k !== app.key) : [...enabledKeys, app.key])}
                          disabled={appsSaving}
                          className={`flex items-center gap-3 rounded-lg border p-4 text-left transition ${enabled ? "border-blue-500 bg-blue-50 dark:border-blue-500/40 dark:bg-blue-950/20" : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"}`}
                        >
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${enabled ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
                            <AppWindow size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{app.name}</p>
                            <p className="text-xs text-gray-500">{app.description}</p>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${enabled ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
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
          <p className="mt-4 text-xs text-gray-400">App changes are saved immediately.</p>
        </div>
      )}

      {section.startsWith("app:") && (() => {
        const appKey = section.slice(4);
        const app = enabledApps.find((item) => item.key === appKey);
        const definition = APP_SETTING_DEFINITIONS[appKey];
        if (!app) return <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900"><p className="text-gray-500">App not enabled.</p></div>;
        if (!definition) return <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900"><p className="text-gray-500">No settings available for this app.</p></div>;
        return (
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
            <h3 className="font-medium text-gray-900 dark:text-white">{definition.label} Settings</h3>
            <p className="mb-6 text-sm text-gray-500">{definition.description}</p>
            <div className="space-y-4">
              {definition.fields.map((field) => {
                const current = stored[appKey]?.[field.key] ?? field.defaultValue;
                return (
                  <div key={field.key} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{field.label}</p>
                      <p className="text-sm text-gray-500">Default for {definition.label}</p>
                    </div>
                    {field.type === "boolean" ? (
                      <button
                        onClick={() => updateStored(appKey, field.key, !Boolean(current))}
                        className={`relative h-6 w-11 rounded-full transition ${Boolean(current) ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}
                      >
                        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${Boolean(current) ? "right-1" : "left-1"}`} />
                      </button>
                    ) : field.type === "select" ? (
                      <select value={String(current)} onChange={(e) => updateStored(appKey, field.key, e.target.value)} className={inputClass() + " w-48"}>
                        {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        type={field.type}
                        value={String(current)}
                        onChange={(e) => updateStored(appKey, field.key, field.type === "number" ? Number(e.target.value) : e.target.value)}
                        className={inputClass() + " w-48"}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Modals */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 dark:bg-gray-900">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Add Team Member</h3>
              <button onClick={() => setShowInviteModal(false)} className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
                <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className={inputClass()} placeholder="colleague@company.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "admin" | "manager" | "member")} className={inputClass()}>
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="member">Member</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button onClick={() => setShowInviteModal(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700">Cancel</button>
                <button onClick={inviteTeamMember} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  <Send size={16} /> Add Member
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showApiKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 dark:bg-gray-900">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Create API Key</h3>
              <button onClick={() => setShowApiKeyModal(false)} className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Key Name</label>
                <input value={apiKeyName} onChange={(e) => setApiKeyName(e.target.value)} className={inputClass()} placeholder="Production Key" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Permissions</label>
                <div className="space-y-2 mt-2">
                  {["read", "write", "admin"].map((perm) => (
                    <label key={perm} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={apiKeyPermissions.includes(perm)} onChange={(e) => {
                        if (e.target.checked) setApiKeyPermissions([...apiKeyPermissions, perm]);
                        else setApiKeyPermissions(apiKeyPermissions.filter(p => p !== perm));
                      }} className="rounded border-gray-300 text-blue-600" />
                      <span className="capitalize">{perm}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button onClick={() => setShowApiKeyModal(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button onClick={createApiKey} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  <Key size={16} /> Create Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 dark:bg-gray-900">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Change Password</h3>
              <button onClick={() => setShowPasswordModal(false)} className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Current Password</label>
                <input type={showPassword ? "text" : "password"} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputClass()} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">New Password</label>
                <input type={showPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass()} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm Password</label>
                <input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass()} />
              </div>
              <button onClick={() => setShowPassword(!showPassword)} className="text-sm text-gray-500 hover:text-gray-700">
                {showPassword ? "Hide" : "Show"} passwords
              </button>
              <div className="flex justify-end gap-3 pt-4">
                <button onClick={() => setShowPasswordModal(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button onClick={saveAccount} disabled={accountSaving} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
                  {accountSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Update Password
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}