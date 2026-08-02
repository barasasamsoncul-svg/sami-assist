
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeft,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Loader2,
  Plus,
  Receipt,
  Search,
  Wallet,
  X,
  TrendingUp,
  TrendingDown,
  Calendar,
  Clock,
  Download,
  Printer,
  Send,
  MoreVertical,
  Edit,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Info,
  Filter,
  Grid3x3,
  List,
} from "lucide-react";

type InvoiceStatus =
  | "draft"
  | "sent"
  | "partial"
  | "paid"
  | "overdue"
  | "cancelled";

type Customer = {
  id: string;
  company_name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

type Invoice = {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date?: string | null;
  status: InvoiceStatus;
  subtotal: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  amount_paid: number | string;
  amount_due: number | string;
  notes?: string | null;
  customer?: Customer;
};

type InvoiceDetails = Invoice & {
  invoice_items: {
    id: string;
    description: string;
    quantity: number | string;
    unit_price: number | string;
    tax_rate: number | string;
    tax_amount: number | string;
    line_total: number | string;
  }[];
  payments: {
    id: string;
    amount: number | string;
    payment_method: string;
    transaction_reference?: string | null;
    payment_date: string;
    status: string;
    notes?: string | null;
  }[];
};

type Stats = {
  total_invoices?: number;
  draft_invoices?: number;
  sent_invoices?: number;
  partial_invoices?: number;
  paid_invoices?: number;
  overdue_invoices?: number;
  cancelled_invoices?: number;
  total_invoiced?: number;
  total_collected?: number;
  total_outstanding?: number;
};

type DraftItem = {
  description: string;
  quantity: string;
  unit_price: string;
  tax_rate: string;
};

const LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

const money = (value: number | string) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const dateText = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
  }).format(date);
};

function getDisplayStatus(invoice: Invoice): InvoiceStatus {
  if (
    invoice.status === "paid" ||
    invoice.status === "cancelled" ||
    !invoice.due_date
  ) {
    return invoice.status;
  }

  const due = new Date(invoice.due_date);
  due.setHours(23, 59, 59, 999);

  if (Number(invoice.amount_due || 0) > 0 && due < new Date()) {
    return "overdue";
  }

  return invoice.status;
}

function statusClass(status: InvoiceStatus) {
  switch (status) {
    case "paid":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
    case "partial":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
    case "overdue":
      return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20";
    case "sent":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
    case "cancelled":
      return "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20";
    default:
      return "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20";
  }
}

function statusIcon(status: InvoiceStatus) {
  switch (status) {
    case "paid":
      return CheckCircle;
    case "overdue":
      return AlertTriangle;
    default:
      return Info;
  }
}

function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  subtitle,
}: {
  label: string;
  value: string;
  icon: typeof FileText;
  trend?: { value: string; positive: boolean };
  subtitle?: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-gray-200/70 bg-white p-6 transition-all hover:-translate-y-0.5 hover:shadow-xl dark:border-gray-800/70 dark:bg-gray-900/50">
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-gray-50/50 dark:to-gray-800/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {value}
          </p>
          {subtitle && (
            <p className="mt-1 text-[10px] text-gray-400">{subtitle}</p>
          )}
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400">
          <Icon size={20} />
        </div>
      </div>
      {trend && (
        <div className="relative mt-3 flex items-center gap-1.5">
          {trend.positive ? (
            <TrendingUp size={14} className="text-emerald-500" />
          ) : (
            <TrendingDown size={14} className="text-red-500" />
          )}
          <span className={`text-xs font-medium ${
            trend.positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
          }`}>
            {trend.value}
          </span>
          <span className="text-xs text-gray-400">vs last month</span>
        </div>
      )}
    </div>
  );
}

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | InvoiceStatus>("all");
  const [selected, setSelected] = useState<InvoiceDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [showPaymentModal, setShowPaymentModal] = useState(false);

 
  const loadInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [invoiceResponse, statsResponse] = await Promise.all([
        fetch("/api/invoices", { credentials: "include" }),
        fetch("/api/invoices/stats", { credentials: "include" }),
      ]);

      const invoiceData = await invoiceResponse.json();
      const statsData = await statsResponse.json();

      if (!invoiceResponse.ok) {
        throw new Error(invoiceData.error || "Failed to load invoices.");
      }

      if (!statsResponse.ok) {
        throw new Error(statsData.error || "Failed to load invoice statistics.");
      }

      setInvoices(
        Array.isArray(invoiceData)
          ? invoiceData
          : invoiceData.invoices || []
      );

      setStats(statsData.stats || statsData || null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load invoices."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const openInvoice = async (id: string) => {
    try {
      setDetailLoading(true);
      setSelected(null);
      setError("");

      const response = await fetch(`/api/invoices/${id}`, {
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load invoice.");
      }

      setSelected(data.invoice || data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load invoice."
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();

    return invoices.filter((invoice) => {
      const status = getDisplayStatus(invoice);

      const matchesStatus =
        filter === "all" || status === filter;

      const matchesSearch =
        !query ||
        invoice.invoice_number.toLowerCase().includes(query) ||
        invoice.customer?.company_name?.toLowerCase().includes(query) ||
        invoice.customer?.contact_name?.toLowerCase().includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [invoices, search, filter]);

  if (selected || detailLoading) {
    return (
      <InvoiceDetailsView
        invoice={selected}
        loading={detailLoading}
        onBack={() => setSelected(null)}
        onRefresh={async () => {
          if (selected) await openInvoice(selected.id);
          await loadInvoices();
        }}
      />
    );
  }

  const totalInvoiced =
    stats?.total_invoiced ??
    invoices.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);

  const totalCollected =
    stats?.total_collected ??
    invoices.reduce((sum, item) => sum + Number(item.amount_paid || 0), 0);

  const totalOutstanding =
    stats?.total_outstanding ??
    invoices.reduce((sum, item) => sum + Number(item.amount_due || 0), 0);

  const count = (status: InvoiceStatus) => {
    const key = `${status}_invoices` as keyof Stats;
    const value = stats?.[key];

    return typeof value === "number"
      ? value
      : invoices.filter((invoice) => getDisplayStatus(invoice) === status)
          .length;
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl p-5 sm:p-7 lg:p-9">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Receipt size={16} className="text-blue-600" />
              <span>Sales & billing</span>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
              Invoices
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
              Create invoices, track customer balances, monitor payments,
              and manage overdue accounts from one workspace.
            </p>
          </div>

          <button
            onClick={() => setShowCreate(true)}
            className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:shadow-blue-600/30 active:scale-[0.98]"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            <div className="relative flex items-center gap-2">
              <Plus size={17} />
              New invoice
            </div>
          </button>
        </header>

        {error && (
          <div className="mb-6 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Stats */}
        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total invoices"
            value={String(stats?.total_invoices ?? invoices.length)}
            icon={FileText}
            subtitle={`${count("paid")} paid, ${count("overdue")} overdue`}
          />
          <StatCard
            label="Total invoiced"
            value={money(totalInvoiced)}
            icon={Receipt}
            trend={{ value: "+23.1%", positive: true }}
          />
          <StatCard
            label="Collected"
            value={money(totalCollected)}
            icon={Wallet}
            trend={{ value: "+18.5%", positive: true }}
          />
          <StatCard
            label="Outstanding"
            value={money(totalOutstanding)}
            icon={CircleDollarSign}
            trend={{ value: "-5.2%", positive: false }}
          />
        </section>

        {/* Status Filters */}
        <section className="mb-6 flex flex-wrap gap-2">
          {(
            [
              "all",
              "draft",
              "sent",
              "partial",
              "paid",
              "overdue",
              "cancelled",
            ] as const
          ).map((status) => {
            const isActive = filter === status;
            const count_ = status === "all" ? invoices.length : count(status);
            
            return (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`group relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                    : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
                }`}
              >
                {status === "all" ? "All" : LABELS[status]}
                <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-medium ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                }`}>
                  {count_}
                </span>
              </button>
            );
          })}
        </section>

        {/* Invoice List */}
        <section className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white/50 backdrop-blur-sm dark:border-gray-800/70 dark:bg-gray-900/50">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 border-b border-gray-200/70 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800/70">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                Invoice register
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {filteredInvoices.length} invoice
                {filteredInvoices.length === 1 ? "" : "s"} shown
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search
                  size={17}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search invoice or customer"
                  className="w-full rounded-xl border border-gray-200/70 bg-gray-50/50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white dark:border-gray-700 dark:bg-gray-800/50 dark:text-white dark:focus:bg-gray-800"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode("list")}
                  className={`rounded-xl p-2 transition ${
                    viewMode === "list"
                      ? "bg-blue-600/10 text-blue-600 dark:text-blue-400"
                      : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <List size={18} />
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  className={`rounded-xl p-2 transition ${
                    viewMode === "grid"
                      ? "bg-blue-600/10 text-blue-600 dark:text-blue-400"
                      : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <Grid3x3 size={18} />
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[400px] items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={32} className="animate-spin text-blue-500" />
                <p className="text-sm text-gray-400">Loading invoices...</p>
              </div>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="flex min-h-[400px] flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                <FileText size={32} className="text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {search || filter !== "all"
                  ? "No matching invoices"
                  : "No invoices yet"}
              </h3>
              <p className="mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
                {search || filter !== "all"
                  ? "Try changing the search or status filter."
                  : "Create your first invoice to start tracking sales and customer payments."}
              </p>
              {!search && filter === "all" && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="mt-6 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:shadow-blue-600/30"
                >
                  <Plus size={15} className="mr-1 inline" />
                  Create invoice
                </button>
              )}
            </div>
          ) : viewMode === "list" ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left">
                <thead className="bg-gray-50/50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-800/30">
                  <tr>
                    {[
                      "Invoice",
                      "Customer",
                      "Issued",
                      "Due",
                      "Total",
                      "Paid",
                      "Balance",
                      "Status",
                      "",
                    ].map((heading) => (
                      <th key={heading} className="px-5 py-4 font-medium">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100/70 dark:divide-gray-800/70">
                  {filteredInvoices.map((invoice) => {
                    const status = getDisplayStatus(invoice);
                    const StatusIcon = statusIcon(status);

                    return (
                      <tr
                        key={invoice.id}
                        onClick={() => openInvoice(invoice.id)}
                        className="cursor-pointer transition hover:bg-gray-50/50 dark:hover:bg-gray-800/30"
                      >
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {invoice.invoice_number}
                          </p>
                        </td>

                        <td className="px-5 py-4">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {invoice.customer?.company_name || "Unknown customer"}
                          </p>
                          {invoice.customer?.contact_name && (
                            <p className="text-xs text-gray-500">
                              {invoice.customer.contact_name}
                            </p>
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {dateText(invoice.issue_date)}
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {dateText(invoice.due_date)}
                        </td>

                        <td className="px-5 py-4 text-sm font-semibold text-gray-900 dark:text-white">
                          {money(invoice.total_amount)}
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {money(invoice.amount_paid)}
                        </td>

                        <td className="px-5 py-4 text-sm font-semibold text-gray-900 dark:text-white">
                          {money(invoice.amount_due)}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(
                              status
                            )}`}
                          >
                            <StatusIcon size={12} />
                            {LABELS[status]}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <ChevronRight size={17} className="text-gray-400" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredInvoices.map((invoice) => {
                const status = getDisplayStatus(invoice);
                const StatusIcon = statusIcon(status);

                return (
                  <div
                    key={invoice.id}
                    onClick={() => openInvoice(invoice.id)}
                    className="group cursor-pointer rounded-2xl border border-gray-200/70 bg-white p-5 transition-all hover:-translate-y-1 hover:shadow-xl dark:border-gray-800/70 dark:bg-gray-900/50"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {invoice.invoice_number}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          {invoice.customer?.company_name || "Unknown customer"}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(
                          status
                        )}`}
                      >
                        <StatusIcon size={10} />
                        {LABELS[status]}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 border-t border-gray-100/70 pt-4 dark:border-gray-800/70">
                      <div>
                        <p className="text-[10px] text-gray-400">Total</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {money(invoice.total_amount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400">Due</p>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          {dateText(invoice.due_date)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {showCreate && (
        <CreateInvoiceModal
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await loadInvoices();
          }}
        />
      )}
    </div>
  );
}

function InvoiceDetailsView({
  invoice,
  loading,
  onBack,
  onRefresh,
}: {
  invoice: InvoiceDetails | null;
  loading: boolean;
  onBack: () => void;
  onRefresh: () => void;
}) {
  if (loading || !invoice) {
    return (
      <div className="flex min-h-[500px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-blue-500" />
          <p className="text-sm text-gray-400">Loading invoice...</p>
        </div>
      </div>
    );
  }

  const status = getDisplayStatus(invoice);
  const StatusIcon = statusIcon(status);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const handleRecordPayment = () => {
  setShowPaymentModal(true);
};
  return (
    <div className="h-full overflow-y-auto p-5 sm:p-7 lg:p-9">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Back button */}
        <button
          onClick={onBack}
          className="group inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition hover:text-gray-900 dark:hover:text-white"
        >
          <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
          Back to invoices
        </button>

        {/* Invoice Header */}
        <header className="rounded-2xl border border-gray-200/70 bg-white/50 p-6 backdrop-blur-sm dark:border-gray-800/70 dark:bg-gray-900/50">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {invoice.invoice_number}
                </h1>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                    status
                  )}`}
                >
                  <StatusIcon size={12} />
                  {LABELS[status]}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} />
                  Issued {dateText(invoice.issue_date)}
                </span>
                {invoice.due_date && (
                  <span className="flex items-center gap-1.5">
                    <Clock size={14} />
                    Due {dateText(invoice.due_date)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
  <button
    onClick={onRefresh}
    className="rounded-xl border border-gray-200/70 px-4 py-2.5 text-sm font-medium transition hover:bg-gray-50 dark:border-gray-800/70 dark:hover:bg-gray-800"
  >
    Refresh
  </button>
  
  {/* Action Buttons */}
  {status === "draft" && (
    <>
      <button className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:shadow-blue-600/30">
        <Send size={16} />
        Send Invoice
      </button>
      <button className="inline-flex items-center gap-2 rounded-xl border border-gray-200/70 px-4 py-2.5 text-sm font-medium transition hover:bg-gray-50 dark:border-gray-800/70 dark:hover:bg-gray-800">
        <Edit size={16} />
        Edit
      </button>
    </>
  )}
  
  {(status === "sent" || status === "partial") && (
  <button 
    onClick={handleRecordPayment} //
    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:shadow-emerald-600/30"
  >
    <CheckCircle size={16} />
    Record Payment
  </button>
)}
  <button className="inline-flex items-center gap-2 rounded-xl border border-gray-200/70 px-4 py-2.5 text-sm font-medium transition hover:bg-gray-50 dark:border-gray-800/70 dark:hover:bg-gray-800">
    <Printer size={16} />
    Print
  </button>
  
  <button className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:shadow-blue-600/30">
    <Download size={16} />
    Export PDF
  </button>
  
  {status === "draft" && (
    <button className="inline-flex items-center gap-2 rounded-xl border border-red-200/70 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30">
      <Trash2 size={16} />
      Delete
    </button>
  )}
</div>
          </div>
        </header>
        
       {/* Payment Modal */}
{showPaymentModal && (
  <RecordPaymentModal
    invoice={invoice}
    onClose={() => setShowPaymentModal(false)}
    onSuccess={async () => {
      setShowPaymentModal(false);
      await onRefresh();
    }}
  />
)}

{/* Summary Cards */}
<div className="grid grid-cols-1 gap-4 sm:grid-cols-3"></div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-200/70 bg-white/50 p-5 backdrop-blur-sm dark:border-gray-800/70 dark:bg-gray-900/50">
            <p className="text-xs text-gray-500">Invoice total</p>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {money(invoice.total_amount)}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200/70 bg-white/50 p-5 backdrop-blur-sm dark:border-gray-800/70 dark:bg-gray-900/50">
            <p className="text-xs text-gray-500">Amount paid</p>
            <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {money(invoice.amount_paid)}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200/70 bg-white/50 p-5 backdrop-blur-sm dark:border-gray-800/70 dark:bg-gray-900/50">
            <p className="text-xs text-gray-500">Balance due</p>
            <p className={`mt-2 text-2xl font-bold ${
              Number(invoice.amount_due) > 0 
                ? "text-red-600 dark:text-red-400" 
                : "text-emerald-600 dark:text-emerald-400"
            }`}>
              {money(invoice.amount_due)}
            </p>
          </div>
        </div>

        {/* Customer Section */}
        <section className="rounded-2xl border border-gray-200/70 bg-white/50 backdrop-blur-sm dark:border-gray-800/70 dark:bg-gray-900/50">
          <div className="border-b border-gray-200/70 p-5 dark:border-gray-800/70">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Customer</h2>
          </div>
          <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Company", invoice.customer?.company_name],
              ["Contact", invoice.customer?.contact_name],
              ["Email", invoice.customer?.email],
              ["Phone", invoice.customer?.phone],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  {label}
                </p>
                <p className="mt-1 text-sm text-gray-900 dark:text-white">
                  {value || "—"}
                </p>
              </div>
            ))}
          </div>
          {invoice.customer?.address && (
            <div className="border-t border-gray-200/70 px-5 py-4 dark:border-gray-800/70">
              <p className="text-xs uppercase tracking-wide text-gray-500">Address</p>
              <p className="mt-1 text-sm text-gray-900 dark:text-white">
                {invoice.customer.address}
              </p>
            </div>
          )}
        </section>

        {/* Invoice Items */}
        <section className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white/50 backdrop-blur-sm dark:border-gray-800/70 dark:bg-gray-900/50">
          <div className="border-b border-gray-200/70 p-5 dark:border-gray-800/70">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Invoice items</h2>
            <p className="mt-1 text-xs text-gray-500">
              Products and services included in this invoice.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-gray-50/50 text-xs uppercase text-gray-500 dark:bg-gray-800/30">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Description</th>
                  <th className="px-5 py-3 text-right font-medium">Qty</th>
                  <th className="px-5 py-3 text-right font-medium">Unit price</th>
                  <th className="px-5 py-3 text-right font-medium">Tax</th>
                  <th className="px-5 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100/70 dark:divide-gray-800/70">
                {(invoice.invoice_items || []).map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-4 text-sm text-gray-900 dark:text-white">
                      {item.description}
                    </td>
                    <td className="px-5 py-4 text-right text-sm text-gray-600 dark:text-gray-300">
                      {item.quantity}
                    </td>
                    <td className="px-5 py-4 text-right text-sm text-gray-600 dark:text-gray-300">
                      {money(item.unit_price)}
                    </td>
                    <td className="px-5 py-4 text-right text-sm text-gray-600 dark:text-gray-300">
                      {money(item.tax_amount)} ({item.tax_rate}%)
                    </td>
                    <td className="px-5 py-4 text-right text-sm font-semibold text-gray-900 dark:text-white">
                      {money(item.line_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-gray-200/70 p-5 dark:border-gray-800/70">
            <div className="ml-auto max-w-xs space-y-2 text-sm">
              <div className="flex justify-between text-gray-600 dark:text-gray-300">
                <span>Subtotal</span>
                <span>{money(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600 dark:text-gray-300">
                <span>Tax</span>
                <span>{money(invoice.tax_amount)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200/70 pt-3 text-base font-bold text-gray-900 dark:text-white dark:border-gray-800/70">
                <span>Total</span>
                <span>{money(invoice.total_amount)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Payments */}
        <section className="rounded-2xl border border-gray-200/70 bg-white/50 backdrop-blur-sm dark:border-gray-800/70 dark:bg-gray-900/50">
          <div className="border-b border-gray-200/70 p-5 dark:border-gray-800/70">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Payment history</h2>
          </div>

          {!invoice.payments?.length ? (
            <p className="p-5 text-sm text-gray-500">
              No payments have been recorded for this invoice.
            </p>
          ) : (
            <div className="divide-y divide-gray-100/70 dark:divide-gray-800/70">
              {invoice.payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                      {money(payment.amount)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {payment.payment_method} · {dateText(payment.payment_date)}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs text-gray-500">
                      {payment.transaction_reference || "No reference"}
                    </p>
                    <span className="mt-1 inline-block rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      {payment.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {invoice.notes && (
          <section className="rounded-2xl border border-gray-200/70 bg-white/50 p-5 backdrop-blur-sm dark:border-gray-800/70 dark:bg-gray-900/50">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Notes</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">
              {invoice.notes}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
function RecordPaymentModal({
  invoice,
  onClose,
  onSuccess,
}: {
  invoice: InvoiceDetails;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [amount, setAmount] = useState(() => {
    const due = Number(invoice.amount_due);
    return due > 0 ? due.toString() : "";
  });
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    try {
      setSaving(true);
      setError("");

      if (!amount || Number(amount) <= 0) {
        throw new Error("Please enter a valid amount.");
      }

      if (Number(amount) > Number(invoice.amount_due)) {
        throw new Error("Amount exceeds the outstanding balance.");
      }

      const response = await fetch(`/api/invoices/${invoice.id}/payments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(amount),
          payment_method: paymentMethod,
          transaction_reference: reference || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to record payment.");
      }

      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-950">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Record Payment
            </h3>
            <p className="text-sm text-gray-500">
              {invoice.invoice_number} · Balance due: {money(invoice.amount_due)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X size={19} />
          </button>
        </div>

        {error && (
          <div className="mb-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle size={18} className="shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                KES
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-xl border border-gray-200/70 bg-white pl-16 pr-3 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800/70 dark:bg-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-xl border border-gray-200/70 bg-white px-3 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800/70 dark:bg-gray-900 dark:text-white"
            >
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="m_pesa">M-Pesa</option>
              <option value="credit_card">Credit Card</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Reference (optional)
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Transaction reference or note"
              className="w-full rounded-xl border border-gray-200/70 bg-white px-3 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800/70 dark:bg-gray-900 dark:text-white"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:shadow-emerald-600/30 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 size={17} className="animate-spin mx-auto" />
              ) : (
                "Record Payment"
              )}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-3 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateInvoiceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([
    {
      description: "",
      quantity: "1",
      unit_price: "0",
      tax_rate: "0",
    },
  ]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const response = await fetch("/api/customers", {
          credentials: "include",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "Failed to load customers."
          );
        }

        setCustomers(
          Array.isArray(data) ? data : data.customers || []
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load customers."
        );
      } finally {
        setLoadingCustomers(false);
      }
    };

    loadCustomers();
  }, []);

  const updateItem = (
    index: number,
    field: keyof DraftItem,
    value: string
  ) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, [field]: value }
          : item
      )
    );
  };

  const subtotal = items.reduce(
    (sum, item) =>
      sum +
      Number(item.quantity || 0) *
        Number(item.unit_price || 0),
    0
  );

  const tax = items.reduce((sum, item) => {
    const line =
      Number(item.quantity || 0) *
      Number(item.unit_price || 0);

    return (
      sum +
      (line * Number(item.tax_rate || 0)) / 100
    );
  }, 0);

  const total = subtotal + tax;

  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId
  );

  const submit = async () => {
    try {
      setSaving(true);
      setError("");

      if (!customerId) {
        throw new Error("Select a customer.");
      }

      if (items.some((item) => !item.description.trim())) {
        throw new Error(
          "Every invoice item needs a description."
        );
      }

      if (
        items.some(
          (item) =>
            Number(item.quantity) <= 0 ||
            Number(item.unit_price) < 0 ||
            Number(item.tax_rate) < 0
        )
      ) {
        throw new Error(
          "Check quantity, price and tax values."
        );
      }

      const response = await fetch("/api/invoices", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer_id: customerId,
          due_date: dueDate || null,
          notes: notes.trim() || null,
          items: items.map((item) => ({
            description: item.description.trim(),
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price),
            tax_rate: Number(item.tax_rate),
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to create invoice."
        );
      }

      await onCreated();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create invoice."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-6 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-2xl dark:border-gray-800/70 dark:bg-gray-950">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-gray-200/70 p-5 dark:border-gray-800/70">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Create invoice
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Customer, line items, tax, payment terms and notes.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X size={19} />
          </button>
        </header>

        <div className="overflow-y-auto p-5 sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-6">
              {error && (
                <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                  <AlertCircle size={18} className="shrink-0" />
                  {error}
                </div>
              )}

              {/* Customer */}
              <section>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Customer & payment terms
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  Choose the customer who will receive this invoice.
                </p>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="sm:col-span-2">
                    <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                      Customer
                    </span>
                    <select
                      value={customerId}
                      disabled={loadingCustomers}
                      onChange={(event) =>
                        setCustomerId(event.target.value)
                      }
                      className="w-full rounded-xl border border-gray-200/70 bg-white px-3 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800/70 dark:bg-gray-900 dark:text-white"
                    >
                      <option value="">
                        {loadingCustomers
                          ? "Loading customers..."
                          : customers.length === 0
                            ? "No customers available"
                            : "Select a customer"}
                      </option>

                      {customers.map((customer) => (
                        <option
                          key={customer.id}
                          value={customer.id}
                        >
                          {customer.company_name}
                          {customer.contact_name
                            ? ` — ${customer.contact_name}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                      Due date
                    </span>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(event) =>
                        setDueDate(event.target.value)
                      }
                      className="w-full rounded-xl border border-gray-200/70 bg-white px-3 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800/70 dark:bg-gray-900 dark:text-white"
                    />
                  </label>

                  <div className="rounded-xl border border-dashed border-gray-300 p-3 dark:border-gray-700">
                    <p className="text-xs text-gray-500">
                      Selected customer
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
                      {selectedCustomer?.company_name || "None"}
                    </p>
                  </div>
                </div>
              </section>

              {/* Line Items */}
              <section>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      Line items
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      Add the products or services being billed.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setItems((current) => [
                        ...current,
                        {
                          description: "",
                          quantity: "1",
                          unit_price: "0",
                          tax_rate: "0",
                        },
                      ])
                    }
                    className="shrink-0 rounded-lg border border-gray-200/70 px-3 py-2 text-xs font-semibold transition hover:bg-gray-50 dark:border-gray-800/70 dark:hover:bg-gray-800"
                  >
                    <Plus size={14} className="mr-1 inline" />
                    Add item
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-gray-200/70 dark:border-gray-800/70">
                  <table className="w-full min-w-[800px]">
                    <thead className="bg-gray-50/50 text-xs text-gray-500 dark:bg-gray-800/30">
                      <tr>
                        <th className="p-3 text-left font-medium">
                          Description
                        </th>
                        <th className="p-3 font-medium">Qty</th>
                        <th className="p-3 font-medium">Unit price</th>
                        <th className="p-3 font-medium">Tax %</th>
                        <th className="p-3 text-right font-medium">
                          Total
                        </th>
                        <th />
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100/70 dark:divide-gray-800/70">
                      {items.map((item, index) => {
                        const line =
                          Number(item.quantity || 0) *
                          Number(item.unit_price || 0);

                        const lineTax =
                          (line *
                            Number(item.tax_rate || 0)) /
                          100;

                        return (
                          <tr key={index}>
                            <td className="p-2">
                              <input
                                value={item.description}
                                onChange={(event) =>
                                  updateItem(
                                    index,
                                    "description",
                                    event.target.value
                                  )
                                }
                                placeholder="e.g. Website development"
                                className="w-full rounded-lg border border-gray-200/70 bg-white px-2.5 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800/70 dark:bg-gray-900 dark:text-white"
                              />
                            </td>

                            <td className="p-2">
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={item.quantity}
                                onChange={(event) =>
                                  updateItem(
                                    index,
                                    "quantity",
                                    event.target.value
                                  )
                                }
                                className="w-24 rounded-lg border border-gray-200/70 bg-white px-2.5 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800/70 dark:bg-gray-900 dark:text-white"
                              />
                            </td>

                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.unit_price}
                                onChange={(event) =>
                                  updateItem(
                                    index,
                                    "unit_price",
                                    event.target.value
                                  )
                                }
                                className="w-32 rounded-lg border border-gray-200/70 bg-white px-2.5 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800/70 dark:bg-gray-900 dark:text-white"
                              />
                            </td>

                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.tax_rate}
                                onChange={(event) =>
                                  updateItem(
                                    index,
                                    "tax_rate",
                                    event.target.value
                                  )
                                }
                                className="w-24 rounded-lg border border-gray-200/70 bg-white px-2.5 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800/70 dark:bg-gray-900 dark:text-white"
                              />
                            </td>

                            <td className="p-3 text-right text-sm font-semibold text-gray-900 dark:text-white">
                              {money(line + lineTax)}
                            </td>

                            <td className="p-2">
                              <button
                                type="button"
                                disabled={items.length === 1}
                                onClick={() =>
                                  setItems((current) =>
                                    current.filter(
                                      (_, itemIndex) =>
                                        itemIndex !== index
                                    )
                                  )
                                }
                                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"
                              >
                                <X size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Notes */}
              <label>
                <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Notes
                </span>
                <textarea
                  value={notes}
                  onChange={(event) =>
                    setNotes(event.target.value)
                  }
                  rows={4}
                  placeholder="Optional notes or payment instructions..."
                  className="w-full rounded-xl border border-gray-200/70 bg-white p-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800/70 dark:bg-gray-900 dark:text-white"
                />
              </label>
            </div>

            {/* Preview Sidebar */}
            <aside className="h-fit rounded-2xl border border-gray-200/70 bg-gray-50/50 p-5 backdrop-blur-sm dark:border-gray-800/70 dark:bg-gray-900/50">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Invoice preview
              </p>

              <div className="mt-5 space-y-4">
                <div>
                  <p className="text-xs text-gray-500">
                    Customer
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                    {selectedCustomer?.company_name ||
                      "Not selected"}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    Items
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                    {items.length}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    Due date
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                    {dueDate ? dateText(dueDate) : "Not set"}
                  </p>
                </div>
              </div>

              <div className="my-5 border-t border-gray-200/70 dark:border-gray-800/70" />

              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between text-gray-600 dark:text-gray-300">
                  <span>Subtotal</span>
                  <span>{money(subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600 dark:text-gray-300">
                  <span>Tax</span>
                  <span>{money(tax)}</span>
                </div>

                <div className="flex justify-between border-t border-gray-200/70 pt-3 text-base font-bold text-gray-900 dark:text-white dark:border-gray-800/70">
                  <span>Total</span>
                  <span>{money(total)}</span>
                </div>
              </div>

              <button
                disabled={saving || loadingCustomers}
                onClick={submit}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:shadow-blue-600/30 disabled:opacity-60"
              >
                {saving && (
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />
                )}
                {saving
                  ? "Creating invoice..."
                  : "Create invoice"}
              </button>

              <button
                disabled={saving}
                onClick={onClose}
                className="mt-2 w-full rounded-xl px-4 py-2.5 text-sm text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}