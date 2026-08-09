"use client";

import {
  AppWindow,
  BellRing,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
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
  Globe,
  Clock,
  MapPin,
  Mail,
  Phone,
  Link,
  FileText,
  Key,
  Fingerprint,
  Monitor,
  Smartphone,
  Tablet,
  MoreHorizontal,
  Edit,
  Plus,
  UserPlus,
  Crown,
  Sparkles,
  Download,
  AlertCircle,
  CheckCircle,
  Clock as ClockIcon,
  Calendar,
  DollarSign,
  TrendingUp,
  Activity,
  Zap,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  RefreshCw,
  Copy,
  CheckCheck,
  Send,
  Inbox,
  MessageSquare,
  Megaphone,
  Gift,
  Star,
  Award,
  ShieldCheck,
  BadgeCheck,
} from "lucide-react";
import { ChangeEvent, type ReactNode, useEffect, useMemo, useState, useRef } from "react";
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
  logo: string | null;
  status: string;
  type: string | null;
  country: string | null;
  currency: string | null;
  timezone: string | null;
  taxId: string | null;
  registrationNumber: string | null;
  website: string | null;
  address: string | null;
  industry: string | null;
  foundedYear: number | null;
  employeeCount: number | null;
};

type TeamMember = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: "owner" | "admin" | "manager" | "member";
  permissions: string[];
  avatar: string | null;
  status: "active" | "invited" | "suspended";
  joinedAt: string;
  lastActiveAt: string | null;
};

type BillingInfo = {
  plan: "free" | "pro" | "business" | "enterprise";
  status: "active" | "past_due" | "canceled" | "trialing";
  subscriptionId: string | null;
  currentPeriodEnd: string | null;
  usage: {
    users: number;
    storage: number;
    apiCalls: number;
    limit: {
      users: number;
      storage: number;
      apiCalls: number;
    };
  };
  paymentMethods: {
    id: string;
    type: "card" | "bank";
    last4: string;
    brand: string;
    expiryMonth: number;
    expiryYear: number;
    isDefault: boolean;
  }[];
  invoices: {
    id: string;
    amount: number;
    currency: string;
    status: "paid" | "pending" | "failed";
    date: string;
    downloadUrl: string;
  }[];
};

type LoginSession = {
  id: string;
  device: string;
  browser: string;
  os: string;
  ip: string;
  location: string;
  lastActive: string;
  createdAt: string;
  isCurrent: boolean;
};

type ApiKey = {
  id: string;
  name: string;
  key: string;
  permissions: string[];
  lastUsed: string | null;
  createdAt: string;
  expiresAt: string | null;
};

type SettingsResponse = {
  success: boolean;
  user?: UserSettings;
  business?: BusinessSettings;
  settings?: Record<string, Record<string, unknown>>;
  appKeys?: string[];
  apps?: SamiApp[];
  team?: TeamMember[];
  billing?: BillingInfo;
  sessions?: LoginSession[];
  apiKeys?: ApiKey[];
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
      { key: "chartOfAccounts", label: "Chart of accounts template", type: "select", options: ["Standard", "Retail", "Manufacturing", "Non-Profit"], defaultValue: "Standard" },
    ],
  },
  invoicing: {
    label: "Invoicing",
    description: "Invoice numbering, payment and tax defaults.",
    fields: [
      { key: "invoicePrefix", label: "Invoice prefix", type: "text", defaultValue: "INV-" },
      { key: "defaultDueDays", label: "Default payment terms (days)", type: "number", defaultValue: 30 },
      { key: "taxEnabled", label: "Enable tax on new invoices", type: "boolean", defaultValue: true },
      { key: "taxRate", label: "Default tax rate (%)", type: "number", defaultValue: 16 },
      { key: "invoiceFooter", label: "Invoice footer text", type: "textarea", defaultValue: "Thank you for your business." },
    ],
  },
  expenses: {
    label: "Expenses",
    description: "Control how expenses are recorded and approved.",
    fields: [
      { key: "approvalRequired", label: "Require expense approval", type: "boolean", defaultValue: false },
      { key: "defaultCategory", label: "Default expense category", type: "text", defaultValue: "General" },
      { key: "receiptRequired", label: "Require receipt attachment", type: "boolean", defaultValue: false },
      { key: "maxAmount", label: "Maximum expense amount (without approval)", type: "number", defaultValue: 1000 },
    ],
  },
  crm: {
    label: "CRM",
    description: "Customer and lead-management defaults.",
    fields: [
      { key: "defaultPipeline", label: "Default pipeline", type: "select", options: ["Sales", "Support", "Onboarding"], defaultValue: "Sales" },
      { key: "leadFollowUpDays", label: "Lead follow-up reminder (days)", type: "number", defaultValue: 3 },
      { key: "autoCreateCustomer", label: "Create customer from won lead", type: "boolean", defaultValue: true },
      { key: "defaultStage", label: "Default lead stage", type: "select", options: ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Closed"], defaultValue: "New" },
    ],
  },
  inventory: {
    label: "Inventory",
    description: "Stock and warehouse defaults.",
    fields: [
      { key: "lowStockThreshold", label: "Low-stock threshold", type: "number", defaultValue: 5 },
      { key: "valuationMethod", label: "Inventory valuation", type: "select", options: ["FIFO", "Average Cost", "LIFO"], defaultValue: "FIFO" },
      { key: "allowNegativeStock", label: "Allow negative stock", type: "boolean", defaultValue: false },
      { key: "defaultWarehouse", label: "Default warehouse", type: "text", defaultValue: "Main" },
    ],
  },
  // ... rest of app definitions
};

// ============================================================================
// SECTION METADATA
// ============================================================================

const sectionMeta: Array<{ key: SectionKey; label: string; description: string; icon: typeof Settings2; badge?: string }> = [
  { key: "general", label: "General", description: "Business identity and workspace basics.", icon: Building2 },
  { key: "account", label: "Account", description: "Personal account settings and security.", icon: UserRound },
  { key: "team", label: "Team", description: "Manage team members and permissions.", icon: Users },
  { key: "billing", label: "Billing", description: "Subscription and payment management.", icon: CreditCard, badge: "Pro" },
  { key: "appearance", label: "Appearance", description: "Theme and interface preferences.", icon: Palette },
  { key: "notifications", label: "Notifications", description: "Choose what SaMi should notify you about.", icon: BellRing },
  { key: "security", label: "Security", description: "Advanced security and access controls.", icon: Shield },
  { key: "data", label: "Data & AI", description: "AI memory, data and workspace behavior.", icon: Database },
  { key: "apps", label: "Apps", description: "Add apps and manage enabled modules.", icon: AppWindow },
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function inputClass() {
  return "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:opacity-50 disabled:cursor-not-allowed";
}

function buttonClass(active = false) {
  return active
    ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800";
}

function normalizeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

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
  "Sole Proprietorship",
  "Partnership",
  "Limited Liability Company (LLC)",
  "Corporation (C-Corp)",
  "Corporation (S-Corp)",
  "Non-Profit",
  "Cooperative",
  "Public Limited Company (PLC)",
  "Private Limited Company (Ltd)",
  "Joint Venture",
  "Trust",
  "Other",
];

const INDUSTRIES = [
  "Technology & Software",
  "Financial Services",
  "Healthcare",
  "Retail",
  "Manufacturing",
  "Education",
  "Construction",
  "Real Estate",
  "Agriculture",
  "Transportation & Logistics",
  "Hospitality & Tourism",
  "Media & Entertainment",
  "Professional Services",
  "Non-Profit",
  "Government",
  "Energy & Utilities",
  "Telecommunications",
  "Other",
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SettingsPanel({ initialSection = "general" }: { initialSection?: string }) {
  // ========================================================================
  // STATE
  // ========================================================================

  const [section, setSection] = useState<SectionKey>(initialSection as SectionKey);
  
  // User & Business
  const [user, setUser] = useState<UserSettings | null>(null);
  const [business, setBusiness] = useState<BusinessSettings | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  
  // Settings
  const [stored, setStored] = useState<Record<string, Record<string, unknown>>>({});
  const [enabledKeys, setEnabledKeys] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<SamiApp[]>(SAMI_APPS);
  
  // Form States
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
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
  const [inviteRole, setInviteRole] = useState<TeamMember["role"]>("member");
  const [apiKeyName, setApiKeyName] = useState("");
  const [apiKeyPermissions, setApiKeyPermissions] = useState<string[]>([]);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ========================================================================
  // EFFECTS
  // ========================================================================

  useEffect(() => setSection(initialSection as SectionKey), [initialSection]);

  // ========================================================================
  // DATA LOADING
  // ========================================================================

  async function load() {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/business/settings", { 
        cache: "no-store", 
        credentials: "include" 
      });
      const data = (await response.json()) as SettingsResponse;
      
      if (!response.ok || !data.success || !data.business) {
        throw new Error(data.error || "Could not load settings.");
      }

      setUser(data.user ?? null);
      setBusiness(data.business);
      setStored(data.settings ?? {});
      setEnabledKeys(data.appKeys ?? []);
      setCatalog(data.apps?.length ? data.apps : SAMI_APPS);
      setTeam(data.team ?? []);
      setBilling(data.billing ?? null);
      setSessions(data.sessions ?? []);
      setApiKeys(data.apiKeys ?? []);
      
      // Populate business form
      setName(data.business.name || "");
      setSlug(data.business.slug || "");
      setEmail(data.business.email || "");
      setPhone(data.business.phone || "");
      setLogo(data.business.logo || null);
      setBusinessType(data.business.type || "");
      setCountry(data.business.country || "");
      setCurrency(data.business.currency || "KES");
      setTimezone(data.business.timezone || "Africa/Nairobi");
      setTaxId(data.business.taxId || "");
      setRegistrationNumber(data.business.registrationNumber || "");
      setWebsite(data.business.website || "");
      setAddress(data.business.address || "");
      setIndustry(data.business.industry || "");
      setFoundedYear(data.business.foundedYear || null);
      setEmployeeCount(data.business.employeeCount || null);
      
      // Populate account form
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

  // ========================================================================
  // BUSINESS PROFILE OPERATIONS
  // ========================================================================

  async function saveGeneral() {
    try {
      setGeneralSaving(true);
      setError("");
      setNotice("");
      
      const response = await fetch("/api/business/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          name, slug, email, phone, logo,
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
        throw new Error(data.error || "Could not save business profile.");
      }
      
      setBusiness(data.business);
      setNotice("Business profile updated successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save business profile.");
    } finally {
      setGeneralSaving(false);
    }
  }

  function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setNotice("");
    
    if (!file.type.startsWith("image/")) {
      return setError("Please select an image file.");
    }
    if (file.size > MAX_LOGO_BYTES) {
      return setError("Logo must be smaller than 900 KB.");
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setLogo(reader.result);
    };
    reader.onerror = () => setError("Could not read the selected logo.");
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  // ========================================================================
  // ACCOUNT OPERATIONS
  // ========================================================================

  async function saveAccount() {
    try {
      setAccountSaving(true);
      setError("");
      setNotice("");
      
      const payload: any = {
        fullName,
        email: accountEmail,
        twoFactorEnabled,
      };
      
      if (newPassword) {
        if (newPassword !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        if (newPassword.length < 8) {
          throw new Error("Password must be at least 8 characters.");
        }
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }
      
      const response = await fetch("/api/user/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not save account settings.");
      }
      
      setUser(data.user);
      setNotice("Account settings updated successfully.");
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

  async function toggleTwoFactor() {
    try {
      const response = await fetch("/api/user/two-factor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: !twoFactorEnabled }),
      });
      
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not update two-factor authentication.");
      }
      
      setTwoFactorEnabled(data.enabled);
      setNotice(`Two-factor authentication ${data.enabled ? 'enabled' : 'disabled'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update two-factor authentication.");
    }
  }

  // ========================================================================
  // TEAM OPERATIONS
  // ========================================================================

  async function inviteTeamMember() {
    try {
      const response = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not send invitation.");
      }
      
      setTeam([...team, data.member]);
      setShowInviteModal(false);
      setInviteEmail("");
      setNotice(`Invitation sent to ${inviteEmail}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send invitation.");
    }
  }

  async function removeTeamMember(memberId: string) {
    if (!confirm("Are you sure you want to remove this team member?")) return;
    
    try {
      const response = await fetch(`/api/team/${memberId}`, {
        method: "DELETE",
        credentials: "include",
      });
      
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not remove team member.");
      }
      
      setTeam(team.filter(m => m.id !== memberId));
      setNotice("Team member removed successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove team member.");
    }
  }

  async function updateTeamMemberRole(memberId: string, role: TeamMember["role"]) {
    try {
      const response = await fetch(`/api/team/${memberId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role }),
      });
      
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not update role.");
      }
      
      setTeam(team.map(m => m.id === memberId ? { ...m, role } : m));
      setNotice("Role updated successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update role.");
    }
  }

  // ========================================================================
  // SESSION OPERATIONS
  // ========================================================================

  async function revokeSession(sessionId: string) {
    if (!confirm("Are you sure you want to revoke this session?")) return;
    
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: "DELETE",
        credentials: "include",
      });
      
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not revoke session.");
      }
      
      setSessions(sessions.filter(s => s.id !== sessionId));
      setNotice("Session revoked successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke session.");
    }
  }

  async function revokeAllSessions() {
    if (!confirm("This will log out all devices. Continue?")) return;
    
    try {
      const response = await fetch("/api/sessions/revoke-all", {
        method: "POST",
        credentials: "include",
      });
      
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not revoke all sessions.");
      }
      
      setSessions(sessions.filter(s => s.isCurrent));
      setNotice("All other sessions revoked successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke all sessions.");
    }
  }

  // ========================================================================
  // API KEY OPERATIONS
  // ========================================================================

  async function createApiKey() {
    try {
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          name: apiKeyName, 
          permissions: apiKeyPermissions,
        }),
      });
      
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not create API key.");
      }
      
      setApiKeys([...apiKeys, data.apiKey]);
      setNewApiKey(data.apiKey.key);
      setShowApiKeyModal(false);
      setApiKeyName("");
      setApiKeyPermissions([]);
      
      // Show the key once
      setTimeout(() => setNewApiKey(null), 30000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create API key.");
    }
  }

  async function deleteApiKey(keyId: string) {
    if (!confirm("Are you sure you want to delete this API key?")) return;
    
    try {
      const response = await fetch(`/api/api-keys/${keyId}`, {
        method: "DELETE",
        credentials: "include",
      });
      
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not delete API key.");
      }
      
      setApiKeys(apiKeys.filter(k => k.id !== keyId));
      setNotice("API key deleted successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete API key.");
    }
  }

  // ========================================================================
  // APP OPERATIONS
  // ========================================================================

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
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not update apps.");
      }
      
      setEnabledKeys(data.appKeys ?? nextKeys);
      setNotice("Apps updated successfully.");
      window.dispatchEvent(new CustomEvent("sami:apps-updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update apps.");
    } finally {
      setAppsSaving(false);
    }
  }

  // ========================================================================
  // SETTINGS OPERATIONS
  // ========================================================================

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
        body: JSON.stringify({ 
          section: sectionKey, 
          settings: stored[sectionKey] ?? {} 
        }),
      });
      
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not save settings.");
      }
      
      setStored(data.settings ?? stored);
      const label = sectionMeta.find((item) => item.key === sectionKey)?.label ?? sectionKey;
      setNotice(`${label} settings updated.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setSavingSection("");
    }
  }

  // ========================================================================
  // DERIVED STATE
  // ========================================================================

  const enabledApps = useMemo(
    () => catalog.filter((app) => enabledKeys.includes(app.key)),
    [catalog, enabledKeys]
  );

  const filteredCatalog = useMemo(() => {
    const q = appSearch.trim().toLowerCase();
    return catalog.filter((app) => !q || `${app.name} ${app.description}`.toLowerCase().includes(q));
  }, [catalog, appSearch]);

  const appSpecificSections = enabledApps.filter((app) => APP_SETTING_DEFINITIONS[app.key]);

  const planLabels = {
    free: "Free",
    pro: "Pro",
    business: "Business",
    enterprise: "Enterprise",
  };

  const planColors = {
    free: "text-slate-500 bg-slate-100 dark:bg-slate-800",
    pro: "text-blue-600 bg-blue-100 dark:bg-blue-950",
    business: "text-purple-600 bg-purple-100 dark:bg-purple-950",
    enterprise: "text-amber-600 bg-amber-100 dark:bg-amber-950",
  };

  const roleLabels = {
    owner: "Owner",
    admin: "Admin",
    manager: "Manager",
    member: "Member",
  };

  const roleColors = {
    owner: "text-amber-600 bg-amber-100 dark:bg-amber-950",
    admin: "text-red-600 bg-red-100 dark:bg-red-950",
    manager: "text-blue-600 bg-blue-100 dark:bg-blue-950",
    member: "text-slate-600 bg-slate-100 dark:bg-slate-800",
  };

  // ========================================================================
  // LOADING STATE
  // ========================================================================

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        <Loader2 size={24} className="mr-3 animate-spin" />
        Loading workspace settings...
      </div>
    );
  }

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
          Workspace Control Center
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950 dark:text-white sm:text-3xl">
          Settings
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Every setting is separate. App settings only appear for apps actually enabled in this workspace.
        </p>
      </div>

      {/* Error / Notice */}
      {(error || notice) && (
        <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
          error
            ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
            : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
        }`}>
          <span>{error || notice}</span>
          <button 
            onClick={() => { setError(""); setNotice(""); }} 
            className="rounded-lg p-1 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Layout */}
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Sidebar */}
        <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="px-3 pb-2 pt-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Workspace</p>
          </div>
          
          <nav className="space-y-1">
            {sectionMeta.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  onClick={() => setSection(item.key)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${buttonClass(section === item.key)}`}
                >
                  <Icon size={17} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="block">{item.label}</span>
                      {item.badge && (
                        <span className={`rounded-full px-2 py-0.5 text-[8px] font-bold uppercase ${planColors[item.badge as keyof typeof planColors] || "bg-slate-100 text-slate-600"}`}>
                          {item.badge}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] opacity-60">{item.description}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          {/* App-specific sections */}
          {appSpecificSections.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Enabled App Settings
              </p>
              <div className="space-y-1">
                {appSpecificSections.map((app) => (
                  <button
                    key={app.key}
                    onClick={() => setSection(`app:${app.key}`)}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm ${buttonClass(section === `app:${app.key}`)}`}
                  >
                    <Settings2 size={15} />
                    <span className="truncate">{app.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="min-w-0">
          {/* ============================================================== */}
          {/* GENERAL SECTION */}
          {/* ============================================================== */}
          {section === "general" && (
            <Section title="Business Profile" description="Core identity details used across SaMi.">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
                  {logo ? <img src={logo} alt="Business logo" className="h-full w-full object-contain" /> : <Building2 size={30} className="text-slate-400" />}
                </div>
                <div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500">
                    <ImagePlus size={16} /> {logo ? "Change logo" : "Add logo"}
                    <input 
                      ref={fileInputRef}
                      type="file" 
                      accept="image/png,image/jpeg,image/webp,image/svg+xml" 
                      onChange={handleLogoChange} 
                      className="hidden" 
                    />
                  </label>
                  {logo && (
                    <button 
                      type="button" 
                      onClick={() => setLogo(null)} 
                      className="ml-2 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Trash2 size={16} /> Remove
                    </button>
                  )}
                  <p className="mt-2 text-xs text-slate-400">PNG, JPG, WEBP or SVG. Maximum 900 KB.</p>
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Business name" value={name} onChange={setName} placeholder="Acme Corp" />
                <Field label="Business slug" value={slug} onChange={(v) => setSlug(normalizeSlug(v))} placeholder="acme-corp" />
                <Field label="Business email" type="email" value={email} onChange={setEmail} placeholder="info@acme.com" />
                <Field label="Phone" value={phone} onChange={setPhone} placeholder="+254 700 000 000" />
                <SelectField label="Business type" value={businessType} options={BUSINESS_TYPES} onChange={setBusinessType} placeholder="Select type" />
                <SelectField label="Industry" value={industry} options={INDUSTRIES} onChange={setIndustry} placeholder="Select industry" />
                <SelectField label="Country" value={country} options={COUNTRIES} onChange={setCountry} placeholder="Select country" />
                <SelectField label="Currency" value={currency} options={CURRENCIES} onChange={setCurrency} />
                <SelectField label="Timezone" value={timezone} options={TIMEZONES} onChange={setTimezone} />
                <Field label="Tax ID / VAT" value={taxId} onChange={setTaxId} placeholder="TAX-123456" />
                <Field label="Registration Number" value={registrationNumber} onChange={setRegistrationNumber} placeholder="REG-123456" />
                <Field label="Website" value={website} onChange={setWebsite} placeholder="https://acme.com" />
                <Field label="Founded Year" type="number" value={foundedYear?.toString() || ""} onChange={(v) => setFoundedYear(v ? parseInt(v) : null)} placeholder="2020" />
                <Field label="Employee Count" type="number" value={employeeCount?.toString() || ""} onChange={(v) => setEmployeeCount(v ? parseInt(v) : null)} placeholder="50" />
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-200">Address</label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className={inputClass()}
                    rows={3}
                    placeholder="123 Business Street, City, Country"
                  />
                </div>
              </div>

              <SaveButton loading={generalSaving} onClick={saveGeneral} label="Save Business Profile" />
            </Section>
          )}

          {/* ============================================================== */}
          {/* ACCOUNT SECTION */}
          {/* ============================================================== */}
          {section === "account" && (
            <Section title="Account Settings" description="Manage your personal account details and security.">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Full Name" value={fullName} onChange={setFullName} placeholder="John Doe" />
                <Field label="Email Address" type="email" value={accountEmail} onChange={setAccountEmail} placeholder="john@acme.com" />
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Password</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">••••••••</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPasswordModal(true)}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Change Password
                    </button>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <SettingRow
                    title="Two-Factor Authentication"
                    description="Add an extra layer of security to your account."
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-slate-600 dark:text-slate-300">
                        {twoFactorEnabled ? "Enabled" : "Disabled"}
                      </span>
                      <Toggle checked={twoFactorEnabled} onChange={toggleTwoFactor} />
                    </div>
                  </SettingRow>
                </div>

                <div className="md:col-span-2">
                  <Info label="Account Created" value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Unknown"} />
                  <Info label="Last Login" value={user?.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"} />
                  <Info label="Email Verified" value={user?.emailVerified ? "Yes" : "No"} />
                </div>
              </div>

              <SaveButton loading={accountSaving} onClick={saveAccount} label="Save Account" />
            </Section>
          )}

          {/* Password Change Modal */}
          {showPasswordModal && (
            <Modal title="Change Password" onClose={() => setShowPasswordModal(false)}>
              <div className="space-y-4">
                <Field
                  label="Current Password"
                  type={showPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  placeholder="Enter current password"
                />
                <Field
                  label="New Password"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder="Enter new password (min 8 characters)"
                />
                <Field
                  label="Confirm New Password"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Confirm new password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  {showPassword ? "Hide" : "Show"} passwords
                </button>
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveAccount}
                    disabled={accountSaving}
                    className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {accountSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Update Password
                  </button>
                </div>
              </div>
            </Modal>
          )}

          {/* ============================================================== */}
          {/* TEAM SECTION */}
          {/* ============================================================== */}
          {section === "team" && (
            <Section 
              title="Team Members" 
              description={`Manage who has access to your workspace. ${team.length} member${team.length === 1 ? "" : "s"}.`}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {team.filter(m => m.status === "active").length} active members
                </div>
                <button
                  type="button"
                  onClick={() => setShowInviteModal(true)}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  <UserPlus size={16} />
                  Invite Member
                </button>
              </div>

              <div className="space-y-3">
                {team.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {member.avatar ? (
                        <img src={member.avatar} alt={member.fullName} className="h-full w-full rounded-full object-cover" />
                      ) : (
                        <UserRound size={20} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 dark:text-white">{member.fullName}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{member.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${roleColors[member.role]}`}>
                        {roleLabels[member.role]}
                      </span>
                      {member.status === "invited" && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          Invited
                        </span>
                      )}
                      {member.status === "suspended" && (
                        <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                          Suspended
                        </span>
                      )}
                      {member.role !== "owner" && (
                        <>
                          <select
                            value={member.role}
                            onChange={(e) => updateTeamMemberRole(member.id, e.target.value as TeamMember["role"])}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                          >
                            <option value="admin">Admin</option>
                            <option value="manager">Manager</option>
                            <option value="member">Member</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => removeTeamMember(member.id)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Invite Modal */}
          {showInviteModal && (
            <Modal title="Invite Team Member" onClose={() => setShowInviteModal(false)}>
              <div className="space-y-4">
                <Field
                  label="Email Address"
                  type="email"
                  value={inviteEmail}
                  onChange={setInviteEmail}
                  placeholder="colleague@company.com"
                />
                <SelectField
                  label="Role"
                  value={inviteRole}
                  options={["admin", "manager", "member"]}
                  onChange={(v) => setInviteRole(v as TeamMember["role"])}
                />
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={inviteTeamMember}
                    className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <Send size={16} />
                    Send Invitation
                  </button>
                </div>
              </div>
            </Modal>
          )}

          {/* ============================================================== */}
          {/* BILLING SECTION */}
          {/* ============================================================== */}
          {section === "billing" && (
            <Section title="Billing & Subscription" description="Manage your plan, billing details, and invoices.">
              {billing && (
                <>
                  {/* Current Plan */}
                  <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-6 dark:border-slate-800 dark:from-blue-950/20 dark:to-indigo-950/20">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Crown size={20} className="text-amber-500" />
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                            {planLabels[billing.plan]}
                          </h3>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${billing.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>
                            {billing.status === "active" ? "Active" : billing.status === "past_due" ? "Past Due" : billing.status === "trialing" ? "Trialing" : "Canceled"}
                          </span>
                        </div>
                        {billing.currentPeriodEnd && (
                          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                            Current period ends: {new Date(billing.currentPeriodEnd).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      {billing.plan !== "enterprise" && (
                        <button className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
                          {billing.plan === "free" ? "Upgrade Plan" : "Manage Plan"}
                        </button>
                      )}
                    </div>

                    {/* Usage */}
                    <div className="mt-6 grid gap-4 sm:grid-cols-3">
                      <UsageCard
                        label="Users"
                        current={billing.usage.users}
                        limit={billing.usage.limit.users}
                        icon={<Users size={16} />}
                      />
                      <UsageCard
                        label="Storage"
                        current={billing.usage.storage}
                        limit={billing.usage.limit.storage}
                        unit="GB"
                        icon={<Database size={16} />}
                      />
                      <UsageCard
                        label="API Calls"
                        current={billing.usage.apiCalls}
                        limit={billing.usage.limit.apiCalls}
                        unit="k"
                        icon={<Activity size={16} />}
                      />
                    </div>
                  </div>

                  {/* Payment Methods */}
                  <div>
                    <h4 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Payment Methods</h4>
                    <div className="space-y-2">
                      {billing.paymentMethods.map((method) => (
                        <div key={method.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                            <CreditCard size={18} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                              {method.brand} •••• {method.last4}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Expires {method.expiryMonth}/{method.expiryYear}
                            </p>
                          </div>
                          {method.isDefault && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                              Default
                            </span>
                          )}
                        </div>
                      ))}
                      <button className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-3 text-sm font-medium text-slate-600 hover:border-blue-500 hover:text-blue-600 dark:border-slate-700 dark:text-slate-300">
                        <Plus size={16} />
                        Add Payment Method
                      </button>
                    </div>
                  </div>

                  {/* Invoices */}
                  <div>
                    <h4 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Recent Invoices</h4>
                    <div className="space-y-2">
                      {billing.invoices.map((invoice) => (
                        <div key={invoice.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                            <FileText size={18} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                              Invoice #{invoice.id.slice(0, 8)}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {new Date(invoice.date).toLocaleDateString()}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">
                            {invoice.currency} {invoice.amount.toFixed(2)}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            invoice.status === "paid" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" :
                            invoice.status === "pending" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" :
                            "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          }`}>
                            {invoice.status}
                          </span>
                          <button className="rounded-lg p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                            <Download size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </Section>
          )}

          {/* ============================================================== */}
          {/* APPEARANCE SECTION */}
          {/* ============================================================== */}
          {section === "appearance" && (
            <Section title="Appearance" description="Interface preferences are independent settings, not business profile data.">
              <SettingRow title="Theme" description="Choose the theme used by the SaMi workspace.">
                <Select value={String(stored.appearance?.theme ?? "system")} options={["system", "light", "dark"]} onChange={(v) => updateStored("appearance", "theme", v)} />
              </SettingRow>
              <SettingRow title="Compact Navigation" description="Use a tighter sidebar when you need more workspace room.">
                <Toggle checked={Boolean(stored.appearance?.compactNav ?? false)} onChange={(v) => updateStored("appearance", "compactNav", v)} />
              </SettingRow>
              <SettingRow title="Animations" description="Enable UI animations and transitions.">
                <Toggle checked={Boolean(stored.appearance?.animations ?? true)} onChange={(v) => updateStored("appearance", "animations", v)} />
              </SettingRow>
              <SaveButton loading={savingSection === "appearance"} onClick={() => saveSection("appearance")} label="Save Appearance" />
            </Section>
          )}

          {/* ============================================================== */}
          {/* NOTIFICATIONS SECTION */}
          {/* ============================================================== */}
          {section === "notifications" && (
            <Section title="Notifications" description="Control the notifications generated by your workspace.">
              <SettingRow title="Business Activity" description="Notify you about important business activity.">
                <Toggle checked={Boolean(stored.notifications?.businessActivity ?? true)} onChange={(v) => updateStored("notifications", "businessActivity", v)} />
              </SettingRow>
              <SettingRow title="Invoice Reminders" description="Receive reminders about overdue or upcoming invoice payments.">
                <Toggle checked={Boolean(stored.notifications?.invoiceReminders ?? true)} onChange={(v) => updateStored("notifications", "invoiceReminders", v)} />
              </SettingRow>
              <SettingRow title="AI Task Completion" description="Notify you when SaMi finishes a background task.">
                <Toggle checked={Boolean(stored.notifications?.aiTasks ?? true)} onChange={(v) => updateStored("notifications", "aiTasks", v)} />
              </SettingRow>
              <SettingRow title="Team Activity" description="Get notified when team members perform actions.">
                <Toggle checked={Boolean(stored.notifications?.teamActivity ?? true)} onChange={(v) => updateStored("notifications", "teamActivity", v)} />
              </SettingRow>
              <SettingRow title="System Updates" description="Receive notifications about system maintenance and updates.">
                <Toggle checked={Boolean(stored.notifications?.systemUpdates ?? true)} onChange={(v) => updateStored("notifications", "systemUpdates", v)} />
              </SettingRow>
              <SaveButton loading={savingSection === "notifications"} onClick={() => saveSection("notifications")} label="Save Notifications" />
            </Section>
          )}

          {/* ============================================================== */}
          {/* SECURITY SECTION */}
          {/* ============================================================== */}
          {section === "security" && (
            <Section title="Security" description="Advanced security settings and access controls.">
              <div className="grid gap-4 md:grid-cols-2">
                <Info label="Account Name" value={user?.fullName || "Not set"} />
                <Info label="Account Email" value={user?.email || "Not set"} />
                <Info label="Business Status" value={business?.status || "Unknown"} />
                <Info label="Two-Factor Authentication" value={twoFactorEnabled ? "Enabled ✅" : "Disabled ❌"} />
              </div>

              <SettingRow title="Confirm Destructive AI Actions" description="SaMi should ask before performing actions that can delete or overwrite business data.">
                <Toggle checked={Boolean(stored.security?.confirmDestructiveAi ?? true)} onChange={(v) => updateStored("security", "confirmDestructiveAi", v)} />
              </SettingRow>

              <SettingRow title="Session Timeout" description="Automatically log out after period of inactivity.">
                <Select 
                  value={String(stored.security?.sessionTimeout ?? "30min")} 
                  options={["15min", "30min", "1hr", "2hr", "4hr", "never"]} 
                  onChange={(v) => updateStored("security", "sessionTimeout", v)} 
                />
              </SettingRow>

              <SettingRow title="IP Whitelisting" description="Restrict access to specific IP addresses.">
                <Toggle checked={Boolean(stored.security?.ipWhitelisting ?? false)} onChange={(v) => updateStored("security", "ipWhitelisting", v)} />
              </SettingRow>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setSection("sessions")}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <Monitor size={16} />
                  Manage Sessions
                </button>
                <button
                  type="button"
                  onClick={() => setSection("api-keys")}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <Key size={16} />
                  API Keys
                </button>
              </div>

              <SaveButton loading={savingSection === "security"} onClick={() => saveSection("security")} label="Save Security Settings" />
            </Section>
          )}

          {/* ============================================================== */}
          {/* SESSIONS SUB-SECTION */}
          {/* ============================================================== */}
          {section === "sessions" && (
            <Section title="Login Sessions" description="View and manage your active sessions across all devices.">
              <div className="flex justify-between items-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {sessions.length} active session{sessions.length === 1 ? "" : "s"}
                </p>
                {sessions.filter(s => !s.isCurrent).length > 0 && (
                  <button
                    type="button"
                    onClick={revokeAllSessions}
                    className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  >
                    Revoke All Other Sessions
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`flex items-center gap-4 rounded-2xl border p-4 ${
                      session.isCurrent 
                        ? "border-blue-200 bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/20" 
                        : "border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/50"
                    }`}
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-200 dark:bg-slate-700">
                      {session.device.includes("Mobile") ? <Smartphone size={20} /> :
                       session.device.includes("Tablet") ? <Tablet size={20} /> :
                       <Monitor size={20} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {session.device}
                        {session.isCurrent && (
                          <span className="ml-2 text-xs font-medium text-blue-600 dark:text-blue-400">(Current)</span>
                        )}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {session.browser} • {session.os} • {session.location}
                      </p>
                      <p className="text-xs text-slate-400">
                        IP: {session.ip} • Last active: {new Date(session.lastActive).toLocaleString()}
                      </p>
                    </div>
                    {!session.isCurrent && (
                      <button
                        type="button"
                        onClick={() => revokeSession(session.id)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20"
                      >
                        <LogOut size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-start pt-2">
                <button
                  type="button"
                  onClick={() => setSection("security")}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <Shield size={16} />
                  Back to Security
                </button>
              </div>
            </Section>
          )}

          {/* ============================================================== */}
          {/* API KEYS SUB-SECTION */}
          {/* ============================================================== */}
          {section === "api-keys" && (
            <Section title="API Keys" description="Manage API access tokens for programmatic access to SaMi.">
              <div className="flex justify-between items-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {apiKeys.length} API key{apiKeys.length === 1 ? "" : "s"}
                </p>
                <button
                  type="button"
                  onClick={() => setShowApiKeyModal(true)}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  <Plus size={16} />
                  Create API Key
                </button>
              </div>

              {newApiKey && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={18} className="mt-0.5 text-amber-600 dark:text-amber-400" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-amber-800 dark:text-amber-200">Your new API key</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        Copy this key now. It won't be shown again.
                      </p>
                      <div className="mt-2 flex items-center gap-2 rounded-xl bg-white p-3 dark:bg-slate-950">
                        <code className="flex-1 text-sm font-mono text-slate-900 dark:text-white">{newApiKey}</code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(newApiKey);
                            setNotice("API key copied to clipboard.");
                          }}
                          className="rounded-lg p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                          <Copy size={16} />
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewApiKey(null)}
                      className="rounded-lg p-1 text-amber-600 hover:bg-amber-200/50 dark:text-amber-400"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-200 dark:bg-slate-700">
                      <Key size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 dark:text-white">{key.name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Created {new Date(key.createdAt).toLocaleDateString()}
                        {key.lastUsed && ` • Last used ${new Date(key.lastUsed).toLocaleDateString()}`}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {key.permissions.map((perm) => (
                          <span key={perm} className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium dark:bg-slate-800">
                            {perm}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteApiKey(key.id)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex justify-start pt-2">
                <button
                  type="button"
                  onClick={() => setSection("security")}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <Shield size={16} />
                  Back to Security
                </button>
              </div>
            </Section>
          )}

          {/* Create API Key Modal */}
          {showApiKeyModal && (
            <Modal title="Create API Key" onClose={() => setShowApiKeyModal(false)}>
              <div className="space-y-4">
                <Field
                  label="Key Name"
                  value={apiKeyName}
                  onChange={setApiKeyName}
                  placeholder="Production API Key"
                />
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-200">Permissions</label>
                  <div className="space-y-2">
                    {["read", "write", "admin"].map((perm) => (
                      <label key={perm} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={apiKeyPermissions.includes(perm)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setApiKeyPermissions([...apiKeyPermissions, perm]);
                            } else {
                              setApiKeyPermissions(apiKeyPermissions.filter(p => p !== perm));
                            }
                          }}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="capitalize">{perm}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowApiKeyModal(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={createApiKey}
                    className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <Key size={16} />
                    Create Key
                  </button>
                </div>
              </div>
            </Modal>
          )}

          {/* ============================================================== */}
          {/* DATA SECTION */}
          {/* ============================================================== */}
          {section === "data" && (
            <Section title="Data & AI" description="Control how SaMi uses workspace data and AI memory.">
              <SettingRow title="AI Memory" description="Allow SaMi to remember useful business context between conversations.">
                <Toggle checked={Boolean(stored.data?.aiMemory ?? true)} onChange={(v) => updateStored("data", "aiMemory", v)} />
              </SettingRow>
              <SettingRow title="Use Enabled Apps as AI Context" description="Let SaMi use data from your enabled business apps when answering questions.">
                <Toggle checked={Boolean(stored.data?.appContext ?? true)} onChange={(v) => updateStored("data", "appContext", v)} />
              </SettingRow>
              <SettingRow title="Activity History" description="Keep workspace activity history available for review.">
                <Toggle checked={Boolean(stored.data?.activityHistory ?? true)} onChange={(v) => updateStored("data", "activityHistory", v)} />
              </SettingRow>
              <SettingRow title="AI Training Data" description="Allow SaMi to use anonymized data to improve AI models.">
                <Toggle checked={Boolean(stored.data?.aiTraining ?? false)} onChange={(v) => updateStored("data", "aiTraining", v)} />
              </SettingRow>
              <SettingRow title="Data Retention Period" description="How long to keep historical data before automatic cleanup.">
                <Select 
                  value={String(stored.data?.retentionPeriod ?? "1year")} 
                  options={["3months", "6months", "1year", "2years", "forever"]} 
                  onChange={(v) => updateStored("data", "retentionPeriod", v)} 
                />
              </SettingRow>
              <SaveButton loading={savingSection === "data"} onClick={() => saveSection("data")} label="Save Data & AI Settings" />
            </Section>
          )}

          {/* ============================================================== */}
          {/* APPS SECTION */}
          {/* ============================================================== */}
          {section === "apps" && (
            <Section 
              title="Apps & Modules" 
              description={`Real workspace app selection. ${enabledApps.length} app${enabledApps.length === 1 ? "" : "s"} currently enabled.`}
            >
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={appSearch}
                  onChange={(e) => setAppSearch(e.target.value)}
                  placeholder="Search apps..."
                  className={inputClass()}
                />
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

              <p className="text-xs text-slate-400">
                App changes are saved immediately. Enable or disable apps to customize your workspace.
              </p>
            </Section>
          )}

          {/* ============================================================== */}
          {/* APP-SPECIFIC SECTIONS */}
          {/* ============================================================== */}
          {section.startsWith("app:") && (() => {
            const appKey = section.slice(4);
            const app = enabledApps.find((item) => item.key === appKey);
            const definition = APP_SETTING_DEFINITIONS[appKey];
            
            if (!app) {
              return (
                <Section title="App Unavailable" description="This app is no longer enabled in this workspace.">
                  <button onClick={() => setSection("apps")} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">
                    Manage Apps
                  </button>
                </Section>
              );
            }
            
            if (!definition) {
              return (
                <Section title={`${app.name} Settings`} description="This app is enabled, but has no extra settings registered yet.">
                  <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
                    The app is connected to the workspace. App-specific controls will appear here as its business features are implemented.
                  </div>
                </Section>
              );
            }

            return (
              <Section title={`${definition.label} Settings`} description={definition.description}>
                {definition.fields.map((field) => {
                  const current = stored[appKey]?.[field.key] ?? field.defaultValue;
                  
                  return (
                    <SettingRow key={field.key} title={field.label} description={`Default for ${definition.label}.`}>
                      {field.type === "boolean" ? (
                        <Toggle checked={Boolean(current)} onChange={(v) => updateStored(appKey, field.key, v)} />
                      ) : field.type === "select" ? (
                        <Select value={String(current)} options={field.options ?? []} onChange={(v) => updateStored(appKey, field.key, v)} />
                      ) : field.type === "textarea" ? (
                        <textarea
                          value={String(current)}
                          onChange={(e) => updateStored(appKey, field.key, e.target.value)}
                          className={`${inputClass()} max-w-xs`}
                          rows={3}
                        />
                      ) : (
                        <input
                          type={field.type}
                          value={String(current)}
                          onChange={(e) => updateStored(appKey, field.key, field.type === "number" ? Number(e.target.value) : e.target.value)}
                          className={`${inputClass()} max-w-xs`}
                        />
                      )}
                    </SettingRow>
                  );
                })}
                <SaveButton loading={savingSection === appKey} onClick={() => saveSection(appKey)} label={`Save ${definition.label} Settings`} />
              </Section>
            );
          })()}
        </main>
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

// Section Container
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

// Setting Row
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

// Field Input
function Field({ label, value, onChange, type = "text", placeholder = "" }: { 
  label: string; 
  value: string; 
  onChange: (value: string) => void; 
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass()}
      />
    </label>
  );
}

// Select Field
function SelectField({ label, value, options, onChange, placeholder = "" }: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass()}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

// Select Component
function Select({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass()} appearance-none pr-10 min-w-[120px]`}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

// Toggle Switch
function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full transition ${checked ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-6" : "left-1"}`} />
    </button>
  );
}

// Info Display
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

// Save Button
function SaveButton({ loading, onClick, label }: { loading: boolean; onClick: () => void; label: string }) {
  return (
    <div className="flex justify-end pt-2">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {loading ? "Saving..." : label}
      </button>
    </div>
  );
}

// Usage Card for Billing
function UsageCard({ label, current, limit, unit = "", icon }: {
  label: string;
  current: number;
  limit: number;
  unit?: string;
  icon: ReactNode;
}) {
  const percentage = Math.min((current / limit) * 100, 100);
  const isOverLimit = percentage > 90;
  
  return (
    <div className="rounded-xl bg-white p-3 dark:bg-slate-950/50">
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
        {current}{unit} / {limit}{unit}
      </p>
      <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full rounded-full transition ${isOverLimit ? "bg-red-500" : "bg-blue-500"}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// Modal
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-950 dark:text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}