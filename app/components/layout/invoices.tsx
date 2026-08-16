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
  Calendar,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
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
   TYPES (Matches Database Schema)
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
  customer_type?: string | null;
  industry?: string | null;
  status?: string | null;
  credit_limit?: string | null;
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
}

interface TaxRate {
  id: string;
  name: string;
  rate: number;
  tax_type: string;
  is_default?: boolean;
  is_active?: boolean;
}

interface InvoiceItem {
  id: string;
  product_id?: string | null;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  discount_type?: string | null;
  discount_value?: number | string;
  discount_amount?: number | string;
  tax_rate: number | string;
  tax_amount: number | string;
  line_total: number | string;
  sort_order?: number;
}

interface Payment {
  id: string;
  amount: number | string;
  currency?: string | null;
  payment_method: string;
  transaction_reference?: string | null;
  payment_date: string;
  status: string;
  notes?: string | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_id?: string;
  customer?: Customer;
  issue_date: string;
  due_date?: string | null;
  payment_date?: string | null;
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
  notes?: string | null;
  internal_notes?: string | null;
  created_by?: string | null;
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

function money(value: number | string | null | undefined, currency: string | null | undefined = "KES") {
  const currencyCode = currency || "KES";
  try {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${currencyCode} ${Number(value || 0).toFixed(2)}`;
  }
}

function dateText(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-KE", {
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

function formatCurrency(currency: string | null | undefined) {
  return currency || "KES";
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
  onRefresh,
}: {
  onNavigate: (page: InvoicePage) => void;
  onRefresh: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [upcomingDue, setUpcomingDue] = useState<Invoice[]>([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [statsRes, recentRes, dueRes] = await Promise.all([
        fetch("/api/invoices/stats", { credentials: "include" }),
        fetch("/api/invoices?limit=5&sort=-created_at", {
          credentials: "include",
        }),
        fetch("/api/invoices?due_in_days=7&status!=paid&status!=cancelled&status!=void", {
          credentials: "include",
        }),
      ]);

      const statsData = await statsRes.json();
      const recentData = await recentRes.json();
      const dueData = await dueRes.json();

      if (statsRes.ok) setStats(statsData.stats || statsData);
      if (recentRes.ok)
        setRecentInvoices(Array.isArray(recentData) ? recentData : recentData.invoices || []);
      if (dueRes.ok)
        setUpcomingDue(Array.isArray(dueData) ? dueData : dueData.invoices || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overview data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) return <LoadingSpinner />;

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
        <div className="flex items-center gap-3">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={loadData} className="ml-auto rounded-lg p-1 hover:bg-red-100">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>
    );
  }

  const totalInvoiced = stats?.total_invoiced || 0;
  const totalCollected = stats?.total_collected || 0;
  const totalOutstanding = stats?.total_outstanding || 0;
  const totalInvoices = stats?.total_invoices || 0;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Invoices" value={String(totalInvoices)} icon={FileText} />
        <StatCard label="Total Invoiced" value={money(totalInvoiced)} icon={Receipt} />
        <StatCard label="Collected" value={money(totalCollected)} icon={Wallet} />
        <StatCard label="Outstanding" value={money(totalOutstanding)} icon={CircleDollarSign} />
      </section>

      {/* Quick Stats Breakdown */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        {(["draft", "sent", "partially_paid", "paid", "overdue", "cancelled"] as const).map(
          (status) => {
            const count = stats?.[`${status}_invoices` as keyof Stats] || 0;
            return (
              <button
                key={status}
                onClick={() => onNavigate(status === "draft" ? "invoices" : "invoices")}
                className="rounded-xl border border-gray-200 p-3 text-left transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
              >
                <p className="text-xs text-gray-500">{STATUS_LABELS[status]}</p>
                <p className="mt-1 text-lg font-bold">{count}</p>
              </button>
            );
          }
        )}
      </section>

      {/* Recent Invoices */}
      <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-800">
          <h2 className="text-sm font-semibold">Recent Invoices</h2>
          <button onClick={() => onNavigate("invoices")} className="text-sm text-blue-600 hover:underline">
            View all
          </button>
        </div>
        {recentInvoices.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No invoices yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-800/50">
                <tr>
                  <th className="px-5 py-3">Invoice</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Status</th>
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
                      <td className="px-5 py-3 text-sm font-semibold">{invoice.invoice_number}</td>
                      <td className="px-5 py-3 text-sm">{invoice.customer?.company_name || "Unknown"}</td>
                      <td className="px-5 py-3 text-sm">{money(invoice.total_amount, invoice.currency)}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}>
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

      {/* Upcoming Due */}
      {upcomingDue.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
          <div className="flex items-center gap-3 p-4">
            <AlertCircle size={18} className="text-amber-600" />
            <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Upcoming Payments Due
            </h2>
          </div>
          <div className="divide-y divide-amber-200/50 px-4 pb-4 dark:divide-amber-900/30">
            {upcomingDue.slice(0, 5).map((invoice) => (
              <div
                key={invoice.id}
                onClick={() => onNavigate("invoices")}
                className="flex cursor-pointer items-center justify-between py-3 text-sm"
              >
                <div>
                  <p className="font-medium">{invoice.invoice_number}</p>
                  <p className="text-gray-600 dark:text-gray-400">{invoice.customer?.company_name}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{money(invoice.amount_due, invoice.currency)}</p>
                  <p className="text-xs text-gray-500">Due {dateText(invoice.due_date)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => onNavigate("create-invoice")}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          <Plus size={17} /> New Invoice
        </button>
        <button
          onClick={() => onNavigate("invoice-customers")}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          <Users size={17} /> Manage Customers
        </button>
        <button
          onClick={() => onNavigate("invoice-products")}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          <Package size={17} /> Manage Products
        </button>
      </div>
    </div>
  );
}

// 2. ALL INVOICES
function InvoicesList() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | InvoiceStatus>("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const loadInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        page: String(page),
        limit: "25",
        ...(filter !== "all" && { status: filter }),
        ...(search && { search }),
      });
      const response = await fetch(`/api/invoices?${params}`, { credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load invoices.");
      const invoicesData = Array.isArray(data) ? data : data.invoices || [];
      setInvoices(invoicesData);
      setTotalPages(data.pages || Math.ceil(invoicesData.length / 25) || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  }, [page, filter, search]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const openInvoice = async (id: string) => {
    try {
      setDetailLoading(true);
      setError("");
      const response = await fetch(`/api/invoices/${id}`, { credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load invoice.");
      setSelectedInvoice(data.invoice || data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice.");
    } finally {
      setDetailLoading(false);
    }
  };

  const updateStatus = async (id: string, status: InvoiceStatus) => {
    try {
      const response = await fetch(`/api/invoices/${id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Failed to update status.");
      await loadInvoices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status.");
    }
  };

  if (detailLoading) return <LoadingSpinner />;

  if (selectedInvoice) {
    return (
      <InvoiceDetail
        invoice={selectedInvoice}
        onBack={() => setSelectedInvoice(null)}
        onRefresh={() => {
          if (selectedInvoice) openInvoice(selectedInvoice.id);
          loadInvoices();
        }}
      />
    );
  }

  const filteredInvoices = useMemo(() => {
    let result = invoices;
    if (filter !== "all") {
      result = result.filter((inv) => displayStatus(inv) === filter);
    }
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      result = result.filter(
        (inv) =>
          inv.invoice_number.toLowerCase().includes(query) ||
          inv.customer?.company_name?.toLowerCase().includes(query) ||
          inv.customer?.contact_name?.toLowerCase().includes(query)
      );
    }
    return result;
  }, [invoices, filter, search]);

  if (loading) return <LoadingSpinner />;

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
        <div className="flex items-center gap-3">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={loadInvoices} className="ml-auto rounded-lg p-1 hover:bg-red-100">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">All Invoices</h2>
          <p className="text-sm text-gray-500">
            {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? "s" : ""} shown
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice or customer..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 sm:w-64 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | InvoiceStatus)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="all">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <button
            onClick={loadInvoices}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {filteredInvoices.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
            <FileText size={40} className="text-gray-400" />
            <h3 className="mt-4 font-semibold">No invoices found</h3>
            <p className="mt-1 text-sm text-gray-500">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-800/50">
                <tr>
                  <th className="px-5 py-3.5">Invoice</th>
                  <th className="px-5 py-3.5">Customer</th>
                  <th className="px-5 py-3.5">Issued</th>
                  <th className="px-5 py-3.5">Due</th>
                  <th className="px-5 py-3.5">Total</th>
                  <th className="px-5 py-3.5">Balance</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredInvoices.map((invoice) => {
                  const status = displayStatus(invoice);
                  return (
                    <tr key={invoice.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold">{invoice.invoice_number}</p>
                        {invoice.po_number && (
                          <p className="mt-1 text-xs text-gray-500">PO: {invoice.po_number}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium">{invoice.customer?.company_name || "Unknown"}</p>
                        {invoice.customer?.contact_name && (
                          <p className="text-xs text-gray-500">{invoice.customer.contact_name}</p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm">{dateText(invoice.issue_date)}</td>
                      <td className="px-5 py-4 text-sm">{dateText(invoice.due_date)}</td>
                      <td className="px-5 py-4 text-sm font-semibold">
                        {money(invoice.total_amount, invoice.currency)}
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold">
                        {money(invoice.amount_due, invoice.currency)}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}>
                          {STATUS_LABELS[status]}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openInvoice(invoice.id)}
                            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                          >
                            <FileText size={16} />
                          </button>
                          <button
                            onClick={() => updateStatus(invoice.id, "sent")}
                            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                          >
                            <Send size={16} />
                          </button>
                          <button
  onClick={() => window.location.href = "/invoicing/create-invoice"}
  className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
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
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-800">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg px-4 py-2 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg px-4 py-2 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
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
  const [taxCalculationMethod, setTaxCalculationMethod] = useState<"exclusive" | "inclusive">("exclusive");
  const [poNumber, setPoNumber] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed" | "">("");
  const [discountValue, setDiscountValue] = useState("0");
  const [shippingCost, setShippingCost] = useState("0");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([{ ...EMPTY_ITEM }]);

  const loadCreateData = useCallback(async () => {
    try {
      setLoading(true);
      const [customersRes, productsRes, termsRes, taxRes, settingsRes] = await Promise.all([
        fetch("/api/customers?status=active", { credentials: "include" }),
        fetch("/api/products?is_active=true", { credentials: "include" }),
        fetch("/api/payment-terms?is_active=true", { credentials: "include" }),
        fetch("/api/tax-rates?is_active=true", { credentials: "include" }),
        fetch("/api/invoice-settings", { credentials: "include" }),
      ]);

      const customersData = await customersRes.json();
      const productsData = await productsRes.json();
      const termsData = await termsRes.json();
      const taxData = await taxRes.json();
      const settingsData = await settingsRes.json();

      if (customersRes.ok)
        setCustomers(Array.isArray(customersData) ? customersData : customersData.customers || []);
      if (productsRes.ok)
        setProducts(Array.isArray(productsData) ? productsData : productsData.products || []);
      if (termsRes.ok)
        setPaymentTerms(Array.isArray(termsData) ? termsData : termsData.paymentTerms || termsData.payment_terms || []);
      if (taxRes.ok) setTaxRates(Array.isArray(taxData) ? taxData : taxData.taxRates || []);
      if (settingsRes.ok) {
        const settings = settingsData.settings || settingsData;
        setSettings(settings);
        if (settings.default_currency) setCurrency(settings.default_currency);
        if (settings.default_tax_calculation) setTaxCalculationMethod(settings.default_tax_calculation);
        if (settings.default_payment_terms_id) setPaymentTermsId(settings.default_payment_terms_id);
        if (settings.default_due_days) {
          const base = new Date(issueDate || today());
          base.setDate(base.getDate() + settings.default_due_days);
          setDueDate(base.toISOString().slice(0, 10));
        }
      }
    } catch (err) {
      setError("Failed to load data. Some features may be limited.");
    } finally {
      setLoading(false);
    }
  }, [issueDate]);

  useEffect(() => {
    loadCreateData();
  }, [loadCreateData]);

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedPaymentTerms = paymentTerms.find((t) => t.id === paymentTermsId);

  const subtotal = items.reduce((sum, item) => sum + calculateItem(item).gross, 0);
  const itemDiscount = items.reduce((sum, item) => sum + calculateItem(item).discount, 0);
  const taxableSubtotal = items.reduce((sum, item) => sum + calculateItem(item).taxable, 0);
  const itemTax = items.reduce((sum, item) => sum + calculateItem(item).tax, 0);

  const invoiceDiscount = Number(discountValue || 0);
  const calculatedInvoiceDiscount =
    discountType === "percentage" ? (taxableSubtotal * invoiceDiscount) / 100 : discountType === "fixed" ? invoiceDiscount : 0;
  const safeInvoiceDiscount = Math.min(Math.max(calculatedInvoiceDiscount, 0), taxableSubtotal);
  const finalTaxable = taxableSubtotal - safeInvoiceDiscount;
  const shipping = Number(shippingCost || 0);
  const total = finalTaxable + itemTax + shipping;

  const updateItem = (index: number, field: keyof DraftItem, value: string) => {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const selectProduct = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) {
      updateItem(index, "product_id", "");
      return;
    }
    setItems((current) =>
      current.map((item, i) =>
        i === index
          ? {
              ...item,
              product_id: product.id,
              description: product.description || product.name,
              unit_price: String(product.unit_price),
            }
          : item
      )
    );
  };

  const handlePaymentTermsChange = (id: string) => {
    setPaymentTermsId(id);
    const term = paymentTerms.find((t) => t.id === id);
    if (!term) return;
    const base = new Date(issueDate || today());
    base.setDate(base.getDate() + Number(term.due_days || 0));
    setDueDate(base.toISOString().slice(0, 10));
  };

  const submit = async () => {
    try {
      setSaving(true);
      setError("");

      if (!customerId) throw new Error("Select a customer.");
      if (!issueDate) throw new Error("Issue date is required.");
      if (items.length === 0) throw new Error("Add at least one invoice item.");
      if (items.some((item) => !item.description.trim())) {
        throw new Error("Every invoice item needs a description.");
      }
      if (items.some((item) => Number(item.quantity) <= 0 || Number(item.unit_price) < 0)) {
        throw new Error("Check your quantities and prices.");
      }

      const payload = {
        customer_id: customerId,
        issue_date: issueDate,
        due_date: dueDate || null,
        payment_terms_id: paymentTermsId || null,
        payment_terms_display: selectedPaymentTerms?.name || null,
        currency,
        po_number: poNumber.trim() || null,
        tax_calculation_method: taxCalculationMethod,
        discount_type: discountType || null,
        discount_value: Number(discountValue || 0),
        shipping_cost: shipping,
        notes: notes.trim() || null,
        internal_notes: internalNotes.trim() || null,
        items: items.map((item) => ({
          product_id: item.product_id || null,
          description: item.description.trim(),
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          discount_type: item.discount_type || null,
          discount_value: Number(item.discount_value || 0),
          tax_rate: Number(item.tax_rate || 0),
        })),
      };

      const response = await fetch("/api/invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create invoice.");

      alert("Invoice created successfully!");
      // Reset form
      setItems([{ ...EMPTY_ITEM }]);
      setCustomerId("");
      setPoNumber("");
      setDiscountType("");
      setDiscountValue("0");
      setShippingCost("0");
      setNotes("");
      setInternalNotes("");
      window.location.href = "/invoicing/invoices";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Create Invoice</h2>
          <p className="text-sm text-gray-500">Fill in the details to create a new invoice.</p>
        </div>
        <button
          onClick={() => window.location.href = "/invoicing/invoices"}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          <ArrowLeft size={16} /> Back to Invoices
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Left Panel */}
        <div className="space-y-6">
          {/* Customer & Details */}
          <section className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
            <h3 className="mb-4 text-sm font-bold">Customer & Invoice Details</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <FieldLabel>Customer</FieldLabel>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.company_name}
                      {customer.contact_name ? ` — ${customer.contact_name}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <FieldLabel>Issue Date</FieldLabel>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </label>

              <label>
                <FieldLabel>Due Date</FieldLabel>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </label>

              <label>
                <FieldLabel>Payment Terms</FieldLabel>
                <select
                  value={paymentTermsId}
                  onChange={(e) => handlePaymentTermsChange(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="">Select terms</option>
                  {paymentTerms.map((term) => (
                    <option key={term.id} value={term.id}>
                      {term.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <FieldLabel>Currency</FieldLabel>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
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
                <FieldLabel>PO Number</FieldLabel>
                <input
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="PO-000123"
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </label>

              <label>
                <FieldLabel>Tax Calculation</FieldLabel>
                <select
                  value={taxCalculationMethod}
                  onChange={(e) => setTaxCalculationMethod(e.target.value as "exclusive" | "inclusive")}
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="exclusive">Tax Exclusive</option>
                  <option value="inclusive">Tax Inclusive</option>
                </select>
              </label>
            </div>

            {selectedCustomer && (
              <div className="mt-5 rounded-xl bg-gray-50 p-4 dark:bg-gray-800/60">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-gray-500">Company</p>
                    <p className="mt-1 text-sm font-semibold">{selectedCustomer.company_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="mt-1 truncate text-sm">{selectedCustomer.email || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Phone</p>
                    <p className="mt-1 text-sm">{selectedCustomer.phone || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Tax ID</p>
                    <p className="mt-1 text-sm">{selectedCustomer.tax_id || "—"}</p>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Items */}
          <section className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
            <div className="mb-5 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold">Invoice Items</h3>
                <p className="mt-1 text-xs text-gray-500">Add products, quantities, discounts, and tax.</p>
              </div>
              <button
                type="button"
                onClick={() => setItems((current) => [...current, { ...EMPTY_ITEM }])}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold dark:border-gray-700"
              >
                <Plus size={14} /> Add Item
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <table className="w-full min-w-[1050px]">
                <thead className="bg-gray-50 text-xs text-gray-500 dark:bg-gray-800/50">
                  <tr>
                    <th className="p-3 text-left">Product</th>
                    <th className="p-3 text-left">Description</th>
                    <th className="p-3">Qty</th>
                    <th className="p-3">Unit Price</th>
                    <th className="p-3">Discount</th>
                    <th className="p-3">Tax</th>
                    <th className="p-3 text-right">Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-800">
                  {items.map((item, index) => {
                    const calculated = calculateItem(item);
                    return (
                      <tr key={index}>
                        <td className="p-2">
                          <select
                            value={item.product_id}
                            onChange={(e) => selectProduct(index, e.target.value)}
                            className="w-40 rounded-lg border border-gray-200 bg-white px-2.5 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                          >
                            <option value="">Custom item</option>
                            {products
                              .filter((p) => p.is_active !== false)
                              .map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name}
                                </option>
                              ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            value={item.description}
                            onChange={(e) => updateItem(index, "description", e.target.value)}
                            placeholder="Description"
                            className="w-56 rounded-lg border border-gray-200 px-2.5 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, "quantity", e.target.value)}
                            className="w-20 rounded-lg border border-gray-200 px-2.5 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => updateItem(index, "unit_price", e.target.value)}
                            className="w-28 rounded-lg border border-gray-200 px-2.5 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                          />
                        </td>
                        <td className="p-2">
                          <div className="flex gap-1">
                            <select
                              value={item.discount_type}
                              onChange={(e) => updateItem(index, "discount_type", e.target.value)}
                              className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-2.5 text-xs dark:border-gray-700 dark:bg-gray-900"
                            >
                              <option value="">None</option>
                              <option value="percentage">%</option>
                              <option value="fixed">Fixed</option>
                            </select>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.discount_value}
                              onChange={(e) => updateItem(index, "discount_value", e.target.value)}
                              className="w-20 rounded-lg border border-gray-200 px-2 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                            />
                          </div>
                        </td>
                        <td className="p-2">
                          <select
                            value={item.tax_rate}
                            onChange={(e) => updateItem(index, "tax_rate", e.target.value)}
                            className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                          >
                            {taxRates.map((rate) => (
                              <option key={rate.id} value={String(rate.rate)}>
                                {rate.name}
                              </option>
                            ))}
                            <option value="0">No Tax</option>
                          </select>
                        </td>
                        <td className="p-3 text-right text-sm font-semibold">
                          {money(calculated.total, currency)}
                        </td>
                        <td className="p-2">
                          <button
                            type="button"
                            disabled={items.length === 1}
                            onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                            className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-30 dark:hover:bg-red-950/30"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/60">
                <p className="text-xs text-gray-500">Item Discounts</p>
                <p className="mt-1 text-sm font-semibold">{money(itemDiscount, currency)}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/60">
                <p className="text-xs text-gray-500">Item Tax</p>
                <p className="mt-1 text-sm font-semibold">{money(itemTax, currency)}</p>
              </div>
            </div>
          </section>

          {/* Adjustments */}
          <section className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
            <h3 className="text-sm font-bold">Invoice Adjustments</h3>
            <p className="mt-1 text-xs text-gray-500">Apply invoice-level discount or shipping charge.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label>
                <FieldLabel>Discount Type</FieldLabel>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed" | "")}
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="">No discount</option>
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed amount</option>
                </select>
              </label>
              <label>
                <FieldLabel>Discount Value</FieldLabel>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountValue}
                  disabled={!discountType}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:disabled:bg-gray-800"
                />
              </label>
              <label>
                <FieldLabel>Shipping Cost</FieldLabel>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </label>
            </div>
          </section>

          {/* Notes */}
          <section className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
            <h3 className="text-sm font-bold">Notes & Internal Information</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label>
                <FieldLabel>Customer Notes</FieldLabel>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  placeholder="Notes shown to the customer..."
                  className="w-full rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </label>
              <label>
                <FieldLabel>Internal Notes</FieldLabel>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={5}
                  placeholder="Staff-only notes..."
                  className="w-full rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </label>
            </div>
          </section>
        </div>

        {/* Right Panel - Preview */}
        <aside className="h-fit rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900 xl:sticky xl:top-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Invoice Preview</p>
              <p className="mt-1 text-xs text-gray-400">Live calculation</p>
            </div>
            <Receipt size={19} className="text-blue-500" />
          </div>

          <div className="mt-5 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-bold">{settings?.company_name || "SaMi"}</p>
                <p className="mt-1 text-xs text-gray-500">Invoice</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Invoice #</p>
                <p className="mt-1 text-sm font-semibold">
                  {settings?.invoice_prefix || "INV-"}
                  {String(settings?.invoice_next_number || 1).padStart(settings?.invoice_number_padding || 6, "0")}
                </p>
              </div>
            </div>

            <div className="my-5 border-t border-gray-200 dark:border-gray-800" />

            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-500">Bill to</p>
                <p className="mt-1 text-sm font-semibold">
                  {selectedCustomer?.company_name || "Select customer"}
                </p>
                {selectedCustomer?.email && (
                  <p className="mt-1 truncate text-xs text-gray-500">{selectedCustomer.email}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Issue Date</p>
                  <p className="mt-1 text-xs font-medium">{dateText(issueDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Due Date</p>
                  <p className="mt-1 text-xs font-medium">{dueDate ? dateText(dueDate) : "Not set"}</p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4 dark:border-gray-800">
                <SummaryRow label="Subtotal" value={money(subtotal, currency)} />
                {itemDiscount > 0 && (
                  <div className="mt-2">
                    <SummaryRow label="Item Discounts" value={`-${money(itemDiscount, currency)}`} />
                  </div>
                )}
                {safeInvoiceDiscount > 0 && (
                  <div className="mt-2">
                    <SummaryRow label="Invoice Discount" value={`-${money(safeInvoiceDiscount, currency)}`} />
                  </div>
                )}
                <div className="mt-2">
                  <SummaryRow label="Tax" value={money(itemTax, currency)} />
                </div>
                {shipping > 0 && (
                  <div className="mt-2">
                    <SummaryRow label="Shipping" value={money(shipping, currency)} />
                  </div>
                )}
                <div className="my-4 border-t border-gray-200 dark:border-gray-800" />
                <SummaryRow label="Total" value={money(total, currency)} strong />
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-xl bg-blue-50 p-4 dark:bg-blue-950/30">
            <div className="flex items-start gap-3">
              <CreditCard size={18} className="mt-0.5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">Payment Terms</p>
                <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                  {selectedPaymentTerms?.name || "No payment terms selected"}
                </p>
              </div>
            </div>
          </div>

          <button
            disabled={saving}
            onClick={submit}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 size={17} className="animate-spin" />}
            {saving ? "Creating invoice..." : "Create Invoice"}
          </button>

          <button
            disabled={saving}
            onClick={() => window.location.href = "/invoicing/invoices"}
            className="mt-2 w-full rounded-xl px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
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
  if (!invoice) return <LoadingSpinner />;

  const status = displayStatus(invoice);
  const currency = invoice.currency || "USD";

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white"
      >
        <ArrowLeft size={16} /> Back to Invoices
      </button>

      <header className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold">{invoice.invoice_number}</h1>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}>
                {STATUS_LABELS[status]}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Issued {dateText(invoice.issue_date)}
              {invoice.due_date && ` · Due ${dateText(invoice.due_date)}`}
            </p>
          </div>
          <button onClick={onRefresh} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold dark:border-gray-700">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Invoice Total" value={money(invoice.total_amount, currency)} icon={Receipt} />
        <StatCard label="Amount Paid" value={money(invoice.amount_paid, currency)} icon={Wallet} />
        <StatCard label="Balance Due" value={money(invoice.amount_due, currency)} icon={CircleDollarSign} />
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <h2 className="text-sm font-bold">Customer</h2>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <DetailField label="Company" value={invoice.customer?.company_name} />
          <DetailField label="Contact" value={invoice.customer?.contact_name} />
          <DetailField label="Email" value={invoice.customer?.email} />
          <DetailField label="Phone" value={invoice.customer?.phone} />
          <DetailField label="Tax ID" value={invoice.customer?.tax_id} />
          <DetailField label="Registration" value={invoice.customer?.registration_number} />
          <DetailField label="Currency" value={invoice.customer?.currency} />
          <DetailField label="Customer Type" value={invoice.customer?.customer_type} />
        </div>
        {invoice.customer?.billing_address && (
          <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-800">
            <p className="text-xs uppercase tracking-wide text-gray-500">Billing Address</p>
            <p className="mt-1 whitespace-pre-line text-sm">{invoice.customer.billing_address}</p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <h2 className="text-sm font-bold">Invoice Information</h2>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <DetailField label="Invoice Number" value={invoice.invoice_number} />
          <DetailField label="Purchase Order" value={invoice.po_number} />
          <DetailField label="Currency" value={invoice.currency} />
          <DetailField label="Payment Terms" value={invoice.payment_terms_display} />
          <DetailField label="Tax Calculation" value={invoice.tax_calculation_method} />
          <DetailField label="Issue Date" value={dateText(invoice.issue_date)} />
          <DetailField label="Due Date" value={dateText(invoice.due_date)} />
          <DetailField label="Payment Date" value={dateText(invoice.payment_date)} />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <h2 className="text-sm font-bold">Invoice Items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px]">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800/50">
              <tr>
                <th className="px-5 py-3 text-left">Description</th>
                <th className="px-5 py-3 text-right">Qty</th>
                <th className="px-5 py-3 text-right">Unit Price</th>
                <th className="px-5 py-3 text-right">Discount</th>
                <th className="px-5 py-3 text-right">Tax</th>
                <th className="px-5 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-800">
              {(invoice.invoice_items || []).map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-4 text-sm">{item.description}</td>
                  <td className="px-5 py-4 text-right text-sm">{item.quantity}</td>
                  <td className="px-5 py-4 text-right text-sm">{money(item.unit_price, currency)}</td>
                  <td className="px-5 py-4 text-right text-sm">{money(item.discount_amount || 0, currency)}</td>
                  <td className="px-5 py-4 text-right text-sm">
                    {money(item.tax_amount, currency)} ({item.tax_rate}%)
                  </td>
                  <td className="px-5 py-4 text-right text-sm font-bold">{money(item.line_total, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-200 p-5 dark:border-gray-800">
          <div className="ml-auto max-w-sm space-y-2.5">
            <SummaryRow label="Subtotal" value={money(invoice.subtotal, currency)} />
            {Number(invoice.discount_amount || 0) > 0 && (
              <SummaryRow label="Discount" value={`-${money(invoice.discount_amount, currency)}`} />
            )}
            <SummaryRow label="Tax" value={money(invoice.tax_amount, currency)} />
            {Number(invoice.shipping_cost || 0) > 0 && (
              <SummaryRow label="Shipping" value={money(invoice.shipping_cost, currency)} />
            )}
            <div className="border-t border-gray-200 pt-3 dark:border-gray-800">
              <SummaryRow label="Total" value={money(invoice.total_amount, currency)} strong />
            </div>
          </div>
        </div>
      </section>

      {(invoice.notes || invoice.internal_notes) && (
        <section className="grid gap-4 md:grid-cols-2">
          {invoice.notes && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <h2 className="text-sm font-bold">Customer Notes</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">{invoice.notes}</p>
            </div>
          )}
          {invoice.internal_notes && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <h2 className="text-sm font-bold">Internal Notes</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">
                {invoice.internal_notes}
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
      const response = await fetch(`/api/customers?${search ? `search=${search}` : ""}`, {
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load customers.");
      setCustomers(Array.isArray(data) ? data : data.customers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customers.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Customers</h2>
          <p className="text-sm text-gray-500">{customers.length} customers</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 sm:w-64 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Plus size={16} /> Add Customer
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <div className="flex items-center gap-3">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button onClick={loadCustomers} className="ml-auto rounded-lg p-1 hover:bg-red-100">
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {customers.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
            <Users size={40} className="text-gray-400" />
            <h3 className="mt-4 font-semibold">No customers found</h3>
            <p className="mt-1 text-sm text-gray-500">Add your first customer to start creating invoices.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Plus size={16} /> Add Customer
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-800/50">
                <tr>
                  <th className="px-5 py-3.5">Company</th>
                  <th className="px-5 py-3.5">Contact</th>
                  <th className="px-5 py-3.5">Email</th>
                  <th className="px-5 py-3.5">Phone</th>
                  <th className="px-5 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="px-5 py-4 text-sm font-medium">{customer.company_name}</td>
                    <td className="px-5 py-4 text-sm">{customer.contact_name || "—"}</td>
                    <td className="px-5 py-4 text-sm">{customer.email || "—"}</td>
                    <td className="px-5 py-4 text-sm">{customer.phone || "—"}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          customer.status === "active"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
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

      {showCreate && (
        <CustomerCreateModal
          onClose={() => setShowCreate(false)}
          onCreated={loadCustomers}
        />
      )}
    </div>
  );
}

// 5a. Customer Create Modal
function CustomerCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    billing_address: "",
    tax_id: "",
    currency: "USD",
  });

  const submit = async () => {
    try {
      setLoading(true);
      setError("");
      if (!form.company_name.trim()) throw new Error("Company name is required.");

      const response = await fetch("/api/customers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create customer.");

      await onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create customer.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-6">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 dark:bg-gray-950">
        <div className="flex items-center justify-between border-b border-gray-200 pb-4 dark:border-gray-800">
          <h2 className="text-lg font-bold">Add Customer</h2>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={19} />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4 space-y-4">
          <label>
            <FieldLabel>Company Name *</FieldLabel>
            <input
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <label>
            <FieldLabel>Contact Name</FieldLabel>
            <input
              value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <FieldLabel>Email</FieldLabel>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label>
              <FieldLabel>Phone</FieldLabel>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
          </div>
          <label>
            <FieldLabel>Billing Address</FieldLabel>
            <textarea
              value={form.billing_address}
              onChange={(e) => setForm({ ...form, billing_address: e.target.value })}
              rows={3}
              className="w-full rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <FieldLabel>Tax ID</FieldLabel>
              <input
                value={form.tax_id}
                onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label>
              <FieldLabel>Currency</FieldLabel>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              >
                {CURRENCIES.map((curr) => (
                  <option key={curr} value={curr}>
                    {curr}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-6 flex gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create Customer"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showRecord, setShowRecord] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [paymentsRes, invoicesRes] = await Promise.all([
        fetch("/api/payments?limit=50", { credentials: "include" }),
        fetch("/api/invoices?status=paid&status=partially_paid&status=sent", { credentials: "include" }),
      ]);

      const paymentsData = await paymentsRes.json();
      const invoicesData = await invoicesRes.json();

      if (paymentsRes.ok) setPayments(Array.isArray(paymentsData) ? paymentsData : paymentsData.payments || []);
      if (invoicesRes.ok) setInvoices(Array.isArray(invoicesData) ? invoicesData : invoicesData.invoices || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Payments</h2>
          <p className="text-sm text-gray-500">{payments.length} payments recorded</p>
        </div>
        <button
          onClick={() => setShowRecord(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          <Plus size={16} /> Record Payment
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <div className="flex items-center gap-3">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button onClick={loadPayments} className="ml-auto rounded-lg p-1 hover:bg-red-100">
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {payments.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
            <CreditCard size={40} className="text-gray-400" />
            <h3 className="mt-4 font-semibold">No payments recorded</h3>
            <p className="mt-1 text-sm text-gray-500">Record your first payment to track customer payments.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-800/50">
                <tr>
                  <th className="px-5 py-3.5">Amount</th>
                  <th className="px-5 py-3.5">Method</th>
                  <th className="px-5 py-3.5">Reference</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="px-5 py-4 text-sm font-semibold">{money(payment.amount, payment.currency)}</td>
                    <td className="px-5 py-4 text-sm capitalize">{payment.payment_method}</td>
                    <td className="px-5 py-4 text-sm">{payment.transaction_reference || "—"}</td>
                    <td className="px-5 py-4 text-sm">{dateText(payment.payment_date)}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          payment.status === "completed"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : payment.status === "pending"
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            : "bg-gray-500/10 text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {payment.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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

// 6a. Payment Record Modal
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
  });

  const selectedInvoice = invoices.find((i) => i.id === form.invoice_id);

  const submit = async () => {
    try {
      setLoading(true);
      setError("");
      if (!form.invoice_id) throw new Error("Select an invoice.");
      if (!form.amount || Number(form.amount) <= 0) throw new Error("Enter a valid amount.");
      if (selectedInvoice && Number(form.amount) > Number(selectedInvoice.amount_due)) {
        throw new Error(`Amount cannot exceed balance due (${money(selectedInvoice.amount_due, selectedInvoice.currency)}).`);
      }

      const payload = {
        invoice_id: form.invoice_id,
        amount: Number(form.amount),
        payment_method: form.payment_method,
        transaction_reference: form.transaction_reference || null,
        payment_date: form.payment_date,
        notes: form.notes || null,
        status: "completed",
      };

      const response = await fetch("/api/payments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to record payment.");

      await onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-6">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 dark:bg-gray-950">
        <div className="flex items-center justify-between border-b border-gray-200 pb-4 dark:border-gray-800">
          <h2 className="text-lg font-bold">Record Payment</h2>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={19} />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4 space-y-4">
          <label>
            <FieldLabel>Invoice</FieldLabel>
            <select
              value={form.invoice_id}
              onChange={(e) => setForm({ ...form, invoice_id: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="">Select invoice</option>
              {invoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.invoice_number} - Balance: {money(invoice.amount_due, invoice.currency)}
                </option>
              ))}
            </select>
          </label>

          {selectedInvoice && (
            <div className="rounded-xl bg-gray-50 p-3 text-sm dark:bg-gray-800/60">
              <div className="flex justify-between">
                <span className="text-gray-500">Balance Due:</span>
                <span className="font-semibold">{money(selectedInvoice.amount_due, selectedInvoice.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Customer:</span>
                <span>{selectedInvoice.customer?.company_name}</span>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <FieldLabel>Amount *</FieldLabel>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label>
              <FieldLabel>Payment Method</FieldLabel>
              <select
                value={form.payment_method}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method.replace("_", " ").toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <FieldLabel>Reference</FieldLabel>
              <input
                value={form.transaction_reference}
                onChange={(e) => setForm({ ...form, transaction_reference: e.target.value })}
                placeholder="Transaction ID or check number"
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label>
              <FieldLabel>Payment Date</FieldLabel>
              <input
                type="date"
                value={form.payment_date}
                onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
          </div>

          <label>
            <FieldLabel>Notes</FieldLabel>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              placeholder="Additional notes..."
              className="w-full rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
        </div>

        <div className="mt-6 flex gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Recording..." : "Record Payment"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
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

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`/api/products?${search ? `search=${search}` : ""}`, {
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load products.");
      setProducts(Array.isArray(data) ? data : data.products || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Products & Services</h2>
          <p className="text-sm text-gray-500">{products.length} items</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 sm:w-64 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Plus size={16} /> Add Product
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <div className="flex items-center gap-3">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button onClick={loadProducts} className="ml-auto rounded-lg p-1 hover:bg-red-100">
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {products.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
            <Package size={40} className="text-gray-400" />
            <h3 className="mt-4 font-semibold">No products found</h3>
            <p className="mt-1 text-sm text-gray-500">Add your first product or service to start invoicing.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Plus size={16} /> Add Product
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-800/50">
                <tr>
                  <th className="px-5 py-3.5">Name</th>
                  <th className="px-5 py-3.5">SKU</th>
                  <th className="px-5 py-3.5">Category</th>
                  <th className="px-5 py-3.5">Unit Price</th>
                  <th className="px-5 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="px-5 py-4 text-sm font-medium">{product.name}</td>
                    <td className="px-5 py-4 text-sm">{product.sku || "—"}</td>
                    <td className="px-5 py-4 text-sm">{product.category || "—"}</td>
                    <td className="px-5 py-4 text-sm font-semibold">{money(product.unit_price)}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          product.is_active !== false
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-gray-500/10 text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {product.is_active !== false ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <ProductCreateModal
          onClose={() => setShowCreate(false)}
          onCreated={loadProducts}
        />
      )}
    </div>
  );
}

// 7a. Product Create Modal
function ProductCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    sku: "",
    unit_price: "",
    category: "",
  });

  const submit = async () => {
    try {
      setLoading(true);
      setError("");
      if (!form.name.trim()) throw new Error("Product name is required.");
      if (!form.unit_price || Number(form.unit_price) < 0) throw new Error("Enter a valid price.");

      const response = await fetch("/api/products", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, unit_price: Number(form.unit_price), is_active: true }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create product.");

      await onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create product.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-6">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 dark:bg-gray-950">
        <div className="flex items-center justify-between border-b border-gray-200 pb-4 dark:border-gray-800">
          <h2 className="text-lg font-bold">Add Product</h2>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={19} />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4 space-y-4">
          <label>
            <FieldLabel>Name *</FieldLabel>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <label>
            <FieldLabel>Description</FieldLabel>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label>
              <FieldLabel>SKU</FieldLabel>
              <input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label>
              <FieldLabel>Unit Price *</FieldLabel>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label>
              <FieldLabel>Category</FieldLabel>
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
          </div>
        </div>

        <div className="mt-6 flex gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Creating..." : "Add Product"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
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

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/invoice-settings", { credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load settings.");
      setSettings(data.settings || data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSetting = (key: string, value: any) => {
    if (settings) {
      setSettings({ ...settings, [key]: value });
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const response = await fetch("/api/invoice-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save settings.");
      setSuccess("Settings saved successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  if (!settings) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
        <AlertCircle size={18} className="inline mr-2" />
        Could not load invoice settings.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Invoice Settings</h2>
          <p className="text-sm text-gray-500">Configure your invoicing preferences.</p>
        </div>
        <button
          onClick={saveSettings}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {saving && <Loader2 size={17} className="animate-spin" />}
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300">
          <span>{success}</span>
        </div>
      )}

      <div className="space-y-6">
        {/* Company Details */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-bold">Company Details</h3>
          <p className="mt-1 text-xs text-gray-500">Information displayed on your invoices.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label>
              <FieldLabel>Company Name</FieldLabel>
              <input
                value={settings.company_name || ""}
                onChange={(e) => updateSetting("company_name", e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label>
              <FieldLabel>Email</FieldLabel>
              <input
                type="email"
                value={settings.company_email || ""}
                onChange={(e) => updateSetting("company_email", e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label>
              <FieldLabel>Phone</FieldLabel>
              <input
                value={settings.company_phone || ""}
                onChange={(e) => updateSetting("company_phone", e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label>
              <FieldLabel>Tax ID</FieldLabel>
              <input
                value={settings.company_tax_id || ""}
                onChange={(e) => updateSetting("company_tax_id", e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label className="sm:col-span-2">
              <FieldLabel>Address</FieldLabel>
              <textarea
                value={settings.company_address || ""}
                onChange={(e) => updateSetting("company_address", e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label className="sm:col-span-2">
              <FieldLabel>Website</FieldLabel>
              <input
                value={settings.company_website || ""}
                onChange={(e) => updateSetting("company_website", e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
          </div>
        </section>

        {/* Invoice Numbering */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-bold">Invoice Numbering</h3>
          <p className="mt-1 text-xs text-gray-500">Configure how invoice numbers are generated.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label>
              <FieldLabel>Prefix</FieldLabel>
              <input
                value={settings.invoice_prefix}
                onChange={(e) => updateSetting("invoice_prefix", e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label>
              <FieldLabel>Next Number</FieldLabel>
              <input
                type="number"
                min="1"
                value={settings.invoice_next_number}
                onChange={(e) => updateSetting("invoice_next_number", Number(e.target.value))}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label>
              <FieldLabel>Number Padding</FieldLabel>
              <input
                type="number"
                min="1"
                max="10"
                value={settings.invoice_number_padding}
                onChange={(e) => updateSetting("invoice_number_padding", Number(e.target.value))}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
          </div>
          <div className="mt-4 rounded-xl bg-gray-50 p-3 text-sm dark:bg-gray-800/60">
            <p className="text-gray-500">Preview:</p>
            <p className="mt-1 font-mono font-bold">
              {settings.invoice_prefix}
              {String(settings.invoice_next_number).padStart(settings.invoice_number_padding, "0")}
            </p>
          </div>
        </section>

        {/* Defaults */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-bold">Defaults</h3>
          <p className="mt-1 text-xs text-gray-500">Default values for new invoices.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label>
              <FieldLabel>Default Currency</FieldLabel>
              <select
                value={settings.default_currency}
                onChange={(e) => updateSetting("default_currency", e.target.value)}
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
                value={settings.default_due_days}
                onChange={(e) => updateSetting("default_due_days", Number(e.target.value))}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label>
              <FieldLabel>Tax Calculation</FieldLabel>
              <select
                value={settings.default_tax_calculation}
                onChange={(e) => updateSetting("default_tax_calculation", e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="exclusive">Tax Exclusive</option>
                <option value="inclusive">Tax Inclusive</option>
              </select>
            </label>
          </div>
        </section>

        {/* Reminders */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-bold">Payment Reminders</h3>
          <p className="mt-1 text-xs text-gray-500">Automated payment reminder settings.</p>
          <div className="mt-4 space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.reminder_enabled}
                onChange={(e) => updateSetting("reminder_enabled", e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm">Enable payment reminders</span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <FieldLabel>Days Before Due</FieldLabel>
                <input
                  type="number"
                  min="0"
                  value={settings.reminder_days_before}
                  onChange={(e) => updateSetting("reminder_days_before", Number(e.target.value))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </label>
              <label>
                <FieldLabel>Days After Due (1st)</FieldLabel>
                <input
                  type="number"
                  min="0"
                  value={settings.reminder_after_days}
                  onChange={(e) => updateSetting("reminder_after_days", Number(e.target.value))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </label>
              <label>
                <FieldLabel>Days After Due (2nd)</FieldLabel>
                <input
                  type="number"
                  min="0"
                  value={settings.reminder_after_days_2}
                  onChange={(e) => updateSetting("reminder_after_days_2", Number(e.target.value))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </label>
              <label>
                <FieldLabel>Grace Period Days</FieldLabel>
                <input
                  type="number"
                  min="0"
                  value={settings.reminder_grace_period_days}
                  onChange={(e) => updateSetting("reminder_grace_period_days", Number(e.target.value))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </label>
            </div>
          </div>
        </section>

        {/* Email Templates */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-bold">Email Templates</h3>
          <p className="mt-1 text-xs text-gray-500">Email templates for sending invoices.</p>
          <div className="mt-4 space-y-4">
            <label>
              <FieldLabel>Subject Template</FieldLabel>
              <input
                value={settings.email_subject_template || ""}
                onChange={(e) => updateSetting("email_subject_template", e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label>
              <FieldLabel>Email Body Template</FieldLabel>
              <textarea
                value={settings.email_body_template || ""}
                onChange={(e) => updateSetting("email_body_template", e.target.value)}
                rows={6}
                className="w-full rounded-xl border border-gray-200 p-3 text-sm font-mono dark:border-gray-700 dark:bg-gray-900"
              />
              <p className="mt-1 text-xs text-gray-500">
                Available variables: {"{invoice_number}"}, {"{customer_name}"}, {"{total}"}, {"{due_date}"}, {"{company_name}"}
              </p>
            </label>
          </div>
        </section>

        {/* Terms & Conditions */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-bold">Terms & Conditions</h3>
          <p className="mt-1 text-xs text-gray-500">Terms displayed on all invoices.</p>
          <label className="mt-4 block">
            <textarea
              value={settings.terms_and_conditions || ""}
              onChange={(e) => updateSetting("terms_and_conditions", e.target.value)}
              rows={6}
              className="w-full rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
        </section>

        {/* Feature Toggles */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-bold">Features</h3>
          <p className="mt-1 text-xs text-gray-500">Enable or disable invoicing features.</p>
          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.auto_send_enabled}
                onChange={(e) => updateSetting("auto_send_enabled", e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm">Auto-send invoices when created</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.require_approval}
                onChange={(e) => updateSetting("require_approval", e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm">Require approval before sending</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.allow_partial_payments}
                onChange={(e) => updateSetting("allow_partial_payments", e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm">Allow partial payments</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.allow_credit_notes}
                onChange={(e) => updateSetting("allow_credit_notes", e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm">Allow credit notes</span>
            </label>
          </div>
        </section>
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
        return <InvoiceOverview onNavigate={(page) => window.location.href = `/invoicing/${page}`} onRefresh={() => {}} />;
      case "invoices":
        return <InvoicesList />;
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
        return <InvoiceOverview onNavigate={(page) => window.location.href = `/invoicing/${page}`} onRefresh={() => {}} />;
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 text-gray-900 dark:text-gray-100">
      {renderPage()}
    </div>
  );
}