"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Building2,
  Hash,
  Settings2,
  Calendar,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Download,
    Share2,
  CreditCard,
  Edit,
  FileText,
  Loader2,
  Mail,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings as SettingsIcon,
  Trash2,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react";

/* =========================================================
   TYPES (Matches Database Schema Exactly)
========================================================= */

type InvoiceStatus =
  | "draft"
  | "pending_approval"
  | "sent"
  | "viewed"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled"
  | "void";

type InvoicePage =
  | "invoice-overview"
  | "invoicing"
  | "invoices"
  | "create-invoice"
  | "invoice-customers"
  | "invoice-payments"
  | "invoice-products"
  | "invoice-settings";

type PaymentStatus = "pending" | "completed" | "failed" | "refunded" | "disputed";

interface Customer {
  id: string;
  company_name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  billing_address?: string | null;
  shipping_address?: string | null;
  tax_id?: string | null;
  tax_id_type?: string | null;
  registration_number?: string | null;
  currency?: string | null;
  payment_terms_id?: string | null;
  credit_limit?: number | string | null;
  customer_type?: string | null;
  industry?: string | null;
  status?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

interface Product {
  id: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  unit_price: number | string;
  tax_rate_id?: string | null;
  category?: string | null;
  is_active?: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

interface PaymentTerm {
  id: string;
  name: string;
  description?: string | null;
  due_days: number;
  discount_percentage?: number | string;
  discount_days?: number | null;
  is_default?: boolean;
  is_active?: boolean;
  sort_order?: number;
  created_at: string;
  updated_at: string;
}

interface TaxRate {
  id: string;
  name: string;
  rate: number;
  tax_type: string;
  country?: string | null;
  region?: string | null;
  is_default?: boolean;
  is_active?: boolean;
  sort_order?: number;
  created_at: string;
  updated_at: string;
}

interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id?: string | null;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  discount_type?: string | null;
  discount_value?: number | string;
  discount_amount?: number | string;
  tax_rate: number | string;
  tax_amount: number | string;
  tax_rate_id?: string | null;
  line_total: number | string;
  sort_order?: number;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

interface Payment {
  id: string;
  invoice_id: string;

  // Related invoice information
  invoice_number?: string | null;
  customer?: {
    id?: string;
    company_name?: string | null;
    contact_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;

  amount: number | string;
  currency?: string | null;
  exchange_rate?: number | string;
  payment_method: string;
  payment_method_details?: any;
  transaction_reference?: string | null;
  payment_date: string;
  status: PaymentStatus;
  reconciled?: boolean;
  reconciled_at?: string | null;
  reconciled_by?: string | null;
  notes?: string | null;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_id?: string;
  customer?: Customer;
  issue_date: string;
  due_date?: string | null;
  payment_date?: string | null;
  sent_at?: string | null;
  viewed_at?: string | null;
  approved_at?: string | null;
  status: InvoiceStatus;
  subtotal: number | string;
  discount_type?: string | null;
  discount_value?: number | string;
  discount_amount?: number | string;
  tax_calculation_method?: string | null;
  tax_amount: number | string;
  shipping_cost?: number | string;
  shipping_tax?: number | string;
  total_amount: number | string;
  amount_paid: number | string;
  amount_due: number | string;
  po_number?: string | null;
  currency?: string | null;
  exchange_rate?: number | string;
  payment_terms_id?: string | null;
  payment_terms_display?: string | null;
  template_id?: string | null;
  created_by?: string | null;
  approved_by?: string | null;
  cancelled_by?: string | null;
  cancelled_reason?: string | null;
  reminder_count?: number;
  last_reminder_sent_at?: string | null;
  next_reminder_at?: string | null;
  notes?: string | null;
  internal_notes?: string | null;
  footer_text?: string | null;
  attachments?: any;
  metadata?: any;
  invoice_items?: InvoiceItem[];
  payments?: Payment[];
  created_at: string;
  updated_at: string;
}

interface Stats {
  total_invoices?: number;
  draft_invoices?: number;
  pending_approval_invoices?: number;
  sent_invoices?: number;
  viewed_invoices?: number;
  partially_paid_invoices?: number;
  paid_invoices?: number;
  overdue_invoices?: number;
  cancelled_invoices?: number;
  void_invoices?: number;
  total_invoiced?: number;
  total_collected?: number;
  total_outstanding?: number;
}

interface InvoiceSettings {
  id: string;
  company_name?: string;
  company_logo_url?: string;
  company_address?: string;
  company_email?: string;
  company_phone?: string;
  company_tax_id?: string;
  company_website?: string;
  company_registration_number?: string;
  invoice_prefix: string;
  invoice_next_number: number;
  invoice_number_padding: number;
  invoice_number_format: string;
  credit_note_prefix: string;
  credit_note_next_number: number;
  default_payment_terms_id?: string;
  default_tax_rate_id?: string;
  default_currency: string;
  default_template_id?: string;
  default_due_days: number;
  default_tax_calculation: string;
  payment_instructions?: string;
  bank_details?: any;
  payment_gateways?: any;
  reminder_enabled: boolean;
  reminder_days_before: number;
  reminder_days_after: number;
  reminder_after_days: number;
  reminder_after_days_2: number;
  reminder_grace_period_days: number;
  email_subject_template?: string;
  email_body_template?: string;
  terms_and_conditions?: string;
  auto_send_enabled: boolean;
  auto_pay_enabled: boolean;
  allow_partial_payments: boolean;
  allow_credit_notes: boolean;
  require_approval: boolean;
  created_at: string;
  updated_at: string;
}

interface DraftItem {
  product_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  discount_type: "percentage" | "fixed" | "";
  discount_value: string;
  tax_rate: string;
}

/* =========================================================
   CONSTANTS
========================================================= */

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  sent: "Sent",
  viewed: "Viewed",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
  void: "Void",
};

const CURRENCIES = ["KES", "USD", "EUR", "GBP", "UGX", "TZS", "ZAR"];

const PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "credit_card",
  "debit_card",
  "check",
  "online",
  "other",
];

const PAYMENT_STATUSES: PaymentStatus[] = [
  "pending",
  "completed",
  "failed",
  "refunded",
  "disputed",
];

const EMPTY_ITEM: DraftItem = {
  product_id: "",
  description: "",
  quantity: "1",
  unit_price: "0",
  discount_type: "",
  discount_value: "0",
  tax_rate: "0",
};

/* =========================================================
   HELPERS
========================================================= */

function money(value: number | string | null | undefined, currency: string | null | undefined = "USD") {
  const currencyCode = currency || "USD";
  const numValue = Number(value || 0);
  
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(numValue);
  } catch {
    return `${currencyCode} ${numValue.toFixed(2)}`;
  }
}

function dateText(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(date);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function statusClass(status: InvoiceStatus) {
  switch (status) {
    case "paid":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "partially_paid":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "overdue":
      return "bg-red-500/10 text-red-700 dark:text-red-400";
    case "sent":
    case "viewed":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "pending_approval":
      return "bg-orange-500/10 text-orange-700 dark:text-orange-400";
    case "cancelled":
    case "void":
      return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
    default:
      return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
  }
}

function paymentStatusClass(status: PaymentStatus) {
  switch (status) {
    case "completed":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "pending":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "failed":
      return "bg-red-500/10 text-red-700 dark:text-red-400";
    case "refunded":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "disputed":
      return "bg-orange-500/10 text-orange-700 dark:text-orange-400";
    default:
      return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
  }
}

function displayStatus(invoice: Invoice): InvoiceStatus {
  if (
    invoice.status === "paid" ||
    invoice.status === "cancelled" ||
    invoice.status === "void"
  ) {
    return invoice.status;
  }
  if (invoice.due_date && Number(invoice.amount_due || 0) > 0) {
    const due = new Date(invoice.due_date);
    due.setHours(23, 59, 59, 999);
    if (due < new Date()) {
      return "overdue";
    }
  }
  return invoice.status;
}

function calculateItem(item: DraftItem) {
  const quantity = Number(item.quantity || 0);
  const unitPrice = Number(item.unit_price || 0);
  const gross = quantity * unitPrice;
  const discountValue = Number(item.discount_value || 0);
  let discount = 0;
  if (item.discount_type === "percentage") {
    discount = (gross * discountValue) / 100;
  }
  if (item.discount_type === "fixed") {
    discount = discountValue;
  }
  discount = Math.min(Math.max(discount, 0), gross);
  const taxable = gross - discount;
  const tax = (taxable * Number(item.tax_rate || 0)) / 100;
  return { gross, discount, taxable, tax, total: taxable + tax };
}

/* =========================================================
   UI COMPONENTS
========================================================= */

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof FileText;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-2 text-xl font-bold text-gray-900 dark:text-white">
            {value}
          </p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <Icon size={19} />
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-4 ${
        strong
          ? "text-base font-bold text-gray-900 dark:text-white"
          : "text-sm text-gray-600 dark:text-gray-300"
      }`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-300">
      {children}
    </span>
  );
}

function DetailField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
        {value || "—"}
      </p>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex min-h-[200px] items-center justify-center">
      <Loader2 size={30} className="animate-spin text-blue-500" />
    </div>
  );
}

/* =========================================================
   INVOICE COMPONENTS
========================================================= */
// 1. INVOICE OVERVIEW
function InvoiceOverview({
  onNavigate,
}: {
  onNavigate: (page: InvoicePage) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [upcomingDue, setUpcomingDue] = useState<Invoice[]>([]);

  const extractList = useCallback((data: any): Invoice[] => {
    if (Array.isArray(data)) {
      return data;
    }

    if (Array.isArray(data?.invoices)) {
      return data.invoices;
    }

    if (Array.isArray(data?.data)) {
      return data.data;
    }

    return [];
  }, []);

  const extractStats = useCallback((data: any): Stats | null => {
    if (!data) return null;

    if (data.stats && typeof data.stats === "object") {
      return data.stats as Stats;
    }

    if (typeof data === "object" && !Array.isArray(data)) {
      return data as Stats;
    }

    return null;
  }, []);

  const fetchJson = useCallback(async (url: string) => {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    let data: any = null;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const message =
        data?.error ||
        data?.message ||
        `Request failed with status ${response.status}`;

      throw new Error(message);
    }

    return data;
  }, []);

  const loadData = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        /*
         * Load each endpoint independently.
         *
         * This is important because if one endpoint fails,
         * the entire Invoice Overview should NOT disappear.
         */

        const results = await Promise.allSettled([
          fetchJson("/api/invoices/stats"),
          fetchJson("/api/invoices"),
          fetchJson("/api/invoices/overdue?days=7"),
        ]);

        /*
         * -----------------------------------------------------
         * STATS
         * -----------------------------------------------------
         */

        const statsResult = results[0];

        if (statsResult.status === "fulfilled") {
          const parsedStats = extractStats(statsResult.value);

          if (parsedStats) {
            setStats(parsedStats);
          }
        }

        /*
         * -----------------------------------------------------
         * INVOICES
         * -----------------------------------------------------
         */

        const invoicesResult = results[1];

        if (invoicesResult.status === "fulfilled") {
          const invoices = extractList(invoicesResult.value);

          /*
           * The current /api/invoices route already sorts
           * by created_at DESC, so we only take the first 5
           * here for the overview.
           */
          setRecentInvoices(invoices.slice(0, 5));
        }

        /*
         * -----------------------------------------------------
         * UPCOMING / OVERDUE
         * -----------------------------------------------------
         */

        const dueResult = results[2];

        if (dueResult.status === "fulfilled") {
          const invoices = extractList(dueResult.value);

          setUpcomingDue(invoices.slice(0, 5));
        }

        /*
         * -----------------------------------------------------
         * ERROR HANDLING
         * -----------------------------------------------------
         *
         * We only show an error if every request failed.
         */

        const failedRequests = results.filter(
          (result) => result.status === "rejected",
        );

        if (failedRequests.length === results.length) {
          const firstError = failedRequests[0];

          if (firstError.status === "rejected") {
            throw firstError.reason;
          }

          throw new Error("Failed to load invoice overview.");
        }

        /*
         * If only some endpoints failed, keep the working
         * sections visible and show a small warning.
         */

        if (failedRequests.length > 0) {
          setError(
            "Some invoice information could not be loaded. Please refresh and try again.",
          );
        }
      } catch (err) {
        console.error("Invoice overview load error:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load invoice overview.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [extractList, extractStats, fetchJson],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  /*
   * ---------------------------------------------------------
   * LOADING
   * ---------------------------------------------------------
   */

  if (loading) {
    return <LoadingSpinner />;
  }

  /*
   * ---------------------------------------------------------
   * STATS
   * ---------------------------------------------------------
   */

  const totalInvoiced = Number(stats?.total_invoiced ?? 0);
  const totalCollected = Number(stats?.total_collected ?? 0);
  const totalOutstanding = Number(stats?.total_outstanding ?? 0);
  const totalInvoices = Number(stats?.total_invoices ?? 0);

  /*
   * ---------------------------------------------------------
   * STATUS COUNTS
   * ---------------------------------------------------------
   */

  const statusItems = [
    "draft",
    "sent",
    "partially_paid",
    "paid",
    "overdue",
    "cancelled",
    "void",
  ] as const;

  return (
    <div className="space-y-6">
      {/* =====================================================
          HEADER
          ===================================================== */}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            Invoice Overview
          </h1>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Monitor invoices, payments, customers and outstanding balances.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
        >
          <RefreshCw
            size={16}
            className={refreshing ? "animate-spin" : ""}
          />

          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* =====================================================
          PARTIAL ERROR
          ===================================================== */}

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />

          <div className="min-w-0 flex-1">
            <p className="font-medium">
              Some invoice information is unavailable.
            </p>

            <p className="mt-1 opacity-80">
              {error}
            </p>
          </div>

          <button
            type="button"
            onClick={() => loadData(true)}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/30"
          >
            Retry
          </button>
        </div>
      )}

      {/* =====================================================
          MAIN STATS
          ===================================================== */}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Invoices"
          value={String(totalInvoices)}
          icon={FileText}
        />

        <StatCard
          label="Total Invoiced"
          value={money(totalInvoiced)}
          icon={Receipt}
        />

        <StatCard
          label="Collected"
          value={money(totalCollected)}
          icon={Wallet}
        />

        <StatCard
          label="Outstanding"
          value={money(totalOutstanding)}
          icon={CircleDollarSign}
        />
      </section>

      {/* =====================================================
          STATUS BREAKDOWN
          ===================================================== */}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {statusItems.map((status) => {
          const key = `${status}_invoices` as keyof Stats;

          const count = Number(stats?.[key] ?? 0);

          return (
            <button
              key={status}
              type="button"
              onClick={() => onNavigate("invoices")}
              className="group rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-800"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">
                  {STATUS_LABELS[status]}
                </p>

                <span className="text-gray-300 transition group-hover:text-blue-500 dark:text-gray-700">
                  →
                </span>
              </div>

              <p className="mt-2 text-xl font-bold">
                {count}
              </p>
            </button>
          );
        })}
      </section>

      {/* =====================================================
          RECENT INVOICES
          ===================================================== */}

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div>
            <h2 className="text-sm font-semibold">
              Recent Invoices
            </h2>

            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Your latest invoices
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigate("invoices")}
            className="text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400"
          >
            View all
          </button>
        </div>

        {recentInvoices.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <FileText
                size={22}
                className="text-gray-400"
              />
            </div>

            <p className="mt-3 text-sm font-medium">
              No invoices yet
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Create your first invoice to start tracking payments.
            </p>

            <button
              type="button"
              onClick={() => onNavigate("create-invoice")}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <Plus size={16} />
              Create Invoice
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-800/50">
                <tr>
                  <th className="px-5 py-3 font-medium">
                    Invoice
                  </th>

                  <th className="px-5 py-3 font-medium">
                    Customer
                  </th>

                  <th className="px-5 py-3 font-medium">
                    Total
                  </th>

                  <th className="px-5 py-3 font-medium">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {recentInvoices.map((invoice) => {
                  const status = displayStatus(invoice);

                  return (
                    <tr
                      key={invoice.id}
                      onClick={() => onNavigate("invoices")}
                      className="cursor-pointer transition hover:bg-gray-50 dark:hover:bg-gray-800/40"
                    >
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold">
                          {invoice.invoice_number || "—"}
                        </p>

                        {invoice.issue_date && (
                          <p className="mt-0.5 text-xs text-gray-500">
                            {dateText(invoice.issue_date)}
                          </p>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <p className="text-sm font-medium">
                          {invoice.customer?.company_name ||
                            invoice.customer?.contact_name ||
                            "Unknown customer"}
                        </p>

                        {invoice.customer?.email && (
                          <p className="mt-0.5 max-w-[220px] truncate text-xs text-gray-500">
                            {invoice.customer.email}
                          </p>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold">
                          {money(
                            Number(invoice.total_amount ?? 0),
                            invoice.currency,
                          )}
                        </p>

                        {Number(invoice.amount_due ?? 0) > 0 && (
                          <p className="mt-0.5 text-xs text-gray-500">
                            Due:{" "}
                            {money(
                              Number(invoice.amount_due ?? 0),
                              invoice.currency,
                            )}
                          </p>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                            status,
                          )}`}
                        >
                          {STATUS_LABELS[status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* =====================================================
          UPCOMING / OVERDUE
          ===================================================== */}

      {upcomingDue.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
          <div className="flex items-center justify-between border-b border-amber-200/60 px-5 py-4 dark:border-amber-900/30">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <AlertCircle
                  size={18}
                  className="text-amber-600 dark:text-amber-400"
                />
              </div>

              <div>
                <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Payments Requiring Attention
                </h2>

                <p className="text-xs text-amber-700/80 dark:text-amber-300/70">
                  Invoices that may need follow-up
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate("invoices")}
              className="text-xs font-semibold text-amber-700 hover:underline dark:text-amber-300"
            >
              View invoices
            </button>
          </div>

          <div className="divide-y divide-amber-200/50 dark:divide-amber-900/30">
            {upcomingDue.map((invoice) => (
              <button
                key={invoice.id}
                type="button"
                onClick={() => onNavigate("invoices")}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-amber-100/50 dark:hover:bg-amber-900/10"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {invoice.invoice_number}
                  </p>

                  <p className="mt-0.5 truncate text-xs text-gray-600 dark:text-gray-400">
                    {invoice.customer?.company_name ||
                      invoice.customer?.contact_name ||
                      "Unknown customer"}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold">
                    {money(
                      Number(invoice.amount_due ?? 0),
                      invoice.currency,
                    )}
                  </p>

                  {invoice.due_date && (
                    <p className="mt-0.5 text-xs text-gray-500">
                      Due {dateText(invoice.due_date)}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* =====================================================
          QUICK ACTIONS
          ===================================================== */}

      <section>
        <h2 className="mb-3 text-sm font-semibold">
          Quick Actions
        </h2>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onNavigate("create-invoice")}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Plus size={17} />
            New Invoice
          </button>

          <button
            type="button"
            onClick={() => onNavigate("invoice-customers")}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
          >
            <Users size={17} />
            Manage Customers
          </button>

          <button
            type="button"
            onClick={() => onNavigate("invoice-products")}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
          >
            <Package size={17} />
            Manage Products
          </button>
        </div>
      </section>
    </div>
  );
}
// 2. ALL INVOICES
function InvoicesList({
  onNavigate,
}: {
  onNavigate?: (page: InvoicePage) => void;
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | InvoiceStatus>("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);

  /*
   * ---------------------------------------------------------
   * LOAD INVOICES
   * ---------------------------------------------------------
   */
  const loadInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/invoices", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error || `Failed to load invoices (${response.status}).`
        );
      }

      const invoicesData: Invoice[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.invoices)
          ? data.invoices
          : [];

      setInvoices(invoicesData);
    } catch (err) {
      console.error("InvoicesList load error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load invoices."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  /*
   * ---------------------------------------------------------
   * OPEN INVOICE DETAILS
   * ---------------------------------------------------------
   */
  const openInvoice = useCallback(async (id: string) => {
    try {
      setDetailLoading(true);
      setError("");

      const response = await fetch(`/api/invoices/${id}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error || `Failed to load invoice (${response.status}).`
        );
      }

      const invoice = data?.invoice ?? data;

      if (!invoice?.id) {
        throw new Error("The server returned an invalid invoice.");
      }

      setSelectedInvoice(invoice);
    } catch (err) {
      console.error("Invoice details error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load invoice."
      );
    } finally {
      setDetailLoading(false);
    }
  }, []);

  /*
   * ---------------------------------------------------------
   * UPDATE INVOICE STATUS
   * ---------------------------------------------------------
   */
  const updateStatus = useCallback(
    async (id: string, status: InvoiceStatus) => {
      try {
        setActionLoading(id);
        setError("");

        const response = await fetch(`/api/invoices/${id}/status`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            data?.error ||
              `Failed to update invoice status (${response.status}).`
          );
        }

        const updatedInvoice = data?.invoice;

        setInvoices((current) =>
          current.map((invoice) =>
            invoice.id === id
              ? {
                  ...invoice,
                  ...(updatedInvoice || {}),
                  status,
                }
              : invoice
          )
        );

        if (
          selectedInvoice?.id === id &&
          updatedInvoice?.id
        ) {
          setSelectedInvoice(updatedInvoice);
        }

        await loadInvoices();
      } catch (err) {
        console.error("Invoice status update error:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Failed to update invoice status."
        );
      } finally {
        setActionLoading(null);
      }
    },
    [loadInvoices, selectedInvoice]
  );

  /*
   * ---------------------------------------------------------
   * SHARE INVOICE
   * ---------------------------------------------------------
   */
  const shareInvoice = useCallback(async (invoice: Invoice) => {
    try {
      setSharingId(invoice.id);
      setError("");

      const invoiceUrl = `${window.location.origin}/invoicing/invoices/${invoice.id}`;

      const customerName =
        invoice.customer?.company_name ||
        invoice.customer?.contact_name ||
        "Customer";

      const shareTitle = `Invoice ${invoice.invoice_number}`;
      const shareText = `Invoice ${invoice.invoice_number} for ${customerName}`;

      /*
       * Native sharing works on supported phones/browsers.
       */
      if (
        typeof navigator !== "undefined" &&
        navigator.share
      ) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: invoiceUrl,
        });

        return;
      }

      /*
       * Desktop fallback: copy the invoice URL.
       */
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard
      ) {
        await navigator.clipboard.writeText(invoiceUrl);

        setError("");
        window.alert("Invoice link copied to clipboard.");
        return;
      }

      /*
       * Last fallback.
       */
      window.prompt(
        "Copy this invoice link:",
        invoiceUrl
      );
    } catch (err) {
      /*
       * AbortError means the user simply cancelled sharing.
       */
      if (
        err instanceof DOMException &&
        err.name === "AbortError"
      ) {
        return;
      }

      console.error("Invoice sharing error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to share invoice."
      );
    } finally {
      setSharingId(null);
    }
  }, []);

  /*
   * ---------------------------------------------------------
   * EXPORT INVOICES TO CSV
   * ---------------------------------------------------------
   */
  const exportInvoices = useCallback(() => {
    try {
      setExporting(true);
      setError("");

      if (filteredInvoices.length === 0) {
        throw new Error("There are no invoices to export.");
      }

      const headers = [
        "Invoice Number",
        "Customer",
        "Email",
        "Issue Date",
        "Due Date",
        "Currency",
        "Total",
        "Amount Paid",
        "Amount Due",
        "Status",
        "PO Number",
      ];

      const escapeCsv = (value: unknown) => {
        const text = String(value ?? "");
        return `"${text.replace(/"/g, '""')}"`;
      };

      const rows = filteredInvoices.map((invoice) => {
        const customerName =
          invoice.customer?.company_name ||
          invoice.customer?.contact_name ||
          "";

        const customerEmail =
          invoice.customer?.email || "";

        return [
          invoice.invoice_number,
          customerName,
          customerEmail,
          invoice.issue_date,
          invoice.due_date,
          invoice.currency,
          invoice.total_amount,
          invoice.amount_paid,
          invoice.amount_due,
          displayStatus(invoice),
          invoice.po_number || "",
        ];
      });

      const csv = [
        headers.map(escapeCsv).join(","),
        ...rows.map((row) =>
          row.map(escapeCsv).join(",")
        ),
      ].join("\n");

      const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8;",
      });

      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `invoices-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Invoice export error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to export invoices."
      );
    } finally {
      setExporting(false);
    }
  }, [invoices, filter, search]);

  /*
   * ---------------------------------------------------------
   * SEARCH + FILTER
   * ---------------------------------------------------------
   */
  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();

    return invoices.filter((invoice) => {
      const status = displayStatus(invoice);

      if (
        filter !== "all" &&
        status !== filter
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        String(invoice.invoice_number ?? "")
          .toLowerCase()
          .includes(query) ||
        String(invoice.customer?.company_name ?? "")
          .toLowerCase()
          .includes(query) ||
        String(invoice.customer?.contact_name ?? "")
          .toLowerCase()
          .includes(query) ||
        String(invoice.customer?.email ?? "")
          .toLowerCase()
          .includes(query) ||
        String(invoice.po_number ?? "")
          .toLowerCase()
          .includes(query)
      );
    });
  }, [invoices, filter, search]);

  /*
   * ---------------------------------------------------------
   * DETAIL VIEW
   * ---------------------------------------------------------
   */
  if (selectedInvoice) {
    return (
      <InvoiceDetail
        invoice={selectedInvoice}
        onBack={() => setSelectedInvoice(null)}
        onRefresh={async () => {
          await Promise.all([
            loadInvoices(),
            openInvoice(selectedInvoice.id),
          ]);
        }}
      />
    );
  }

  /*
   * ---------------------------------------------------------
   * LOADING
   * ---------------------------------------------------------
   */
  if (loading || detailLoading) {
    return <LoadingSpinner />;
  }

  /*
   * ---------------------------------------------------------
   * MAIN UI
   * ---------------------------------------------------------
   */
  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            All Invoices
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            {filteredInvoices.length} invoice
            {filteredInvoices.length !== 1 ? "s" : ""} shown
            {filteredInvoices.length !== invoices.length &&
              ` of ${invoices.length}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">

          {/* SEARCH */}
          <div className="relative">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search invoices..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 sm:w-64 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          {/* FILTER */}
          <select
            value={filter}
            onChange={(event) =>
              setFilter(
                event.target.value as
                  | "all"
                  | InvoiceStatus
              )
            }
            className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="all">
              All statuses
            </option>

            {Object.entries(STATUS_LABELS).map(
              ([key, label]) => (
                <option
                  key={key}
                  value={key}
                >
                  {label}
                </option>
              )
            )}
          </select>

          {/* EXPORT */}
          <button
            type="button"
            onClick={exportInvoices}
            disabled={
              exporting ||
              filteredInvoices.length === 0
            }
            title="Export invoices"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
          >
            <Download size={16} />

            {exporting
              ? "Exporting..."
              : "Export"}
          </button>

          {/* REFRESH */}
          <button
            type="button"
            onClick={loadInvoices}
            disabled={loading}
            title="Refresh invoices"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
          >
            <RefreshCw
              size={16}
              className={
                loading
                  ? "animate-spin"
                  : ""
              }
            />

            Refresh
          </button>

          {/* NEW INVOICE */}
          <button
            type="button"
            onClick={() => {
              if (onNavigate) {
                onNavigate("create-invoice");
              } else {
                window.location.href =
                  "/invoicing/create-invoice";
              }
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Plus size={17} />
            New Invoice
          </button>
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle
            size={18}
            className="mt-0.5 shrink-0"
          />

          <span className="flex-1">
            {error}
          </span>

          <button
            type="button"
            onClick={() => {
              setError("");
              loadInvoices();
            }}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition hover:bg-red-100 dark:hover:bg-red-900/30"
          >
            <RefreshCw size={15} />
            Retry
          </button>
        </div>
      )}

      {/* INVOICE TABLE */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">

        {filteredInvoices.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">

            <FileText
              size={46}
              className="text-gray-400"
            />

            <h3 className="mt-4 text-base font-semibold">
              {invoices.length === 0
                ? "No invoices yet"
                : "No invoices found"}
            </h3>

            <p className="mt-1 max-w-md text-sm text-gray-500">
              {invoices.length === 0
                ? "Create your first invoice to get started."
                : "Try adjusting your search or status filter."}
            </p>

            {invoices.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  if (onNavigate) {
                    onNavigate("create-invoice");
                  } else {
                    window.location.href =
                      "/invoicing/create-invoice";
                  }
                }}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                <Plus size={17} />
                New Invoice
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">

            <table className="w-full min-w-[1200px] text-left">

              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-800/50">
                <tr>
                  <th className="px-5 py-3.5">
                    Invoice
                  </th>

                  <th className="px-5 py-3.5">
                    Customer
                  </th>

                  <th className="px-5 py-3.5">
                    Issued
                  </th>

                  <th className="px-5 py-3.5">
                    Due
                  </th>

                  <th className="px-5 py-3.5">
                    Total
                  </th>

                  <th className="px-5 py-3.5">
                    Balance
                  </th>

                  <th className="px-5 py-3.5">
                    Status
                  </th>

                  <th className="px-5 py-3.5 text-right">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">

                {filteredInvoices.map((invoice) => {
                  const status =
                    displayStatus(invoice);

                  const isUpdating =
                    actionLoading === invoice.id;

                  const isSharing =
                    sharingId === invoice.id;

                  return (
                    <tr
                      key={invoice.id}
                      className="transition hover:bg-gray-50 dark:hover:bg-gray-800/40"
                    >

                      {/* INVOICE */}
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() =>
                            openInvoice(invoice.id)
                          }
                          className="text-left"
                        >
                          <p className="text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400">
                            {invoice.invoice_number}
                          </p>

                          {invoice.po_number && (
                            <p className="mt-1 text-xs text-gray-500">
                              PO: {invoice.po_number}
                            </p>
                          )}
                        </button>
                      </td>

                      {/* CUSTOMER */}
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium">
                          {invoice.customer?.company_name ||
                            invoice.customer?.contact_name ||
                            "Unknown"}
                        </p>

                        {invoice.customer?.contact_name &&
                          invoice.customer?.company_name && (
                            <p className="mt-1 text-xs text-gray-500">
                              {invoice.customer.contact_name}
                            </p>
                          )}

                        {invoice.customer?.email && (
                          <p className="mt-0.5 text-xs text-gray-400">
                            {invoice.customer.email}
                          </p>
                        )}
                      </td>

                      {/* ISSUED */}
                      <td className="px-5 py-4 text-sm">
                        {dateText(invoice.issue_date)}
                      </td>

                      {/* DUE */}
                      <td className="px-5 py-4 text-sm">
                        {dateText(invoice.due_date)}
                      </td>

                      {/* TOTAL */}
                      <td className="px-5 py-4 text-sm font-semibold">
                        {money(
                          invoice.total_amount,
                          invoice.currency
                        )}
                      </td>

                      {/* BALANCE */}
                      <td className="px-5 py-4 text-sm font-semibold">
                        {money(
                          invoice.amount_due,
                          invoice.currency
                        )}
                      </td>

                      {/* STATUS */}
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                            status
                          )}`}
                        >
                          {STATUS_LABELS[status] ??
                            status}
                        </span>
                      </td>

                      {/* ACTIONS */}
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1.5">

                          {/* VIEW */}
                          <button
                            type="button"
                            title="View invoice"
                            onClick={() =>
                              openInvoice(invoice.id)
                            }
                            disabled={isUpdating}
                            className="rounded-lg p-2 text-gray-500 transition hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-blue-950/30 dark:hover:text-blue-400"
                          >
                            <FileText size={16} />
                          </button>

                          {/* SHARE */}
                          <button
                            type="button"
                            title="Share invoice"
                            onClick={() =>
                              shareInvoice(invoice)
                            }
                            disabled={isSharing}
                            className="rounded-lg p-2 text-gray-500 transition hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400"
                          >
                            {isSharing ? (
                              <RefreshCw
                                size={16}
                                className="animate-spin"
                              />
                            ) : (
                              <Share2 size={16} />
                            )}
                          </button>

                          {/* SEND */}
                          {status === "draft" && (
                            <button
                              type="button"
                              title="Mark invoice as sent"
                              onClick={() =>
                                updateStatus(
                                  invoice.id,
                                  "sent"
                                )
                              }
                              disabled={isUpdating}
                              className="rounded-lg p-2 text-gray-500 transition hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-blue-950/30 dark:hover:text-blue-400"
                            >
                              {isUpdating ? (
                                <RefreshCw
                                  size={16}
                                  className="animate-spin"
                                />
                              ) : (
                                <Send size={16} />
                              )}
                            </button>
                          )}

                          {/* EDIT */}
                          <button
                            type="button"
                            title="Edit invoice"
                            onClick={() => {
                              window.location.href =
                                `/invoicing/create-invoice?invoiceId=${encodeURIComponent(
                                  invoice.id
                                )}`;
                            }}
                            className="rounded-lg p-2 text-gray-500 transition hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/30 dark:hover:text-amber-400"
                          >
                            <Edit size={16} />
                          </button>

                        </div>
                      </td>
                    </tr>
                  );
                })}

              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RESULTS SUMMARY */}
      {filteredInvoices.length > 0 && (
        <div className="flex flex-col gap-3 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">

          <span>
            Showing{" "}
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {filteredInvoices.length}
            </span>{" "}
            of{" "}
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {invoices.length}
            </span>{" "}
            invoices
          </span>

          {(search || filter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFilter("all");
              }}
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
// 3. CREATE INVOICE
function CreateInvoice() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [paymentTermsId, setPaymentTermsId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [taxCalculationMethod, setTaxCalculationMethod] =
    useState<"exclusive" | "inclusive">("exclusive");

  const [poNumber, setPoNumber] = useState("");
  const [discountType, setDiscountType] =
    useState<"percentage" | "fixed" | "">("");
  const [discountValue, setDiscountValue] = useState("0");
  const [shippingCost, setShippingCost] = useState("0");

  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [footerText, setFooterText] = useState("");

  const [items, setItems] = useState<DraftItem[]>([
    { ...EMPTY_ITEM },
  ]);

  /*
   * Safely extract array data from different API response formats.
   */
  const getArray = <T,>(
    data: unknown,
    keys: string[] = []
  ): T[] => {
    if (Array.isArray(data)) {
      return data as T[];
    }

    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;

      for (const key of keys) {
        if (Array.isArray(record[key])) {
          return record[key] as T[];
        }
      }
    }

    return [];
  };

  /*
   * Load everything required by the invoice form.
   */
  const loadCreateData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const responses = await Promise.all([
        fetch("/api/customers?status=active", {
          credentials: "include",
          cache: "no-store",
        }),

        fetch("/api/products?is_active=true", {
          credentials: "include",
          cache: "no-store",
        }),

        fetch("/api/payment-terms?is_active=true", {
          credentials: "include",
          cache: "no-store",
        }),

        fetch("/api/tax-rates?is_active=true", {
          credentials: "include",
          cache: "no-store",
        }),

        fetch("/api/invoice-settings", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);

      const [
        customersRes,
        productsRes,
        termsRes,
        taxRes,
        settingsRes,
      ] = responses;

      const [
        customersData,
        productsData,
        termsData,
        taxData,
        settingsData,
      ] = await Promise.all(
        responses.map(async (response) => {
          try {
            return await response.json();
          } catch {
            return {};
          }
        })
      );

      if (!customersRes.ok) {
        throw new Error(
          customersData?.error || "Failed to load customers."
        );
      }

      if (!productsRes.ok) {
        throw new Error(
          productsData?.error || "Failed to load products."
        );
      }

      if (!termsRes.ok) {
        throw new Error(
          termsData?.error || "Failed to load payment terms."
        );
      }

      if (!taxRes.ok) {
        throw new Error(
          taxData?.error || "Failed to load tax rates."
        );
      }

      /*
       * Customers
       */
      setCustomers(
        getArray<Customer>(customersData, [
          "customers",
          "data",
          "results",
        ])
      );

      /*
       * Products
       */
      setProducts(
        getArray<Product>(productsData, [
          "products",
          "data",
          "results",
        ])
      );

      /*
       * Payment terms
       */
      setPaymentTerms(
        getArray<PaymentTerm>(termsData, [
          "paymentTerms",
          "payment_terms",
          "terms",
          "data",
          "results",
        ])
      );

      /*
       * Tax rates
       */
      setTaxRates(
        getArray<TaxRate>(taxData, [
          "taxRates",
          "tax_rates",
          "rates",
          "data",
          "results",
        ])
      );

      /*
       * Invoice settings are optional.
       * The invoice form should still work if settings are unavailable.
       */
      if (settingsRes.ok) {
        const loadedSettings =
          settingsData?.settings || settingsData || null;

        setSettings(loadedSettings);

        if (loadedSettings) {
          if (loadedSettings.default_currency) {
            setCurrency(String(loadedSettings.default_currency));
          }

          if (
            loadedSettings.default_tax_calculation === "exclusive" ||
            loadedSettings.default_tax_calculation === "inclusive"
          ) {
            setTaxCalculationMethod(
              loadedSettings.default_tax_calculation
            );
          }

          if (loadedSettings.default_payment_terms_id) {
            setPaymentTermsId(
              String(loadedSettings.default_payment_terms_id)
            );
          }

          if (
            loadedSettings.default_due_days !== undefined &&
            loadedSettings.default_due_days !== null
          ) {
            const days = Number(
              loadedSettings.default_due_days
            );

            if (Number.isFinite(days)) {
              const base = new Date(
                issueDate || today()
              );

              base.setDate(base.getDate() + days);

              setDueDate(
                base.toISOString().slice(0, 10)
              );
            }
          }
        }
      }
    } catch (err) {
      console.error("Create invoice data error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load invoice data."
      );
    } finally {
      setLoading(false);
    }
  }, [issueDate]);

  useEffect(() => {
    loadCreateData();
  }, [loadCreateData]);

  /*
   * Selected customer and payment terms.
   */
  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId
  );

  const selectedPaymentTerms = paymentTerms.find(
    (term) => term.id === paymentTermsId
  );

  /*
   * Invoice calculations.
   */
  const calculations = useMemo(() => {
    const calculatedItems = items.map((item) =>
      calculateItem(item)
    );

    const subtotal = calculatedItems.reduce(
      (sum, item) => sum + Number(item.gross || 0),
      0
    );

    const itemDiscount = calculatedItems.reduce(
      (sum, item) => sum + Number(item.discount || 0),
      0
    );

    const taxableSubtotal = calculatedItems.reduce(
      (sum, item) => sum + Number(item.taxable || 0),
      0
    );

    const itemTax = calculatedItems.reduce(
      (sum, item) => sum + Number(item.tax || 0),
      0
    );

    const rawDiscountValue = Number(
      discountValue || 0
    );

    let invoiceDiscount = 0;

    if (discountType === "percentage") {
      invoiceDiscount =
        (taxableSubtotal * rawDiscountValue) / 100;
    } else if (discountType === "fixed") {
      invoiceDiscount = rawDiscountValue;
    }

    const safeInvoiceDiscount = Math.min(
      Math.max(invoiceDiscount, 0),
      taxableSubtotal
    );

    const finalTaxable =
      taxableSubtotal - safeInvoiceDiscount;

    const shipping = Math.max(
      Number(shippingCost || 0),
      0
    );

    const total =
      finalTaxable +
      itemTax +
      shipping;

    return {
      calculatedItems,
      subtotal,
      itemDiscount,
      taxableSubtotal,
      itemTax,
      invoiceDiscount,
      safeInvoiceDiscount,
      finalTaxable,
      shipping,
      total,
    };
  }, [
    items,
    discountType,
    discountValue,
    shippingCost,
  ]);

  const {
    subtotal,
    itemDiscount,
    itemTax,
    safeInvoiceDiscount,
    shipping,
    total,
  } = calculations;

  /*
   * Update an invoice item.
   */
  const updateItem = (
    index: number,
    field: keyof DraftItem,
    value: string
  ) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
            }
          : item
      )
    );
  };

  /*
   * Add a new invoice item.
   */
  const addItem = () => {
    setItems((current) => [
      ...current,
      { ...EMPTY_ITEM },
    ]);
  };

  /*
   * Remove an invoice item.
   */
  const removeItem = (index: number) => {
    setItems((current) => {
      if (current.length <= 1) {
        return current;
      }

      return current.filter(
        (_, itemIndex) => itemIndex !== index
      );
    });
  };

  /*
   * Select an existing product.
   */
  const selectProduct = (
    index: number,
    productId: string
  ) => {
    const product = products.find(
      (item) => item.id === productId
    );

    if (!product) {
      updateItem(index, "product_id", "");
      return;
    }

    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              product_id: product.id,
              description:
                product.description ||
                product.name ||
                "",
              unit_price: String(
                Number(product.unit_price || 0)
              ),
            }
          : item
      )
    );
  };

  /*
   * Payment terms automatically calculate due date.
   */
  const handlePaymentTermsChange = (
    id: string
  ) => {
    setPaymentTermsId(id);

    if (!id) {
      return;
    }

    const term = paymentTerms.find(
      (item) => item.id === id
    );

    if (!term) {
      return;
    }

    const days = Number(term.due_days || 0);

    if (!Number.isFinite(days)) {
      return;
    }

    const base = new Date(
      issueDate || today()
    );

    base.setDate(
      base.getDate() + days
    );

    setDueDate(
      base.toISOString().slice(0, 10)
    );
  };

  /*
   * When issue date changes, update due date
   * if payment terms are selected.
   */
  useEffect(() => {
    if (!paymentTermsId) {
      return;
    }

    const term = paymentTerms.find(
      (item) => item.id === paymentTermsId
    );

    if (!term) {
      return;
    }

    const days = Number(term.due_days || 0);

    if (!Number.isFinite(days)) {
      return;
    }

    const base = new Date(
      issueDate || today()
    );

    base.setDate(
      base.getDate() + days
    );

    setDueDate(
      base.toISOString().slice(0, 10)
    );
  }, [
    issueDate,
    paymentTermsId,
    paymentTerms,
  ]);

  /*
   * Validate invoice before sending it.
   */
  const validateInvoice = () => {
    if (!customerId) {
      throw new Error(
        "Please select a customer."
      );
    }

    if (!issueDate) {
      throw new Error(
        "Issue date is required."
      );
    }

    if (
      dueDate &&
      dueDate < issueDate
    ) {
      throw new Error(
        "Due date cannot be before the issue date."
      );
    }

    if (items.length === 0) {
      throw new Error(
        "Add at least one invoice item."
      );
    }

    for (
      let index = 0;
      index < items.length;
      index++
    ) {
      const item = items[index];

      if (!item.description.trim()) {
        throw new Error(
          `Invoice item ${index + 1} needs a description.`
        );
      }

      const quantity = Number(
        item.quantity
      );

      const unitPrice = Number(
        item.unit_price
      );

      const itemDiscountValue = Number(
        item.discount_value || 0
      );

      const taxRate = Number(
        item.tax_rate || 0
      );

      if (
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        throw new Error(
          `Invoice item ${index + 1} has an invalid quantity.`
        );
      }

      if (
        !Number.isFinite(unitPrice) ||
        unitPrice < 0
      ) {
        throw new Error(
          `Invoice item ${index + 1} has an invalid unit price.`
        );
      }

      if (
        !Number.isFinite(itemDiscountValue) ||
        itemDiscountValue < 0
      ) {
        throw new Error(
          `Invoice item ${index + 1} has an invalid discount.`
        );
      }

      if (
        !Number.isFinite(taxRate) ||
        taxRate < 0
      ) {
        throw new Error(
          `Invoice item ${index + 1} has an invalid tax rate.`
        );
      }

      if (
        item.discount_type ===
          "percentage" &&
        itemDiscountValue > 100
      ) {
        throw new Error(
          `Invoice item ${index + 1} discount cannot exceed 100%.`
        );
      }
    }

    const invoiceDiscountNumber = Number(
      discountValue || 0
    );

    if (
      !Number.isFinite(invoiceDiscountNumber) ||
      invoiceDiscountNumber < 0
    ) {
      throw new Error(
        "Invalid invoice discount."
      );
    }

    if (
      discountType === "percentage" &&
      invoiceDiscountNumber > 100
    ) {
      throw new Error(
        "Invoice discount cannot exceed 100%."
      );
    }

    const shippingNumber = Number(
      shippingCost || 0
    );

    if (
      !Number.isFinite(shippingNumber) ||
      shippingNumber < 0
    ) {
      throw new Error(
        "Invalid shipping cost."
      );
    }
  };

  /*
   * Submit invoice.
   */
  const submit = async () => {
    if (saving) {
      return;
    }

    try {
      setSaving(true);
      setError("");

      validateInvoice();

      const payload = {
        customer_id: customerId,

        issue_date: issueDate,

        due_date:
          dueDate || null,

        payment_terms_id:
          paymentTermsId || null,

        payment_terms_display:
          selectedPaymentTerms?.name || null,

        currency,

        tax_calculation_method:
          taxCalculationMethod,

        po_number:
          poNumber.trim() || null,

        discount_type:
          discountType || null,

        discount_value:
          Number(discountValue || 0),

        shipping_cost:
          shipping,

        notes:
          notes.trim() || null,

        internal_notes:
          internalNotes.trim() || null,

        footer_text:
          footerText.trim() || null,

        items: items.map((item) => ({
          product_id:
            item.product_id || null,

          description:
            item.description.trim(),

          quantity:
            Number(item.quantity),

          unit_price:
            Number(item.unit_price),

          discount_type:
            item.discount_type || null,

          discount_value:
            Number(
              item.discount_value || 0
            ),

          tax_rate:
            Number(item.tax_rate || 0),
        })),
      };

      const response = await fetch(
        "/api/invoices",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      let data: any = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
            data?.message ||
            "Failed to create invoice."
        );
      }

      /*
       * Support common API response shapes:
       * { invoice }
       * { data }
       * direct invoice object
       */
      const createdInvoice =
        data?.invoice ||
        data?.data ||
        data;

      console.log(
        "Invoice created successfully:",
        createdInvoice
      );

      /*
       * Reset form.
       */
      setItems([
        { ...EMPTY_ITEM },
      ]);

      setCustomerId("");
      setPoNumber("");
      setDiscountType("");
      setDiscountValue("0");
      setShippingCost("0");
      setNotes("");
      setInternalNotes("");
      setFooterText("");

      /*
       * Go back to invoice list.
       */
      window.location.href =
        "/invoicing/invoices";
    } catch (err) {
      console.error(
        "Create invoice error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Failed to create invoice."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">
            Create Invoice
          </h2>

          <p className="text-sm text-gray-500">
            Fill in the details to create a new invoice.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            (window.location.href =
              "/invoicing/invoices")
          }
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          <ArrowLeft size={16} />
          Back to Invoices
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle
            size={18}
            className="mt-0.5 shrink-0"
          />

          <div className="flex-1">
            <p className="font-medium">
              Unable to create invoice
            </p>

            <p className="mt-1">
              {error}
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setError("")
            }
            className="rounded-lg px-2 py-1 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/30"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {/* Customer & Invoice Details */}
          <section className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
            <h3 className="mb-4 text-sm font-bold">
              Customer & Invoice Details
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <FieldLabel>
                  Customer *
                </FieldLabel>

                <select
                  value={customerId}
                  onChange={(e) =>
                    setCustomerId(
                      e.target.value
                    )
                  }
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="">
                    Select customer
                  </option>

                  {customers.map(
                    (customer) => (
                      <option
                        key={customer.id}
                        value={customer.id}
                      >
                        {customer.company_name}

                        {customer.contact_name
                          ? ` — ${customer.contact_name}`
                          : ""}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                <FieldLabel>
                  Issue Date *
                </FieldLabel>

                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) =>
                    setIssueDate(
                      e.target.value
                    )
                  }
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </label>

              <label>
                <FieldLabel>
                  Due Date
                </FieldLabel>

                <input
                  type="date"
                  min={issueDate || undefined}
                  value={dueDate}
                  onChange={(e) =>
                    setDueDate(
                      e.target.value
                    )
                  }
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </label>

              <label>
                <FieldLabel>
                  Payment Terms
                </FieldLabel>

                <select
                  value={paymentTermsId}
                  onChange={(e) =>
                    handlePaymentTermsChange(
                      e.target.value
                    )
                  }
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="">
                    Select terms
                  </option>

                  {paymentTerms.map(
                    (term) => (
                      <option
                        key={term.id}
                        value={term.id}
                      >
                        {term.name}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                <FieldLabel>
                  Currency
                </FieldLabel>

                <select
                  value={currency}
                  onChange={(e) =>
                    setCurrency(
                      e.target.value
                    )
                  }
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  {CURRENCIES.map(
                    (curr) => (
                      <option
                        key={curr}
                        value={curr}
                      >
                        {curr}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                <FieldLabel>
                  PO Number
                </FieldLabel>

                <input
                  value={poNumber}
                  onChange={(e) =>
                    setPoNumber(
                      e.target.value
                    )
                  }
                  placeholder="PO-000123"
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </label>

              <label>
                <FieldLabel>
                  Tax Calculation
                </FieldLabel>

                <select
                  value={
                    taxCalculationMethod
                  }
                  onChange={(e) =>
                    setTaxCalculationMethod(
                      e.target.value as
                        | "exclusive"
                        | "inclusive"
                    )
                  }
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="exclusive">
                    Tax Exclusive
                  </option>

                  <option value="inclusive">
                    Tax Inclusive
                  </option>
                </select>
              </label>
            </div>

            {selectedCustomer && (
              <div className="mt-5 rounded-xl bg-gray-50 p-4 dark:bg-gray-800/60">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-gray-500">
                      Company
                    </p>

                    <p className="mt-1 text-sm font-semibold">
                      {
                        selectedCustomer.company_name
                      }
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500">
                      Email
                    </p>

                    <p className="mt-1 truncate text-sm">
                      {
                        selectedCustomer.email ||
                        "—"
                      }
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500">
                      Phone
                    </p>

                    <p className="mt-1 text-sm">
                      {
                        selectedCustomer.phone ||
                        "—"
                      }
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500">
                      Tax ID
                    </p>

                    <p className="mt-1 text-sm">
                      {
                        selectedCustomer.tax_id ||
                        "—"
                      }
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Items */}
          <section className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
            <div className="mb-5 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold">
                  Invoice Items
                </h3>

                <p className="mt-1 text-xs text-gray-500">
                  Add products, quantities, discounts, and tax.
                </p>
              </div>

              <button
                type="button"
                onClick={addItem}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold dark:border-gray-700"
              >
                <Plus size={14} />
                Add Item
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <table className="w-full min-w-[1050px]">
                <thead className="bg-gray-50 text-xs text-gray-500 dark:bg-gray-800/50">
                  <tr>
                    <th className="p-3 text-left">
                      Product
                    </th>

                    <th className="p-3 text-left">
                      Description *
                    </th>

                    <th className="p-3">
                      Qty *
                    </th>

                    <th className="p-3">
                      Unit Price *
                    </th>

                    <th className="p-3">
                      Discount
                    </th>

                    <th className="p-3">
                      Tax
                    </th>

                    <th className="p-3 text-right">
                      Total
                    </th>

                    <th />
                  </tr>
                </thead>

                <tbody className="divide-y dark:divide-gray-800">
                  {items.map(
                    (item, index) => {
                      const calculated =
                        calculations.calculatedItems[
                          index
                        ];

                      return (
                        <tr
                          key={`${index}-${item.product_id || "custom"}`}
                        >
                          <td className="p-2">
                            <select
                              value={
                                item.product_id
                              }
                              onChange={(e) =>
                                selectProduct(
                                  index,
                                  e.target.value
                                )
                              }
                              className="w-40 rounded-lg border border-gray-200 bg-white px-2.5 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                            >
                              <option value="">
                                Custom item
                              </option>

                              {products
                                .filter(
                                  (product) =>
                                    product.is_active !==
                                    false
                                )
                                .map(
                                  (product) => (
                                    <option
                                      key={
                                        product.id
                                      }
                                      value={
                                        product.id
                                      }
                                    >
                                      {
                                        product.name
                                      }
                                    </option>
                                  )
                                )}
                            </select>
                          </td>

                          <td className="p-2">
                            <input
                              value={
                                item.description
                              }
                              onChange={(e) =>
                                updateItem(
                                  index,
                                  "description",
                                  e.target.value
                                )
                              }
                              placeholder="Description"
                              className="w-56 rounded-lg border border-gray-200 px-2.5 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                            />
                          </td>

                          <td className="p-2">
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={
                                item.quantity
                              }
                              onChange={(e) =>
                                updateItem(
                                  index,
                                  "quantity",
                                  e.target.value
                                )
                              }
                              className="w-20 rounded-lg border border-gray-200 px-2.5 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                            />
                          </td>

                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={
                                item.unit_price
                              }
                              onChange={(e) =>
                                updateItem(
                                  index,
                                  "unit_price",
                                  e.target.value
                                )
                              }
                              className="w-28 rounded-lg border border-gray-200 px-2.5 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                            />
                          </td>

                          <td className="p-2">
                            <div className="flex gap-1">
                              <select
                                value={
                                  item.discount_type
                                }
                                onChange={(e) =>
                                  updateItem(
                                    index,
                                    "discount_type",
                                    e.target.value
                                  )
                                }
                                className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-2.5 text-xs dark:border-gray-700 dark:bg-gray-900"
                              >
                                <option value="">
                                  None
                                </option>

                                <option value="percentage">
                                  %
                                </option>

                                <option value="fixed">
                                  Fixed
                                </option>
                              </select>

                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={
                                  item.discount_value
                                }
                                disabled={
                                  !item.discount_type
                                }
                                onChange={(e) =>
                                  updateItem(
                                    index,
                                    "discount_value",
                                    e.target.value
                                  )
                                }
                                className="w-20 rounded-lg border border-gray-200 px-2 py-2.5 text-sm disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:disabled:bg-gray-800"
                              />
                            </div>
                          </td>

                          <td className="p-2">
                            <select
                              value={
                                item.tax_rate
                              }
                              onChange={(e) =>
                                updateItem(
                                  index,
                                  "tax_rate",
                                  e.target.value
                                )
                              }
                              className="w-24 rounded-lg border border-gray-200 bg-white px-2.5 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                            >
                              <option value="0">
                                No Tax
                              </option>

                              {taxRates.map(
                                (rate) => (
                                  <option
                                    key={
                                      rate.id
                                    }
                                    value={String(
                                      rate.rate
                                    )}
                                  >
                                    {rate.name}
                                  </option>
                                )
                              )}
                            </select>
                          </td>

                          <td className="p-3 text-right text-sm font-semibold">
                            {money(
                              calculated?.total ||
                                0,
                              currency
                            )}
                          </td>

                          <td className="p-2">
                            <button
                              type="button"
                              disabled={
                                items.length ===
                                1
                              }
                              onClick={() =>
                                removeItem(index)
                              }
                              className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-30 dark:hover:bg-red-950/30"
                            >
                              <Trash2
                                size={16}
                              />
                            </button>
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/60">
                <p className="text-xs text-gray-500">
                  Item Discounts
                </p>

                <p className="mt-1 text-sm font-semibold">
                  {money(
                    itemDiscount,
                    currency
                  )}
                </p>
              </div>

              <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/60">
                <p className="text-xs text-gray-500">
                  Item Tax
                </p>

                <p className="mt-1 text-sm font-semibold">
                  {money(
                    itemTax,
                    currency
                  )}
                </p>
              </div>
            </div>
          </section>

          {/* Adjustments */}
          <section className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
            <h3 className="text-sm font-bold">
              Invoice Adjustments
            </h3>

            <p className="mt-1 text-xs text-gray-500">
              Apply invoice-level discount or shipping charge.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label>
                <FieldLabel>
                  Discount Type
                </FieldLabel>

                <select
                  value={discountType}
                  onChange={(e) =>
                    setDiscountType(
                      e.target.value as
                        | "percentage"
                        | "fixed"
                        | ""
                    )
                  }
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="">
                    No discount
                  </option>

                  <option value="percentage">
                    Percentage
                  </option>

                  <option value="fixed">
                    Fixed amount
                  </option>
                </select>
              </label>

              <label>
                <FieldLabel>
                  Discount Value
                </FieldLabel>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountValue}
                  disabled={!discountType}
                  onChange={(e) =>
                    setDiscountValue(
                      e.target.value
                    )
                  }
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:disabled:bg-gray-800"
                />
              </label>

              <label>
                <FieldLabel>
                  Shipping Cost
                </FieldLabel>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={shippingCost}
                  onChange={(e) =>
                    setShippingCost(
                      e.target.value
                    )
                  }
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </label>
            </div>
          </section>

          {/* Notes */}
          <section className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
            <h3 className="text-sm font-bold">
              Notes & Internal Information
            </h3>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label>
                <FieldLabel>
                  Customer Notes
                </FieldLabel>

                <textarea
                  value={notes}
                  onChange={(e) =>
                    setNotes(
                      e.target.value
                    )
                  }
                  rows={5}
                  placeholder="Notes shown to the customer..."
                  className="w-full rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </label>

              <label>
                <FieldLabel>
                  Internal Notes
                </FieldLabel>

                <textarea
                  value={internalNotes}
                  onChange={(e) =>
                    setInternalNotes(
                      e.target.value
                    )
                  }
                  rows={5}
                  placeholder="Staff-only notes..."
                  className="w-full rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </label>
            </div>

            <label className="mt-4 block">
              <FieldLabel>
                Footer Text (overrides template)
              </FieldLabel>

              <textarea
                value={footerText}
                onChange={(e) =>
                  setFooterText(
                    e.target.value
                  )
                }
                rows={3}
                placeholder="Custom footer text for this invoice..."
                className="w-full rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
          </section>
        </div>

        {/* Preview */}
        <aside className="h-fit rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900 xl:sticky xl:top-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Invoice Preview
              </p>

              <p className="mt-1 text-xs text-gray-400">
                Live calculation
              </p>
            </div>

            <Receipt
              size={19}
              className="text-blue-500"
            />
          </div>

          <div className="mt-5 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-bold">
                  {
                    settings?.company_name ||
                    "SaMi"
                  }
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  Invoice
                </p>
              </div>

              <div className="text-right">
                <p className="text-xs text-gray-500">
                  Invoice #
                </p>

                <p className="mt-1 text-sm font-semibold">
                  {
                    settings?.invoice_prefix ||
                    "INV-"
                  }

                  {String(
                    settings?.invoice_next_number ||
                      1
                  ).padStart(
                    settings?.invoice_number_padding ||
                      6,
                    "0"
                  )}
                </p>
              </div>
            </div>

            <div className="my-5 border-t border-gray-200 dark:border-gray-800" />

            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-500">
                  Bill to
                </p>

                <p className="mt-1 text-sm font-semibold">
                  {
                    selectedCustomer?.company_name ||
                    "Select customer"
                  }
                </p>

                {selectedCustomer?.email && (
                  <p className="mt-1 truncate text-xs text-gray-500">
                    {
                      selectedCustomer.email
                    }
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">
                    Issue Date
                  </p>

                  <p className="mt-1 text-xs font-medium">
                    {dateText(issueDate)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    Due Date
                  </p>

                  <p className="mt-1 text-xs font-medium">
                    {dueDate
                      ? dateText(dueDate)
                      : "Not set"}
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4 dark:border-gray-800">
                <SummaryRow
                  label="Subtotal"
                  value={money(
                    subtotal,
                    currency
                  )}
                />

                {itemDiscount > 0 && (
                  <div className="mt-2">
                    <SummaryRow
                      label="Item Discounts"
                      value={`-${money(
                        itemDiscount,
                        currency
                      )}`}
                    />
                  </div>
                )}

                {safeInvoiceDiscount > 0 && (
                  <div className="mt-2">
                    <SummaryRow
                      label="Invoice Discount"
                      value={`-${money(
                        safeInvoiceDiscount,
                        currency
                      )}`}
                    />
                  </div>
                )}

                <div className="mt-2">
                  <SummaryRow
                    label="Tax"
                    value={money(
                      itemTax,
                      currency
                    )}
                  />
                </div>

                {shipping > 0 && (
                  <div className="mt-2">
                    <SummaryRow
                      label="Shipping"
                      value={money(
                        shipping,
                        currency
                      )}
                    />
                  </div>
                )}

                <div className="my-4 border-t border-gray-200 dark:border-gray-800" />

                <SummaryRow
                  label="Total"
                  value={money(
                    total,
                    currency
                  )}
                  strong
                />
              </div>
            </div>
          </div>

          {/* Payment Terms */}
          <div className="mt-5 rounded-xl bg-blue-50 p-4 dark:bg-blue-950/30">
            <div className="flex items-start gap-3">
              <CreditCard
                size={18}
                className="mt-0.5 text-blue-600 dark:text-blue-400"
              />

              <div>
                <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">
                  Payment Terms
                </p>

                <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                  {
                    selectedPaymentTerms?.name ||
                    "No payment terms selected"
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Create */}
          <button
            type="button"
            disabled={
              saving ||
              !customerId ||
              items.length === 0
            }
            onClick={submit}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && (
              <Loader2
                size={17}
                className="animate-spin"
              />
            )}

            {saving
              ? "Creating invoice..."
              : "Create Invoice"}
          </button>

          {/* Cancel */}
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              (window.location.href =
                "/invoicing/invoices")
            }
            className="mt-2 w-full rounded-xl px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        </aside>
      </div>
    </div>
  );
}

// 4. INVOICE DETAIL
function InvoiceDetail({
  invoice,
  onBack,
  onRefresh,
}: {
  invoice: Invoice | null;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [transactionReference, setTransactionReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentNotes, setPaymentNotes] = useState("");

  if (!invoice) return <LoadingSpinner />;

  const status = displayStatus(invoice);
  const currency = invoice.currency || "USD";

  const totalAmount = Number(invoice.total_amount || 0);
  const amountPaid = Number(invoice.amount_paid || 0);
  const amountDue = Number(invoice.amount_due || 0);

  const items = Array.isArray(invoice.invoice_items)
    ? invoice.invoice_items
    : [];

  const payments = Array.isArray(invoice.payments)
    ? invoice.payments
    : [];

  const submitPayment = async () => {
    try {
      setActionLoading(true);
      setActionError("");

      const amount = Number(paymentAmount);

      if (!amount || amount <= 0) {
        throw new Error("Enter a valid payment amount.");
      }

      if (amount > amountDue) {
        throw new Error("Payment cannot be greater than the outstanding balance.");
      }

      const response = await fetch(`/api/invoices/${invoice.id}/payments`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount,
          currency,
          payment_method: paymentMethod,
          transaction_reference:
            transactionReference.trim() || null,
          payment_date: paymentDate || today(),
          notes: paymentNotes.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to record payment.");
      }

      setPaymentAmount("");
      setTransactionReference("");
      setPaymentNotes("");
      setPaymentDate(today());
      setPaymentMethod("bank_transfer");
      setShowPaymentForm(false);

      onRefresh();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Failed to record payment."
      );
    } finally {
      setActionLoading(false);
    }
  };

  const updateInvoiceStatus = async (newStatus: InvoiceStatus) => {
    try {
      setActionLoading(true);
      setActionError("");

      const response = await fetch(`/api/invoices/${invoice.id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: newStatus,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to update invoice status."
        );
      }

      onRefresh();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Failed to update invoice status."
      );
    } finally {
      setActionLoading(false);
    }
  };

  const sendInvoice = async () => {
    try {
      setActionLoading(true);
      setActionError("");

      const response = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send invoice.");
      }

      onRefresh();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Failed to send invoice."
      );
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition hover:text-gray-900 dark:hover:text-white"
      >
        <ArrowLeft size={16} />
        Back to Invoices
      </button>

      {/* Action Error */}
      {actionError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{actionError}</span>
          <button
            onClick={() => setActionError("")}
            className="ml-auto text-xs font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <header className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold">
                {invoice.invoice_number}
              </h1>

              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                  status
                )}`}
              >
                {STATUS_LABELS[status]}
              </span>
            </div>

            <p className="mt-2 text-sm text-gray-500">
              Issued {dateText(invoice.issue_date)}
              {invoice.due_date &&
                ` · Due ${dateText(invoice.due_date)}`}
            </p>

            <div className="mt-2 space-y-1">
              {invoice.sent_at && (
                <p className="text-xs text-gray-500">
                  Sent {dateText(invoice.sent_at)}
                </p>
              )}

              {invoice.viewed_at && (
                <p className="text-xs text-gray-500">
                  Viewed {dateText(invoice.viewed_at)}
                </p>
              )}

              {invoice.approved_at && (
                <p className="text-xs text-gray-500">
                  Approved {dateText(invoice.approved_at)}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onRefresh}
              disabled={actionLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              <RefreshCw
                size={16}
                className={actionLoading ? "animate-spin" : ""}
              />
              Refresh
            </button>

            {(status === "draft" || status === "overdue") && (
              <button
                onClick={sendInvoice}
                disabled={actionLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                <Send size={16} />
                Send Invoice
              </button>
            )}

            {status !== "paid" && status !== "cancelled" && status !== "void" && (
              <button
                onClick={() => setShowPaymentForm((current) => !current)}
                disabled={actionLoading || amountDue <= 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
              >
                <Wallet size={16} />
                Record Payment
              </button>
            )}
          </div>
        </div>

        {/* Status Actions */}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-200 pt-5 dark:border-gray-800">
          {status !== "paid" && status !== "cancelled" && status !== "void" && (
            <>
              {status !== "sent" && (
                <button
                  onClick={() => updateInvoiceStatus("sent")}
                  disabled={actionLoading}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  Mark Sent
                </button>
              )}

              <button
                onClick={() => updateInvoiceStatus("cancelled")}
                disabled={actionLoading}
                className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:hover:bg-red-950/30"
              >
                Cancel Invoice
              </button>
            </>
          )}
        </div>
      </header>

      {/* Payment Form */}
      {showPaymentForm && (
        <section className="rounded-2xl border border-green-200 bg-green-50/50 p-5 dark:border-green-900/50 dark:bg-green-950/20">
          <div className="mb-4">
            <h2 className="text-sm font-bold">Record Payment</h2>
            <p className="mt-1 text-xs text-gray-500">
              Outstanding balance:{" "}
              <span className="font-semibold">
                {money(amountDue, currency)}
              </span>
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label>
              <FieldLabel>Amount *</FieldLabel>
              <input
                type="number"
                min="0.01"
                max={amountDue}
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            <label>
              <FieldLabel>Payment Method *</FieldLabel>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
                <option value="mpesa">M-Pesa</option>
                <option value="card">Card</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label>
              <FieldLabel>Payment Date</FieldLabel>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            <label>
              <FieldLabel>Transaction Reference</FieldLabel>
              <input
                value={transactionReference}
                onChange={(e) =>
                  setTransactionReference(e.target.value)
                }
                placeholder="MPESA123456"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
          </div>

          <label className="mt-4 block">
            <FieldLabel>Payment Notes</FieldLabel>
            <textarea
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              rows={3}
              placeholder="Optional payment notes..."
              className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={submitPayment}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {actionLoading && (
                <Loader2 size={16} className="animate-spin" />
              )}
              Save Payment
            </button>

            <button
              onClick={() => setShowPaymentForm(false)}
              disabled={actionLoading}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* Financial Summary */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Invoice Total"
          value={money(totalAmount, currency)}
          icon={Receipt}
        />

        <StatCard
          label="Amount Paid"
          value={money(amountPaid, currency)}
          icon={Wallet}
        />

        <StatCard
          label="Balance Due"
          value={money(amountDue, currency)}
          icon={CircleDollarSign}
        />
      </section>

      {/* Customer */}
      <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <h2 className="text-sm font-bold">Customer</h2>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <DetailField
            label="Company"
            value={invoice.customer?.company_name}
          />

          <DetailField
            label="Contact"
            value={invoice.customer?.contact_name}
          />

          <DetailField
            label="Email"
            value={invoice.customer?.email}
          />

          <DetailField
            label="Phone"
            value={invoice.customer?.phone}
          />

          <DetailField
            label="Tax ID"
            value={invoice.customer?.tax_id}
          />

          <DetailField
            label="Registration"
            value={invoice.customer?.registration_number}
          />

          <DetailField
            label="Currency"
            value={invoice.customer?.currency}
          />

          <DetailField
            label="Customer Type"
            value={invoice.customer?.customer_type}
          />
        </div>

        {invoice.customer?.billing_address && (
          <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-800">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Billing Address
            </p>
            <p className="mt-1 whitespace-pre-line text-sm">
              {invoice.customer.billing_address}
            </p>
          </div>
        )}

        {invoice.customer?.shipping_address && (
          <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-800">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Shipping Address
            </p>
            <p className="mt-1 whitespace-pre-line text-sm">
              {invoice.customer.shipping_address}
            </p>
          </div>
        )}
      </section>

      {/* Invoice Information */}
      <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <h2 className="text-sm font-bold">Invoice Information</h2>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <DetailField
            label="Invoice Number"
            value={invoice.invoice_number}
          />

          <DetailField
            label="Purchase Order"
            value={invoice.po_number}
          />

          <DetailField
            label="Currency"
            value={invoice.currency}
          />

          <DetailField
            label="Exchange Rate"
            value={
              invoice.exchange_rate
                ? String(invoice.exchange_rate)
                : "1.0000"
            }
          />

          <DetailField
            label="Payment Terms"
            value={invoice.payment_terms_display}
          />

          <DetailField
            label="Tax Calculation"
            value={invoice.tax_calculation_method}
          />

          <DetailField
            label="Issue Date"
            value={dateText(invoice.issue_date)}
          />

          <DetailField
            label="Due Date"
            value={dateText(invoice.due_date)}
          />

          <DetailField
            label="Payment Date"
            value={dateText(invoice.payment_date)}
          />

          <DetailField
            label="Reminder Count"
            value={String(invoice.reminder_count || 0)}
          />

          {invoice.last_reminder_sent_at && (
            <DetailField
              label="Last Reminder"
              value={dateText(invoice.last_reminder_sent_at)}
            />
          )}

          {invoice.next_reminder_at && (
            <DetailField
              label="Next Reminder"
              value={dateText(invoice.next_reminder_at)}
            />
          )}
        </div>
      </section>

      {/* Invoice Items */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <h2 className="text-sm font-bold">Invoice Items</h2>
        </div>

        {items.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No invoice items found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px]">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800/50">
                <tr>
                  <th className="px-5 py-3 text-left">
                    Description
                  </th>
                  <th className="px-5 py-3 text-right">Qty</th>
                  <th className="px-5 py-3 text-right">
                    Unit Price
                  </th>
                  <th className="px-5 py-3 text-right">
                    Discount
                  </th>
                  <th className="px-5 py-3 text-right">Tax</th>
                  <th className="px-5 py-3 text-right">Total</th>
                </tr>
              </thead>

              <tbody className="divide-y dark:divide-gray-800">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-4 text-sm">
                      <p className="font-medium">
                        {item.description}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-right text-sm">
                      {item.quantity}
                    </td>

                    <td className="px-5 py-4 text-right text-sm">
                      {money(item.unit_price, currency)}
                    </td>

                    <td className="px-5 py-4 text-right text-sm">
                      {money(item.discount_amount || 0, currency)}
                    </td>

                    <td className="px-5 py-4 text-right text-sm">
                      {money(item.tax_amount || 0, currency)}
                      <span className="ml-1 text-xs text-gray-500">
                        ({Number(item.tax_rate || 0)}%)
                      </span>
                    </td>

                    <td className="px-5 py-4 text-right text-sm font-bold">
                      {money(item.line_total || 0, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-gray-200 p-5 dark:border-gray-800">
          <div className="ml-auto max-w-sm space-y-2.5">
            <SummaryRow
              label="Subtotal"
              value={money(invoice.subtotal || 0, currency)}
            />

            {Number(invoice.discount_amount || 0) > 0 && (
              <SummaryRow
                label="Discount"
                value={`-${money(
                  invoice.discount_amount,
                  currency
                )}`}
              />
            )}

            <SummaryRow
              label="Tax"
              value={money(invoice.tax_amount || 0, currency)}
            />

            {Number(invoice.shipping_cost || 0) > 0 && (
              <SummaryRow
                label="Shipping"
                value={money(
                  invoice.shipping_cost,
                  currency
                )}
              />
            )}

            {Number(invoice.shipping_tax || 0) > 0 && (
              <SummaryRow
                label="Shipping Tax"
                value={money(
                  invoice.shipping_tax,
                  currency
                )}
              />
            )}

            <div className="border-t border-gray-200 pt-3 dark:border-gray-800">
              <SummaryRow
                label="Total"
                value={money(totalAmount, currency)}
                strong
              />
            </div>
          </div>
        </div>
      </section>

      {/* Payment History */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 p-5 dark:border-gray-800">
          <div>
            <h2 className="text-sm font-bold">Payment History</h2>
            <p className="mt-1 text-xs text-gray-500">
              {payments.length} payment
              {payments.length !== 1 ? "s" : ""} recorded
            </p>
          </div>

          {amountDue > 0 && (
            <button
              onClick={() => setShowPaymentForm(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              <Plus size={14} />
              Add Payment
            </button>
          )}
        </div>

        {!payments.length ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No payments have been recorded for this invoice.
          </div>
        ) : (
          <div className="divide-y dark:divide-gray-800">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold">
                    {money(
                      payment.amount,
                      payment.currency || currency
                    )}
                  </p>

                  <p className="mt-1 text-xs capitalize text-gray-500">
                    {(payment.payment_method || "other")
                      .replace(/_/g, " ")}
                    {" · "}
                    {dateText(payment.payment_date)}
                  </p>

                  {payment.notes && (
                    <p className="mt-2 text-xs text-gray-500">
                      {payment.notes}
                    </p>
                  )}
                </div>

                <div className="text-left sm:text-right">
                  <p className="text-xs text-gray-500">
                    {payment.transaction_reference ||
                      "No reference"}
                  </p>

                  <p className="mt-2 text-xs">
                    <span
                      className={`rounded-full px-2.5 py-1 ${paymentStatusClass(
                        payment.status
                      )}`}
                    >
                      {payment.status}
                    </span>

                    {payment.reconciled && (
                      <span className="ml-2 text-green-600 dark:text-green-400">
                        Reconciled
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Notes */}
      {(invoice.notes ||
        invoice.internal_notes ||
        invoice.footer_text) && (
        <section className="grid gap-4 md:grid-cols-2">
          {invoice.notes && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <h2 className="text-sm font-bold">
                Customer Notes
              </h2>

              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">
                {invoice.notes}
              </p>
            </div>
          )}

          {invoice.internal_notes && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <h2 className="text-sm font-bold">
                Internal Notes
              </h2>

              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">
                {invoice.internal_notes}
              </p>
            </div>
          )}

          {invoice.footer_text && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <h2 className="text-sm font-bold">
                Footer Text
              </h2>

              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">
                {invoice.footer_text}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// 5. CUSTOMERS
function InvoiceCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const loadCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();
      if (search.trim()) {
        params.set("search", search.trim());
      }

      const response = await fetch(`/api/customers?${params.toString()}`, {
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load customers.");
      }

      const customersData = Array.isArray(data)
        ? data
        : data.customers || [];

      setCustomers(customersData);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load customers."
      );
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadCustomers();
    }, 300);

    return () => clearTimeout(timeout);
  }, [loadCustomers]);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Customers</h2>
          <p className="text-sm text-gray-500">
            {customers.length} customer
            {customers.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 sm:w-64 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          {/* Refresh */}
          <button
            onClick={loadCustomers}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          {/* Create */}
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Plus size={16} />
            Add Customer
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <div className="flex items-center gap-3">
            <AlertCircle size={18} />

            <span>{error}</span>

            <button
              onClick={loadCustomers}
              className="ml-auto rounded-lg p-1 transition hover:bg-red-100 dark:hover:bg-red-900/30"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Customer Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {customers.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
            <Users size={40} className="text-gray-400" />

            <h3 className="mt-4 font-semibold">
              {search.trim()
                ? "No customers found"
                : "No customers yet"}
            </h3>

            <p className="mt-1 text-sm text-gray-500">
              {search.trim()
                ? "Try a different search."
                : "Add your first customer to start creating invoices."}
            </p>

            {!search.trim() && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                <Plus size={16} />
                Add Customer
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-800/50">
                <tr>
                  <th className="px-5 py-3.5">Company</th>
                  <th className="px-5 py-3.5">Contact</th>
                  <th className="px-5 py-3.5">Email</th>
                  <th className="px-5 py-3.5">Phone</th>
                  <th className="px-5 py-3.5">Currency</th>
                  <th className="px-5 py-3.5">Type</th>
                  <th className="px-5 py-3.5">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="transition hover:bg-gray-50 dark:hover:bg-gray-800/40"
                  >
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold">
                        {customer.company_name}
                      </p>

                      {customer.tax_id && (
                        <p className="mt-1 text-xs text-gray-500">
                          Tax ID: {customer.tax_id}
                        </p>
                      )}
                    </td>

                    <td className="px-5 py-4 text-sm">
                      {customer.contact_name || "—"}
                    </td>

                    <td className="px-5 py-4 text-sm">
                      {customer.email || "—"}
                    </td>

                    <td className="px-5 py-4 text-sm">
                      {customer.phone || "—"}
                    </td>

                    <td className="px-5 py-4 text-sm">
                      {customer.currency || "USD"}
                    </td>

                    <td className="px-5 py-4 text-sm capitalize">
                      {(customer.customer_type || "company").replace(
                        "_",
                        " "
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          customer.status === "active"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : customer.status === "blocked"
                              ? "bg-red-500/10 text-red-700 dark:text-red-400"
                              : "bg-gray-500/10 text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {customer.status || "active"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Customer Modal */}
      {showCreate && (
        <CustomerCreateModal
          onClose={() => setShowCreate(false)}
          onCreated={loadCustomers}
        />
      )}
    </div>
  );
}


// 5a. CUSTOMER CREATE MODAL
function CustomerCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    website: "",
    billing_address: "",
    shipping_address: "",
    tax_id: "",
    tax_id_type: "vat",
    registration_number: "",
    currency: "USD",
    customer_type: "company",
    industry: "",
    notes: "",
  });

  const updateField = (
    field: keyof typeof form,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const submit = async () => {
    try {
      setLoading(true);
      setError("");

      if (!form.company_name.trim()) {
        throw new Error("Company name is required.");
      }

      if (
        form.email.trim() &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
      ) {
        throw new Error("Enter a valid email address.");
      }

      const payload = {
        company_name: form.company_name.trim(),
        contact_name: form.contact_name.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        website: form.website.trim() || null,
        billing_address: form.billing_address.trim() || null,
        shipping_address: form.shipping_address.trim() || null,
        tax_id: form.tax_id.trim() || null,
        tax_id_type: form.tax_id_type || null,
        registration_number:
          form.registration_number.trim() || null,
        currency: form.currency,
        customer_type: form.customer_type,
        industry: form.industry.trim() || null,
        notes: form.notes.trim() || null,
      };

      const response = await fetch("/api/customers", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to create customer."
        );
      }

      await onCreated();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create customer."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-gray-950">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
          <div>
            <h2 className="text-lg font-bold">
              Add Customer
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Add a customer for invoicing and payment tracking.
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-2 transition hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800"
          >
            <X size={19} />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle
              size={18}
              className="mt-0.5 shrink-0"
            />

            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <div className="space-y-5 p-6">
          {/* Basic Information */}
          <section>
            <h3 className="text-sm font-bold">
              Basic Information
            </h3>

            <div className="mt-4 space-y-4">
              <label>
                <FieldLabel>Company Name *</FieldLabel>

                <input
                  value={form.company_name}
                  onChange={(e) =>
                    updateField(
                      "company_name",
                      e.target.value
                    )
                  }
                  placeholder="Company name"
                  autoFocus
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
                />
              </label>

              <label>
                <FieldLabel>Contact Name</FieldLabel>

                <input
                  value={form.contact_name}
                  onChange={(e) =>
                    updateField(
                      "contact_name",
                      e.target.value
                    )
                  }
                  placeholder="Primary contact"
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <FieldLabel>Email</FieldLabel>

                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      updateField(
                        "email",
                        e.target.value
                      )
                    }
                    placeholder="customer@example.com"
                    className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
                  />
                </label>

                <label>
                  <FieldLabel>Phone</FieldLabel>

                  <input
                    value={form.phone}
                    onChange={(e) =>
                      updateField(
                        "phone",
                        e.target.value
                      )
                    }
                    placeholder="+254..."
                    className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
                  />
                </label>
              </div>

              <label>
                <FieldLabel>Website</FieldLabel>

                <input
                  value={form.website}
                  onChange={(e) =>
                    updateField(
                      "website",
                      e.target.value
                    )
                  }
                  placeholder="https://example.com"
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
                />
              </label>
            </div>
          </section>

          {/* Addresses */}
          <section>
            <h3 className="text-sm font-bold">
              Addresses
            </h3>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label>
                <FieldLabel>Billing Address</FieldLabel>

                <textarea
                  value={form.billing_address}
                  onChange={(e) =>
                    updateField(
                      "billing_address",
                      e.target.value
                    )
                  }
                  rows={4}
                  placeholder="Customer billing address"
                  className="w-full rounded-xl border border-gray-200 p-3 text-sm outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
                />
              </label>

              <label>
                <FieldLabel>Shipping Address</FieldLabel>

                <textarea
                  value={form.shipping_address}
                  onChange={(e) =>
                    updateField(
                      "shipping_address",
                      e.target.value
                    )
                  }
                  rows={4}
                  placeholder="Customer shipping address"
                  className="w-full rounded-xl border border-gray-200 p-3 text-sm outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
                />
              </label>
            </div>
          </section>

          {/* Tax & Registration */}
          <section>
            <h3 className="text-sm font-bold">
              Tax & Registration
            </h3>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label>
                <FieldLabel>Tax ID</FieldLabel>

                <input
                  value={form.tax_id}
                  onChange={(e) =>
                    updateField(
                      "tax_id",
                      e.target.value
                    )
                  }
                  placeholder="Tax identification number"
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
                />
              </label>

              <label>
                <FieldLabel>Tax ID Type</FieldLabel>

                <select
                  value={form.tax_id_type}
                  onChange={(e) =>
                    updateField(
                      "tax_id_type",
                      e.target.value
                    )
                  }
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="vat">VAT</option>
                  <option value="ein">EIN</option>
                  <option value="gst">GST</option>
                  <option value="kra_pin">KRA PIN</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label>
                <FieldLabel>
                  Registration Number
                </FieldLabel>

                <input
                  value={form.registration_number}
                  onChange={(e) =>
                    updateField(
                      "registration_number",
                      e.target.value
                    )
                  }
                  placeholder="Registration number"
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
                />
              </label>
            </div>
          </section>

          {/* Customer Classification */}
          <section>
            <h3 className="text-sm font-bold">
              Customer Classification
            </h3>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label>
                <FieldLabel>Currency</FieldLabel>

                <select
                  value={form.currency}
                  onChange={(e) =>
                    updateField(
                      "currency",
                      e.target.value
                    )
                  }
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  {CURRENCIES.map((curr) => (
                    <option key={curr} value={curr}>
                      {curr}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <FieldLabel>Customer Type</FieldLabel>

                <select
                  value={form.customer_type}
                  onChange={(e) =>
                    updateField(
                      "customer_type",
                      e.target.value
                    )
                  }
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="individual">
                    Individual
                  </option>
                  <option value="company">
                    Company
                  </option>
                  <option value="government">
                    Government
                  </option>
                  <option value="non_profit">
                    Non-Profit
                  </option>
                </select>
              </label>

              <label>
                <FieldLabel>Industry</FieldLabel>

                <input
                  value={form.industry}
                  onChange={(e) =>
                    updateField(
                      "industry",
                      e.target.value
                    )
                  }
                  placeholder="Industry"
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
                />
              </label>
            </div>
          </section>

          {/* Notes */}
          <section>
            <label>
              <FieldLabel>Notes</FieldLabel>

              <textarea
                value={form.notes}
                onChange={(e) =>
                  updateField("notes", e.target.value)
                }
                rows={4}
                placeholder="Additional customer information..."
                className="w-full rounded-xl border border-gray-200 p-3 text-sm outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex gap-3 border-t border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
          <button
            onClick={submit}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && (
              <Loader2
                size={17}
                className="animate-spin"
              />
            )}

            {loading
              ? "Creating Customer..."
              : "Create Customer"}
          </button>

          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-xl px-5 py-3 text-sm font-medium text-gray-500 transition hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// 6. PAYMENTS
function InvoicePayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showRecord, setShowRecord] = useState(false);

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [paymentsResponse, invoicesResponse] = await Promise.all([
        fetch("/api/payments?limit=50", {
          credentials: "include",
        }),

        fetch(
          "/api/invoices?status=paid&status=partially_paid&status=sent",
          {
            credentials: "include",
          }
        ),
      ]);

      const paymentsData = await paymentsResponse.json();
      const invoicesData = await invoicesResponse.json();

      if (!paymentsResponse.ok) {
        throw new Error(
          paymentsData.error || "Failed to load payments."
        );
      }

      if (!invoicesResponse.ok) {
        throw new Error(
          invoicesData.error || "Failed to load invoices."
        );
      }

      const paymentsList = Array.isArray(paymentsData)
        ? paymentsData
        : paymentsData.payments || [];

      const invoicesList = Array.isArray(invoicesData)
        ? invoicesData
        : invoicesData.invoices || [];

      setPayments(paymentsList);
      setInvoices(invoicesList);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load payments."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Payments</h2>

          <p className="text-sm text-gray-500">
            {payments.length} payment
            {payments.length !== 1 ? "s" : ""} recorded
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadPayments}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => setShowRecord(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Plus size={16} />
            Record Payment
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <div className="flex items-center gap-3">
            <AlertCircle size={18} />

            <span>{error}</span>

            <button
              type="button"
              onClick={loadPayments}
              className="ml-auto rounded-lg p-1 transition hover:bg-red-100 dark:hover:bg-red-900/30"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Payments Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {payments.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
            <CreditCard
              size={40}
              className="text-gray-400"
            />

            <h3 className="mt-4 font-semibold">
              No payments recorded
            </h3>

            <p className="mt-1 text-sm text-gray-500">
              Record your first payment to track customer payments.
            </p>

            <button
              type="button"
              onClick={() => setShowRecord(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <Plus size={16} />
              Record Payment
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-800/50">
                <tr>
                  <th className="px-5 py-3.5">
                    Invoice
                  </th>

                  <th className="px-5 py-3.5">
                    Customer
                  </th>

                  <th className="px-5 py-3.5">
                    Amount
                  </th>

                  <th className="px-5 py-3.5">
                    Method
                  </th>

                  <th className="px-5 py-3.5">
                    Reference
                  </th>

                  <th className="px-5 py-3.5">
                    Date
                  </th>

                  <th className="px-5 py-3.5">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {payments.map((payment) => {
                  const relatedInvoice = invoices.find(
                    (invoice) =>
                      invoice.id === payment.invoice_id
                  );

                  return (
                    <tr
                      key={payment.id}
                      className="transition hover:bg-gray-50 dark:hover:bg-gray-800/40"
                    >
                      {/* Invoice */}
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold">
                          {relatedInvoice?.invoice_number ||
                            payment.invoice_number ||
                            "—"}
                        </p>
                      </td>

                      {/* Customer */}
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium">
                          {relatedInvoice?.customer
                            ?.company_name ||
                            payment.customer?.company_name ||
                            "—"}
                        </p>
                      </td>

                      {/* Amount */}
                      <td className="px-5 py-4 text-sm font-semibold">
                        {money(
                          payment.amount,
                          payment.currency || "USD"
                        )}
                      </td>

                      {/* Method */}
                      <td className="px-5 py-4 text-sm capitalize">
                        {payment.payment_method
                          ? payment.payment_method.replace(
                              /_/g,
                              " "
                            )
                          : "—"}
                      </td>

                      {/* Reference */}
                      <td className="px-5 py-4 text-sm">
                        {payment.transaction_reference ||
                          "—"}
                      </td>

                      {/* Date */}
                      <td className="px-5 py-4 text-sm">
                        {dateText(payment.payment_date)}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${paymentStatusClass(
                            payment.status
                          )}`}
                        >
                          {payment.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      {showRecord && (
        <PaymentRecordModal
          invoices={invoices}
          onClose={() => setShowRecord(false)}
          onCreated={loadPayments}
        />
      )}
    </div>
  );
}


// 6a. PAYMENT RECORD MODAL
function PaymentRecordModal({
  invoices,
  onClose,
  onCreated,
}: {
  invoices: Invoice[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    invoice_id: "",
    amount: "",
    payment_method: "bank_transfer",
    transaction_reference: "",
    payment_date: today(),
    notes: "",
    status: "completed" as PaymentStatus,
  });

  const selectedInvoice = invoices.find(
    (invoice) => invoice.id === form.invoice_id
  );

  const updateForm = (
    field: keyof typeof form,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const submit = async () => {
    try {
      setLoading(true);
      setError("");

      // Validation
      if (!form.invoice_id) {
        throw new Error("Select an invoice.");
      }

      const amount = Number(form.amount);

      if (!form.amount || !Number.isFinite(amount) || amount <= 0) {
        throw new Error("Enter a valid payment amount.");
      }

      if (
        selectedInvoice &&
        amount > Number(selectedInvoice.amount_due)
      ) {
        throw new Error(
          `Amount cannot exceed the balance due (${money(
            selectedInvoice.amount_due,
            selectedInvoice.currency
          )}).`
        );
      }

      if (!form.payment_date) {
        throw new Error("Payment date is required.");
      }

      // API payload
      const payload = {
        invoice_id: form.invoice_id,
        amount,
        payment_method: form.payment_method,
        transaction_reference:
          form.transaction_reference.trim() || null,
        payment_date: form.payment_date,
        notes: form.notes.trim() || null,
        status: form.status,
      };

      // Create payment
      const response = await fetch("/api/payments", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to record payment."
        );
      }

      // Refresh payment list
      await onCreated();

      // Close modal
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to record payment."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-6">
      <div className="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 dark:bg-gray-950">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-bold">
              Record Payment
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              Record a customer payment against an invoice.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-2 transition hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800"
          >
            <X size={19} />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle
              size={18}
              className="mt-0.5 shrink-0"
            />

            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <div className="mt-5 space-y-4">
          {/* Invoice */}
          <label>
            <FieldLabel>Invoice *</FieldLabel>

            <select
              value={form.invoice_id}
              onChange={(e) =>
                updateForm("invoice_id", e.target.value)
              }
              disabled={loading}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="">
                Select invoice
              </option>

              {invoices.map((invoice) => (
                <option
                  key={invoice.id}
                  value={invoice.id}
                >
                  {invoice.invoice_number} — Balance:{" "}
                  {money(
                    invoice.amount_due,
                    invoice.currency
                  )}
                </option>
              ))}
            </select>
          </label>

          {/* Selected Invoice */}
          {selectedInvoice && (
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/60">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Invoice
                </span>

                <span className="text-sm font-semibold">
                  {selectedInvoice.invoice_number}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Customer
                </span>

                <span className="text-sm">
                  {selectedInvoice.customer
                    ?.company_name || "—"}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2 dark:border-gray-700">
                <span className="text-xs text-gray-500">
                  Balance Due
                </span>

                <span className="text-sm font-bold">
                  {money(
                    selectedInvoice.amount_due,
                    selectedInvoice.currency
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Amount + Method */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <FieldLabel>Amount *</FieldLabel>

              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) =>
                  updateForm("amount", e.target.value)
                }
                disabled={loading}
                placeholder="0.00"
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-blue-500 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            <label>
              <FieldLabel>Payment Method *</FieldLabel>

              <select
                value={form.payment_method}
                onChange={(e) =>
                  updateForm(
                    "payment_method",
                    e.target.value
                  )
                }
                disabled={loading}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900"
              >
                {PAYMENT_METHODS.map((method) => (
                  <option
                    key={method}
                    value={method}
                  >
                    {method
                      .replace(/_/g, " ")
                      .toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Reference + Date */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <FieldLabel>
                Transaction Reference
              </FieldLabel>

              <input
                value={form.transaction_reference}
                onChange={(e) =>
                  updateForm(
                    "transaction_reference",
                    e.target.value
                  )
                }
                disabled={loading}
                placeholder="Transaction ID or check number"
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-blue-500 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            <label>
              <FieldLabel>Payment Date *</FieldLabel>

              <input
                type="date"
                value={form.payment_date}
                onChange={(e) =>
                  updateForm(
                    "payment_date",
                    e.target.value
                  )
                }
                disabled={loading}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
          </div>

          {/* Status */}
          <label>
            <FieldLabel>Status</FieldLabel>

            <select
              value={form.status}
              onChange={(e) =>
                updateForm(
                  "status",
                  e.target.value
                )
              }
              disabled={loading}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900"
            >
              {PAYMENT_STATUSES.map((status) => (
                <option
                  key={status}
                  value={status}
                >
                  {status
                    .replace(/_/g, " ")
                    .toUpperCase()}
                </option>
              ))}
            </select>
          </label>

          {/* Notes */}
          <label>
            <FieldLabel>Notes</FieldLabel>

            <textarea
              value={form.notes}
              onChange={(e) =>
                updateForm("notes", e.target.value)
              }
              disabled={loading}
              rows={4}
              placeholder="Additional payment notes..."
              className="w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-blue-500 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
        </div>

        {/* Footer */}
        <div className="mt-6 flex gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && (
              <Loader2
                size={16}
                className="animate-spin"
              />
            )}

            {loading
              ? "Recording..."
              : "Record Payment"}
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 text-sm text-gray-500 transition hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}


// 7. PRODUCTS
function InvoiceProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const query = search.trim()
        ? `?search=${encodeURIComponent(search.trim())}`
        : "";

      const response = await fetch(`/api/products${query}`, {
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load products.");
      }

      setProducts(
        Array.isArray(data) ? data : Array.isArray(data.products) ? data.products : []
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load products."
      );
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadProducts();
    }, 350);

    return () => window.clearTimeout(timer);
  }, [loadProducts]);

  const toggleProductStatus = async (product: Product) => {
    try {
      setActionLoading(product.id);
      setError("");

      const nextActive = product.is_active === false;

      const response = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          is_active: nextActive,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to update product status."
        );
      }

      await loadProducts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update product status."
      );
    } finally {
      setActionLoading(null);
    }
  };

  if (loading && products.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-bold">Products & Services</h2>
          <p className="mt-1 text-sm text-gray-500">
            {products.length} {products.length === 1 ? "item" : "items"}{" "}
            available
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-9 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 sm:w-72 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />

            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-700 dark:hover:text-white"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 active:bg-blue-800"
          >
            <Plus size={16} />
            Add Product
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{error}</p>
            </div>

            <button
              onClick={loadProducts}
              className="rounded-lg p-1.5 transition hover:bg-red-100 dark:hover:bg-red-900/30"
              title="Retry"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Products */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {products.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10">
              <Package size={32} className="text-blue-600 dark:text-blue-400" />
            </div>

            <h3 className="mt-5 font-semibold">
              {search ? "No products found" : "No products yet"}
            </h3>

            <p className="mt-1 max-w-sm text-sm text-gray-500">
              {search
                ? `No products or services match "${search}".`
                : "Add your first product or service to start creating professional invoices."}
            </p>

            {!search && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                <Plus size={16} />
                Add Product
              </button>
            )}

            {search && (
              <button
                onClick={() => setSearch("")}
                className="mt-5 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop/table view */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] text-left">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-800/50">
                  <tr>
                    <th className="px-5 py-3.5">Product / Service</th>
                    <th className="px-5 py-3.5">SKU</th>
                    <th className="px-5 py-3.5">Category</th>
                    <th className="px-5 py-3.5 text-right">Unit Price</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {products.map((product) => {
                    const isActive = product.is_active !== false;
                    const currency =
                      (product as Product & { currency?: string }).currency ||
                      "USD";

                    return (
                      <tr
                        key={product.id}
                        className="transition hover:bg-gray-50 dark:hover:bg-gray-800/40"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                              <Package
                                size={17}
                                className="text-blue-600 dark:text-blue-400"
                              />
                            </div>

                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">
                                {product.name}
                              </p>

                              {product.description && (
                                <p className="mt-0.5 max-w-xs truncate text-xs text-gray-500">
                                  {product.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {product.sku || "—"}
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {product.category || "—"}
                        </td>

                        <td className="px-5 py-4 text-right text-sm font-semibold">
                          {money(product.unit_price, currency)}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                              isActive
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                : "bg-gray-500/10 text-gray-600 dark:text-gray-400"
                            }`}
                          >
                            {isActive ? "Active" : "Inactive"}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingProduct(product)}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              disabled={actionLoading === product.id}
                              onClick={() => toggleProductStatus(product)}
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                                isActive
                                  ? "bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-400"
                                  : "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
                              }`}
                            >
                              {actionLoading === product.id
                                ? "Updating..."
                                : isActive
                                ? "Deactivate"
                                : "Activate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y divide-gray-100 md:hidden dark:divide-gray-800">
              {products.map((product) => {
                const isActive = product.is_active !== false;
                const currency =
                  (product as Product & { currency?: string }).currency ||
                  "USD";

                return (
                  <div key={product.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                          <Package
                            size={18}
                            className="text-blue-600 dark:text-blue-400"
                          />
                        </div>

                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold">
                            {product.name}
                          </h3>

                          {product.sku && (
                            <p className="mt-0.5 text-xs text-gray-500">
                              SKU: {product.sku}
                            </p>
                          )}
                        </div>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          isActive
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-gray-500/10 text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {isActive ? "Active" : "Inactive"}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-500">
                          Category
                        </p>
                        <p className="mt-1 text-sm font-medium">
                          {product.category || "—"}
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-500">
                          Unit Price
                        </p>
                        <p className="mt-1 text-sm font-semibold">
                          {money(product.unit_price, currency)}
                        </p>
                      </div>
                    </div>

                    {product.description && (
                      <p className="mt-3 text-xs leading-5 text-gray-500">
                        {product.description}
                      </p>
                    )}

                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingProduct(product)}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        disabled={actionLoading === product.id}
                        onClick={() => toggleProductStatus(product)}
                        className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${
                          isActive
                            ? "bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-400"
                            : "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
                        }`}
                      >
                        {actionLoading === product.id
                          ? "Updating..."
                          : isActive
                          ? "Deactivate"
                          : "Activate"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Create */}
      {showCreate && (
        <ProductCreateModal
          onClose={() => setShowCreate(false)}
          onCreated={loadProducts}
        />
      )}

      {/* Edit */}
      {editingProduct && (
        <ProductCreateModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onCreated={loadProducts}
        />
      )}
    </div>
  );
}

// 7a. Product Create / Edit Modal
function ProductCreateModal({
  product,
  onClose,
  onCreated,
}: {
  product?: Product | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const isEditing = Boolean(product);

  const [loading, setLoading] = useState(false);
  const [taxLoading, setTaxLoading] = useState(true);
  const [error, setError] = useState("");
  const [taxRates, setTaxRates] = useState<
    Array<{
      id: string;
      name?: string;
      rate?: number;
      percentage?: number;
    }>
  >([]);

  const existingProduct = product as
    | (Product & {
        currency?: string;
        tax_rate_id?: string;
      })
    | null
    | undefined;

  const [form, setForm] = useState({
    name: product?.name || "",
    description: product?.description || "",
    sku: product?.sku || "",
    unit_price:
      product?.unit_price !== undefined && product?.unit_price !== null
        ? String(product.unit_price)
        : "",
    category: product?.category || "",
    notes: product?.notes || "",
    tax_rate_id: existingProduct?.tax_rate_id || "",
    currency: existingProduct?.currency || "USD",
  });

  useEffect(() => {
    let cancelled = false;

    const loadTaxRates = async () => {
      try {
        setTaxLoading(true);

        const response = await fetch("/api/tax-rates", {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to load tax rates.");
        }

        const data = await response.json();

        const rates = Array.isArray(data)
          ? data
          : Array.isArray(data.tax_rates)
          ? data.tax_rates
          : [];

        if (!cancelled) {
          setTaxRates(rates);
        }
      } catch {
        if (!cancelled) {
          setTaxRates([]);
        }
      } finally {
        if (!cancelled) {
          setTaxLoading(false);
        }
      }
    };

    loadTaxRates();

    return () => {
      cancelled = true;
    };
  }, []);

  const updateField = (
    field: keyof typeof form,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const submit = async () => {
    try {
      setLoading(true);
      setError("");

      if (!form.name.trim()) {
        throw new Error("Product name is required.");
      }

      if (
        form.unit_price === "" ||
        Number.isNaN(Number(form.unit_price)) ||
        Number(form.unit_price) < 0
      ) {
        throw new Error("Enter a valid unit price.");
      }

      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        sku: form.sku.trim() || null,
        unit_price: Number(form.unit_price),
        category: form.category.trim() || null,
        notes: form.notes.trim() || null,
        tax_rate_id: form.tax_rate_id || null,
        currency: form.currency,
        is_active: product?.is_active !== false,
      };

      const response = await fetch(
        isEditing ? `/api/products/${product?.id}` : "/api/products",
        {
          method: isEditing ? "PATCH" : "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            (isEditing
              ? "Failed to update product."
              : "Failed to create product.")
        );
      }

      await onCreated();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isEditing
          ? "Failed to update product."
          : "Failed to create product."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-950">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 sm:px-6 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-bold">
              {isEditing ? "Edit Product" : "Add Product"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {isEditing
                ? "Update product or service information."
                : "Add a product or service for invoicing."}
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-2 transition hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800"
          >
            <X size={19} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-5 sm:px-6">
          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-5">
            {/* Basic information */}
            <div>
              <h3 className="text-sm font-semibold">Basic Information</h3>
              <p className="mt-1 text-xs text-gray-500">
                Enter the details customers will see on invoices.
              </p>
            </div>

            <label className="block">
              <FieldLabel>Name *</FieldLabel>
              <input
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="e.g. Website Design"
                autoFocus
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            <label className="block">
              <FieldLabel>Description</FieldLabel>
              <textarea
                value={form.description}
                onChange={(e) =>
                  updateField("description", e.target.value)
                }
                rows={3}
                placeholder="Describe the product or service..."
                className="w-full resize-y rounded-xl border border-gray-200 p-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            {/* Product details */}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <FieldLabel>SKU</FieldLabel>
                <input
                  value={form.sku}
                  onChange={(e) => updateField("sku", e.target.value)}
                  placeholder="e.g. WEB-001"
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-gray-700 dark:bg-gray-900"
                />
              </label>

              <label className="block">
                <FieldLabel>Category</FieldLabel>
                <input
                  value={form.category}
                  onChange={(e) =>
                    updateField("category", e.target.value)
                  }
                  placeholder="e.g. Consulting"
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-gray-700 dark:bg-gray-900"
                />
              </label>
            </div>

            {/* Pricing */}
            <div>
              <h3 className="text-sm font-semibold">Pricing & Tax</h3>
              <p className="mt-1 text-xs text-gray-500">
                Set the default price, currency, and tax treatment.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <FieldLabel>Unit Price *</FieldLabel>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.unit_price}
                  onChange={(e) =>
                    updateField("unit_price", e.target.value)
                  }
                  placeholder="0.00"
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-gray-700 dark:bg-gray-900"
                />
              </label>

              <label className="block">
                <FieldLabel>Currency</FieldLabel>
                <select
                  value={form.currency}
                  onChange={(e) =>
                    updateField("currency", e.target.value)
                  }
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-gray-700 dark:bg-gray-900"
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <FieldLabel>Tax Rate</FieldLabel>
              <select
                value={form.tax_rate_id}
                onChange={(e) =>
                  updateField("tax_rate_id", e.target.value)
                }
                disabled={taxLoading}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="">
                  {taxLoading ? "Loading tax rates..." : "No tax"}
                </option>

                {taxRates.map((tax) => {
                  const rate =
                    tax.rate !== undefined
                      ? tax.rate
                      : tax.percentage !== undefined
                      ? tax.percentage
                      : 0;

                  return (
                    <option key={tax.id} value={tax.id}>
                      {tax.name || `Tax ${rate}%`} — {rate}%
                    </option>
                  );
                })}
              </select>
            </label>

            {/* Notes */}
            <label className="block">
              <FieldLabel>Internal Notes</FieldLabel>
              <textarea
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                rows={3}
                placeholder="Notes for your team..."
                className="w-full resize-y rounded-xl border border-gray-200 p-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 gap-3 border-t border-gray-200 px-5 py-4 sm:px-6 dark:border-gray-800">
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? isEditing
                ? "Saving..."
                : "Creating..."
              : isEditing
              ? "Save Changes"
              : "Add Product"}
          </button>

          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-500 transition hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// 8. INVOICE SETTINGS
function InvoiceSettings() {
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [bankDetailsText, setBankDetailsText] = useState("");

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const response = await fetch("/api/invoice-settings", {
        credentials: "include",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load invoice settings.");
      }

      const loadedSettings = data.settings || data;

      setSettings(loadedSettings);

      setBankDetailsText(
        loadedSettings.bank_details
          ? JSON.stringify(loadedSettings.bank_details, null, 2)
          : ""
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load invoice settings."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSetting = <K extends keyof InvoiceSettings>(
    key: K,
    value: InvoiceSettings[K]
  ) => {
    setSettings((current) =>
      current ? { ...current, [key]: value } : current
    );

    setSuccess("");
  };

  const saveSettings = async () => {
    if (!settings) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      let parsedBankDetails = settings.bank_details || null;

      if (bankDetailsText.trim()) {
        try {
          parsedBankDetails = JSON.parse(bankDetailsText);
        } catch {
          throw new Error(
            "Bank Details contains invalid JSON. Please correct it before saving."
          );
        }
      } else {
        parsedBankDetails = null;
      }

      const payload = {
        company_name: settings.company_name || "",
        company_registration_number:
          settings.company_registration_number || "",
        company_email: settings.company_email || "",
        company_phone: settings.company_phone || "",
        company_tax_id: settings.company_tax_id || "",
        company_logo_url: settings.company_logo_url || "",
        company_address: settings.company_address || "",
        company_website: settings.company_website || "",

        invoice_prefix: settings.invoice_prefix || "INV-",
        invoice_next_number: Math.max(
          1,
          Number(settings.invoice_next_number) || 1
        ),
        invoice_number_padding: Math.min(
          10,
          Math.max(1, Number(settings.invoice_number_padding) || 4)
        ),
        invoice_number_format:
          settings.invoice_number_format || "{prefix}{number}",

        credit_note_prefix: settings.credit_note_prefix || "CN-",
        credit_note_next_number: Math.max(
          1,
          Number(settings.credit_note_next_number) || 1
        ),

        default_currency: settings.default_currency || "USD",
        default_due_days: Math.max(
          0,
          Number(settings.default_due_days) || 0
        ),
        default_tax_calculation:
          settings.default_tax_calculation === "inclusive"
            ? "inclusive"
            : "exclusive",

        payment_instructions: settings.payment_instructions || "",
        bank_details: parsedBankDetails,

        reminder_enabled: Boolean(settings.reminder_enabled),
        reminder_days_before: Math.max(
          0,
          Number(settings.reminder_days_before) || 0
        ),
        reminder_after_days: Math.max(
          0,
          Number(settings.reminder_after_days) || 0
        ),
        reminder_after_days_2: Math.max(
          0,
          Number(settings.reminder_after_days_2) || 0
        ),
        reminder_grace_period_days: Math.max(
          0,
          Number(settings.reminder_grace_period_days) || 0
        ),

        email_subject_template:
          settings.email_subject_template ||
          "Invoice {invoice_number} from {company_name}",

        email_body_template:
          settings.email_body_template ||
          "Dear {customer_name},\n\nPlease find attached invoice {invoice_number} for {total}.\n\nPayment is due on {due_date}.\n\nThank you,\n{company_name}",

        terms_and_conditions: settings.terms_and_conditions || "",

        auto_send_enabled: Boolean(settings.auto_send_enabled),
        auto_pay_enabled: Boolean(settings.auto_pay_enabled),
        require_approval: Boolean(settings.require_approval),
        allow_partial_payments: Boolean(
          settings.allow_partial_payments
        ),
        allow_credit_notes: Boolean(settings.allow_credit_notes),
      };

      const response = await fetch("/api/invoice-settings", {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to save invoice settings."
        );
      }

      const savedSettings = data.settings || data;

      setSettings(savedSettings);

      setBankDetailsText(
        savedSettings.bank_details
          ? JSON.stringify(savedSettings.bank_details, null, 2)
          : ""
      );

      setSuccess("Invoice settings saved successfully.");

      window.setTimeout(() => {
        setSuccess("");
      }, 4000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save invoice settings."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!settings) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <div className="flex items-start gap-3">
            <AlertCircle size={19} className="mt-0.5 shrink-0" />
            <div>
              <h3 className="font-semibold">
                Could not load invoice settings
              </h3>
              <p className="mt-1 text-sm">
                {error || "The invoicing configuration could not be loaded."}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={loadSettings}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    );
  }

  const invoicePadding = Math.min(
    10,
    Math.max(1, Number(settings.invoice_number_padding) || 4)
  );

  const invoiceNumberPreview = String(
    Math.max(1, Number(settings.invoice_next_number) || 1)
  ).padStart(invoicePadding, "0");

  const creditNoteNumberPreview = String(
    Math.max(1, Number(settings.credit_note_next_number) || 1)
  ).padStart(invoicePadding, "0");

  const invoiceFormatPreview = (
    settings.invoice_number_format || "{prefix}{number}"
  )
    .replace(
      "{prefix}",
      settings.invoice_prefix || "INV-"
    )
    .replace("{number}", invoiceNumberPreview);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Invoice Settings</h2>
          <p className="mt-1 text-sm text-gray-500">
            Control how invoices, payments, numbering, reminders, emails,
            and invoice documents work across your business.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadSettings}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <RefreshCw size={16} />
            Reload
          </button>

          <button
            onClick={saveSettings}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <Save size={17} />
            )}
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Something went wrong</p>
            <p className="mt-1">{error}</p>
          </div>
          <button
            onClick={() => setError("")}
            className="rounded-lg p-1 hover:bg-red-100 dark:hover:bg-red-900/30"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Success */}
      {success && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="space-y-6">
        {/* Company Details */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
              <Building2 size={18} />
            </div>

            <div>
              <h3 className="text-sm font-bold">Company Details</h3>
              <p className="mt-1 text-xs text-gray-500">
                These details are used on generated invoices, receipts,
                credit notes, emails, and other customer-facing documents.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label>
              <FieldLabel>Company Name *</FieldLabel>
              <input
                value={settings.company_name || ""}
                onChange={(e) =>
                  updateSetting("company_name", e.target.value)
                }
                placeholder="Your company name"
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            <label>
              <FieldLabel>Registration Number</FieldLabel>
              <input
                value={settings.company_registration_number || ""}
                onChange={(e) =>
                  updateSetting(
                    "company_registration_number",
                    e.target.value
                  )
                }
                placeholder="Business registration number"
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            <label>
              <FieldLabel>Email</FieldLabel>
              <input
                type="email"
                value={settings.company_email || ""}
                onChange={(e) =>
                  updateSetting("company_email", e.target.value)
                }
                placeholder="billing@company.com"
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            <label>
              <FieldLabel>Phone</FieldLabel>
              <input
                value={settings.company_phone || ""}
                onChange={(e) =>
                  updateSetting("company_phone", e.target.value)
                }
                placeholder="+254..."
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            <label>
              <FieldLabel>Tax ID / PIN</FieldLabel>
              <input
                value={settings.company_tax_id || ""}
                onChange={(e) =>
                  updateSetting("company_tax_id", e.target.value)
                }
                placeholder="Tax identification number"
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            <label>
              <FieldLabel>Logo URL</FieldLabel>
              <input
                value={settings.company_logo_url || ""}
                onChange={(e) =>
                  updateSetting("company_logo_url", e.target.value)
                }
                placeholder="https://..."
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            <label className="sm:col-span-2">
              <FieldLabel>Business Address</FieldLabel>
              <textarea
                value={settings.company_address || ""}
                onChange={(e) =>
                  updateSetting("company_address", e.target.value)
                }
                rows={3}
                placeholder="Physical or postal business address"
                className="w-full rounded-xl border border-gray-200 p-3 text-sm outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            <label className="sm:col-span-2">
              <FieldLabel>Website</FieldLabel>
              <input
                type="url"
                value={settings.company_website || ""}
                onChange={(e) =>
                  updateSetting("company_website", e.target.value)
                }
                placeholder="https://yourcompany.com"
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
          </div>
        </section>

        {/* Invoice Numbering */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-violet-500/10 p-2 text-violet-600 dark:text-violet-400">
              <Hash size={18} />
            </div>

            <div>
              <h3 className="text-sm font-bold">Invoice Numbering</h3>
              <p className="mt-1 text-xs text-gray-500">
                Controls the invoice numbers generated by the invoicing
                system.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label>
              <FieldLabel>Invoice Prefix</FieldLabel>
              <input
                value={settings.invoice_prefix || ""}
                onChange={(e) =>
                  updateSetting("invoice_prefix", e.target.value)
                }
                placeholder="INV-"
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            <label>
              <FieldLabel>Next Invoice Number</FieldLabel>
              <input
                type="number"
                min="1"
                value={settings.invoice_next_number ?? 1}
                onChange={(e) =>
                  updateSetting(
                    "invoice_next_number",
                    Math.max(1, Number(e.target.value) || 1)
                  )
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            <label>
              <FieldLabel>Number Padding</FieldLabel>
              <input
                type="number"
                min="1"
                max="10"
                value={invoicePadding}
                onChange={(e) =>
                  updateSetting(
                    "invoice_number_padding",
                    Math.min(
                      10,
                      Math.max(1, Number(e.target.value) || 1)
                    )
                  )
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            <label>
              <FieldLabel>Number Format</FieldLabel>
              <input
                value={
                  settings.invoice_number_format ||
                  "{prefix}{number}"
                }
                onChange={(e) =>
                  updateSetting(
                    "invoice_number_format",
                    e.target.value
                  )
                }
                placeholder="{prefix}{number}"
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                Next Invoice Preview
              </p>
              <p className="mt-2 text-xl font-bold text-gray-900 dark:text-white">
                {invoiceFormatPreview}
              </p>
            </div>

            <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 dark:border-purple-900/40 dark:bg-purple-950/20">
              <p className="text-xs font-medium text-purple-600 dark:text-purple-400">
                Next Credit Note Preview
              </p>
              <p className="mt-2 text-xl font-bold text-gray-900 dark:text-white">
                {settings.credit_note_prefix || "CN-"}
                {creditNoteNumberPreview}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label>
              <FieldLabel>Credit Note Prefix</FieldLabel>
              <input
                value={settings.credit_note_prefix || ""}
                onChange={(e) =>
                  updateSetting(
                    "credit_note_prefix",
                    e.target.value
                  )
                }
                placeholder="CN-"
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            <label>
              <FieldLabel>Next Credit Note Number</FieldLabel>
              <input
                type="number"
                min="1"
                value={settings.credit_note_next_number ?? 1}
                onChange={(e) =>
                  updateSetting(
                    "credit_note_next_number",
                    Math.max(1, Number(e.target.value) || 1)
                  )
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
          </div>
        </section>

        {/* Defaults */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-bold">Invoice Defaults</h3>
          <p className="mt-1 text-xs text-gray-500">
            These values are automatically applied when creating new
            invoices.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label>
              <FieldLabel>Default Currency</FieldLabel>
              <select
                value={settings.default_currency || "USD"}
                onChange={(e) =>
                  updateSetting(
                    "default_currency",
                    e.target.value
                  )
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              >
                {CURRENCIES.map((curr) => (
                  <option key={curr} value={curr}>
                    {curr}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <FieldLabel>Default Due Days</FieldLabel>
              <input
                type="number"
                min="0"
                value={settings.default_due_days ?? 0}
                onChange={(e) =>
                  updateSetting(
                    "default_due_days",
                    Math.max(0, Number(e.target.value) || 0)
                  )
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            <label>
              <FieldLabel>Tax Calculation</FieldLabel>
              <select
                value={
                  settings.default_tax_calculation === "inclusive"
                    ? "inclusive"
                    : "exclusive"
                }
                onChange={(e) =>
                  updateSetting(
                    "default_tax_calculation",
                    e.target.value
                  )
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="exclusive">Tax Exclusive</option>
                <option value="inclusive">Tax Inclusive</option>
              </select>
            </label>
          </div>
        </section>

        {/* Payment Instructions */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
              <CreditCard size={18} />
            </div>

            <div>
              <h3 className="text-sm font-bold">
                Payment Instructions
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                These details can appear on invoices so customers know
                how to pay.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <label>
              <FieldLabel>Payment Instructions</FieldLabel>
              <textarea
                value={settings.payment_instructions || ""}
                onChange={(e) =>
                  updateSetting(
                    "payment_instructions",
                    e.target.value
                  )
                }
                rows={5}
                placeholder="Payment is due via bank transfer, M-Pesa, cheque, etc."
                className="w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            <label>
              <FieldLabel>Bank Details</FieldLabel>
              <textarea
                value={bankDetailsText}
                onChange={(e) => {
                  setBankDetailsText(e.target.value);
                  setSuccess("");
                }}
                rows={7}
                spellCheck={false}
                className="w-full rounded-xl border border-gray-200 p-3 font-mono text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
                placeholder={`{
  "bank_name": "Bank Name",
  "account_name": "Account Name",
  "account_number": "123456789",
  "branch": "Main Branch",
  "swift_code": "XXXXXXXX"
}`}
              />
              <p className="mt-2 text-xs text-gray-500">
                Enter valid JSON. These details can be used by the
                invoice/PDF system when displaying payment information.
              </p>
            </label>
          </div>
        </section>

        {/* Payment Reminders */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-bold">Payment Reminders</h3>
          <p className="mt-1 text-xs text-gray-500">
            Configure when customers should receive payment reminders
            for unpaid invoices.
          </p>

          <div className="mt-5 space-y-5">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={Boolean(settings.reminder_enabled)}
                onChange={(e) =>
                  updateSetting(
                    "reminder_enabled",
                    e.target.checked
                  )
                }
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium">
                Enable automated payment reminders
              </span>
            </label>

            <div
              className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${
                !settings.reminder_enabled
                  ? "opacity-50"
                  : ""
              }`}
            >
              <label>
                <FieldLabel>Days Before Due</FieldLabel>
                <input
                  type="number"
                  min="0"
                  disabled={!settings.reminder_enabled}
                  value={settings.reminder_days_before ?? 0}
                  onChange={(e) =>
                    updateSetting(
                      "reminder_days_before",
                      Math.max(
                        0,
                        Number(e.target.value) || 0
                      )
                    )
                  }
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm disabled:cursor-not-allowed dark:border-gray-700 dark:bg-gray-900"
                />
              </label>

              <label>
                <FieldLabel>Days After Due (1st)</FieldLabel>
                <input
                  type="number"
                  min="0"
                  disabled={!settings.reminder_enabled}
                  value={settings.reminder_after_days ?? 0}
                  onChange={(e) =>
                    updateSetting(
                      "reminder_after_days",
                      Math.max(
                        0,
                        Number(e.target.value) || 0
                      )
                    )
                  }
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm disabled:cursor-not-allowed dark:border-gray-700 dark:bg-gray-900"
                />
              </label>

              <label>
                <FieldLabel>Days After Due (2nd)</FieldLabel>
                <input
                  type="number"
                  min="0"
                  disabled={!settings.reminder_enabled}
                  value={settings.reminder_after_days_2 ?? 0}
                  onChange={(e) =>
                    updateSetting(
                      "reminder_after_days_2",
                      Math.max(
                        0,
                        Number(e.target.value) || 0
                      )
                    )
                  }
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm disabled:cursor-not-allowed dark:border-gray-700 dark:bg-gray-900"
                />
              </label>

              <label>
                <FieldLabel>Grace Period Days</FieldLabel>
                <input
                  type="number"
                  min="0"
                  disabled={!settings.reminder_enabled}
                  value={
                    settings.reminder_grace_period_days ?? 0
                  }
                  onChange={(e) =>
                    updateSetting(
                      "reminder_grace_period_days",
                      Math.max(
                        0,
                        Number(e.target.value) || 0
                      )
                    )
                  }
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm disabled:cursor-not-allowed dark:border-gray-700 dark:bg-gray-900"
                />
              </label>
            </div>
          </div>
        </section>

        {/* Email Templates */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-sky-500/10 p-2 text-sky-600 dark:text-sky-400">
              <Mail size={18} />
            </div>

            <div>
              <h3 className="text-sm font-bold">Invoice Email Templates</h3>
              <p className="mt-1 text-xs text-gray-500">
                Controls the email subject and body used when invoices
                are sent to customers.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <label>
              <FieldLabel>Email Subject</FieldLabel>
              <input
                value={settings.email_subject_template || ""}
                onChange={(e) =>
                  updateSetting(
                    "email_subject_template",
                    e.target.value
                  )
                }
                placeholder="Invoice {invoice_number} from {company_name}"
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            <label>
              <FieldLabel>Email Body</FieldLabel>
              <textarea
                value={settings.email_body_template || ""}
                onChange={(e) =>
                  updateSetting(
                    "email_body_template",
                    e.target.value
                  )
                }
                rows={8}
                className="w-full rounded-xl border border-gray-200 p-3 font-mono text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
                placeholder={`Dear {customer_name},

Please find attached invoice {invoice_number} for {total}.

Payment is due on {due_date}.

Thank you,
{company_name}`}
              />

              <div className="mt-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-500 dark:bg-gray-800/60">
                <p className="font-semibold text-gray-700 dark:text-gray-300">
                  Available variables
                </p>
                <p className="mt-1">
                  {"{invoice_number}"} · {"{customer_name}"} ·{" "}
                  {"{total}"} · {"{due_date}"} ·{" "}
                  {"{company_name}"}
                </p>
              </div>
            </label>
          </div>
        </section>

        {/* Terms & Conditions */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-bold">
            Terms & Conditions
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            These terms can be automatically displayed on generated
            invoices.
          </p>

          <textarea
            value={settings.terms_and_conditions || ""}
            onChange={(e) =>
              updateSetting(
                "terms_and_conditions",
                e.target.value
              )
            }
            rows={8}
            placeholder="Payment terms, late payment policy, refund policy, and other conditions..."
            className="mt-5 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
          />
        </section>

        {/* Feature Controls */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
              <Settings2 size={18} />
            </div>

            <div>
              <h3 className="text-sm font-bold">
                Invoice Feature Controls
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                These switches control invoice workflow behavior across
                the application.
              </p>
            </div>
          </div>

          <div className="mt-5 divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            <label className="flex cursor-pointer items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-semibold">
                  Auto-send invoices
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Automatically send an invoice to the customer after
                  it is created.
                </p>
              </div>

              <input
                type="checkbox"
                checked={Boolean(settings.auto_send_enabled)}
                onChange={(e) =>
                  updateSetting(
                    "auto_send_enabled",
                    e.target.checked
                  )
                }
                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-semibold">
                  Auto-pay
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Allow the configured payment workflow to automatically
                  process eligible payments.
                </p>
              </div>

              <input
                type="checkbox"
                checked={Boolean(settings.auto_pay_enabled)}
                onChange={(e) =>
                  updateSetting(
                    "auto_pay_enabled",
                    e.target.checked
                  )
                }
                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-semibold">
                  Require approval before sending
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Prevent invoices from being sent until an authorized
                  user approves them.
                </p>
              </div>

              <input
                type="checkbox"
                checked={Boolean(settings.require_approval)}
                onChange={(e) =>
                  updateSetting(
                    "require_approval",
                    e.target.checked
                  )
                }
                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-semibold">
                  Allow partial payments
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Allow customers to pay only part of an invoice balance.
                </p>
              </div>

              <input
                type="checkbox"
                checked={Boolean(
                  settings.allow_partial_payments
                )}
                onChange={(e) =>
                  updateSetting(
                    "allow_partial_payments",
                    e.target.checked
                  )
                }
                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-semibold">
                  Allow credit notes
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Enable creation and management of credit notes against
                  invoices.
                </p>
              </div>

              <input
                type="checkbox"
                checked={Boolean(settings.allow_credit_notes)}
                onChange={(e) =>
                  updateSetting(
                    "allow_credit_notes",
                    e.target.checked
                  )
                }
                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </label>
          </div>
        </section>

        {/* Save Footer */}
        <div className="sticky bottom-4 z-20 rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-lg backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">
                Invoice configuration
              </p>
              <p className="text-xs text-gray-500">
                Changes affect how this invoicing workspace creates and
                manages invoices.
              </p>
            </div>

            <button
              onClick={saveSettings}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <Save size={17} />
              )}
              {saving ? "Saving Changes..." : "Save Invoice Settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   MAIN INVOICE COMPONENT
========================================================= */

export default function Invoices({ activePage = "invoice-overview" }: { activePage?: InvoicePage }) {
  const renderPage = () => {
    switch (activePage) {
      case "invoice-overview":
        return <InvoiceOverview onNavigate={(page) => window.location.href = `/invoicing/${page}`} />;
      case "invoices":
        return <InvoicesList onNavigate={(page) => window.location.href = `/invoicing/${page}`} />;
      case "create-invoice":
        return <CreateInvoice />;
      case "invoice-customers":
        return <InvoiceCustomers />;
      case "invoice-payments":
        return <InvoicePayments />;
      case "invoice-products":
        return <InvoiceProducts />;
      case "invoice-settings":
        return <InvoiceSettings />;
      default:
        return <InvoiceOverview onNavigate={(page) => window.location.href = `/invoicing/${page}`} />;
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 text-gray-900 dark:text-gray-100">
      {renderPage()}
    </div>
  );
}