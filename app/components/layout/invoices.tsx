"use client";
import { toPng } from "html-to-image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  Copy,
  Download,
  Mail,
  MessageCircle,
  Printer,
  Share2,
  ArrowLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  FileText,
  Loader2,
  Plus,
  Receipt,
  UserPlus,
  Users,
  Pencil,
  Search,
  Wallet,
  X,
  ImageIcon,
  Package,
  Settings,
  Building2,
  Bell,
  Save,
  Trash2,
  LayoutDashboard,
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
  status?: string | null;
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
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "partial":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "overdue":
      return "bg-red-500/10 text-red-700 dark:text-red-400";
    case "sent":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "cancelled":
      return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
    default:
      return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
  }
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
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

type InvoicePage =
  | "invoice-overview"
  | "invoicing"
  | "invoices"
  | "create-invoice"
  | "invoice-customers"
  | "invoice-payments"
  | "invoice-products"
  | "invoice-settings";

interface InvoicesProps {
  activePage: InvoicePage;
}

export default function Invoices({ activePage }: InvoicesProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | InvoiceStatus>("all");
  const [selected, setSelected] = useState<InvoiceDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [section, setSection] = useState<"overview" | "customers" | "payments" | "products" | "settings" | "all-invoices" | "create-invoice">(
  activePage === "invoice-customers" ? "customers" :
  activePage === "invoice-payments" ? "payments" :
  activePage === "invoice-products" ? "products" :
  activePage === "invoice-settings" ? "settings" :
  activePage === "invoices" ? "all-invoices" :
  activePage === "create-invoice" ? "create-invoice" :
  "overview"
);

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

  // Section: Customers
  if (section === "customers") {
    return (
      <InvoicingSectionShell section={section} setSection={setSection}>
        <CustomerManager />
      </InvoicingSectionShell>
    );
  }

  // Section: Payments
  if (section === "payments") {
    return (
      <InvoicingSectionShell section={section} setSection={setSection}>
        <PaymentsManager onOpenInvoice={openInvoice} />
      </InvoicingSectionShell>
    );
  }

  // Section: Products
  if (section === "products") {
    return (
      <InvoicingSectionShell section={section} setSection={setSection}>
        <ProductsManager />
      </InvoicingSectionShell>
    );
  }

  // Section: Settings
  if (section === "settings") {
    return (
      <InvoicingSectionShell section={section} setSection={setSection}>
        <SettingsManager />
      </InvoicingSectionShell>
    );
  }

  // Section: All Invoices
  if (section === "all-invoices") {
    return (
      <InvoicingSectionShell section={section} setSection={setSection}>
        <AllInvoicesView onOpenInvoice={openInvoice} />
      </InvoicingSectionShell>
    );
  }

  // Section: Create Invoice
  if (section === "create-invoice") {
    return (
      <InvoicingSectionShell section={section} setSection={setSection}>
        <CreateInvoicePage onCreated={async () => {
          await loadInvoices();
          setSection("all-invoices");
        }} />
      </InvoicingSectionShell>
    );
  }

  // Section: Overview (default)
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
    <div className="space-y-6 text-gray-900 dark:text-gray-100">
      <InvoicingNav section={section} setSection={setSection} />
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Receipt size={16} />
            Sales & billing
          </div>

          <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
            Invoices
          </h1>

          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Create invoices, track customer balances, monitor payments,
            and manage overdue accounts from one workspace.
          </p>
        </div>

        <button
          onClick={() => setSection("create-invoice")}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-900"
        >
          <Plus size={17} />
          New invoice
        </button>
      </header>

      {error && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total invoices"
          value={String(stats?.total_invoices ?? invoices.length)}
          icon={FileText}
        />
        <StatCard
          label="Total invoiced"
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

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
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
        ).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`rounded-xl border p-3 text-left transition ${
              filter === status
                ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
            }`}
          >
            <p className="text-xs opacity-60">
              {status === "all" ? "All" : LABELS[status]}
            </p>
            <p className="mt-1 text-lg font-bold">
              {status === "all" ? invoices.length : count(status)}
            </p>
          </button>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              Recent invoices
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
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-gray-400 sm:w-64 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <select
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value as "all" | InvoiceStatus)
              }
              className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="all">All statuses</option>
              {Object.entries(LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>

            <button
              onClick={() => setSection("all-invoices")}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              View All
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[350px] items-center justify-center">
            <Loader2 size={28} className="animate-spin text-gray-400" />
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="flex min-h-[350px] flex-col items-center justify-center px-6 text-center">
            <FileText size={32} className="text-gray-400" />

            <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">
              {search || filter !== "all"
                ? "No matching invoices"
                : "No invoices yet"}
            </h3>

            <p className="mt-1 max-w-md text-sm text-gray-500">
              {search || filter !== "all"
                ? "Try changing the search or status filter."
                : "Create your first invoice to start tracking sales and customer payments."}
            </p>

            {!search && filter === "all" && (
              <button
                onClick={() => setSection("create-invoice")}
                className="mt-4 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-900"
              >
                <Plus size={15} className="mr-1 inline" />
                Create invoice
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-800/50">
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
                    <th key={heading} className="px-5 py-3.5">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredInvoices.map((invoice) => {
                  const status = getDisplayStatus(invoice);

                  return (
                    <tr
                      key={invoice.id}
                      onClick={() => openInvoice(invoice.id)}
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40"
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
                          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                            status
                          )}`}
                        >
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
        )}
      </section>
    </div>
  );
}

// ==========================================
// INVOICING NAV
// ==========================================

function InvoicingNav({
  section,
  setSection,
}: {
  section: "overview" | "customers" | "payments" | "products" | "settings" | "all-invoices" | "create-invoice";
  setSection: (section: "overview" | "customers" | "payments" | "products" | "settings" | "all-invoices" | "create-invoice") => void;
}) {
  const items = [
    ["overview", "Overview", LayoutDashboard],
    ["all-invoices", "All Invoices", Receipt],
    ["create-invoice", "Create Invoice", Plus],
    ["customers", "Customers", Users],
    ["payments", "Payments", CreditCard],
    ["products", "Products", Package],
    ["settings", "Settings", Settings],
  ] as const;

  return (
    <nav className="flex flex-wrap gap-2 rounded-2xl border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900">
      {items.map(([key, label, Icon]) => (
        <button
          key={key}
          type="button"
          onClick={() => setSection(key)}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            section === key
              ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
              : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          }`}
        >
          <Icon size={16} />
          {label}
        </button>
      ))}
    </nav>
  );
}

// ==========================================
// INVOICING SECTION SHELL
// ==========================================

function InvoicingSectionShell({
  section,
  setSection,
  children,
}: {
  section: "overview" | "customers" | "payments" | "products" | "settings" | "all-invoices" | "create-invoice";
  setSection: (section: "overview" | "customers" | "payments" | "products" | "settings" | "all-invoices" | "create-invoice") => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6 text-gray-900 dark:text-gray-100">
      <InvoicingNav section={section} setSection={setSection} />
      {children}
    </div>
  );
}

// ==========================================
// INVOICE DETAILS VIEW
// ==========================================

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
  const [showPayment, setShowPayment] = useState(false);
  const [showShare, setShowShare] = useState(false);

  if (loading || !invoice) {
    return (
      <div className="flex min-h-[500px] items-center justify-center">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    );
  }

  const status = getDisplayStatus(invoice);

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white"
      >
        <ArrowLeft size={16} />
        Back to invoices
      </button>

      <header className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {invoice.invoice_number}
              </h1>

              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                  status
                )}`}
              >
                {LABELS[status]}
              </span>
            </div>

            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Issued {dateText(invoice.issue_date)}
              {invoice.due_date && ` · Due ${dateText(invoice.due_date)}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onRefresh}
             className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:hover:bg-gray-800"
            >
              Refresh
            </button>

            <button
              onClick={() => setShowPayment(true)}
              disabled={Number(invoice.amount_due || 0) <= 0 || status === "cancelled"}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CreditCard size={16} />
              Record payment
            </button>

            <button
              type="button"
              onClick={() => exportInvoiceCsv(invoice)}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
            >
              <Download size={16} />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => printInvoice(invoice)}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
            >
              <Printer size={16} />
              Print / PDF
            </button>
            <button
              type="button"
              onClick={() => setShowShare(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-900"
            >
              <Share2 size={16} />
              Share
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Invoice total"
          value={money(invoice.total_amount)}
        />
        <SummaryCard
          label="Amount paid"
          value={money(invoice.amount_paid)}
        />
        <SummaryCard
          label="Balance due"
          value={money(invoice.amount_due)}
        />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
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
              <p className="text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400">
                {label}
              </p>
              <p className="mt-1 text-sm text-gray-900 dark:text-white">
                {value || "—"}
              </p>
            </div>
          ))}
        </div>

        {invoice.customer?.address && (
          <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-800">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Address
            </p>
            <p className="mt-1 text-sm text-gray-900 dark:text-white">
  {invoice.customer.address}
</p>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Invoice items</h2>
          <p className="mt-1 text-xs text-gray-500">
            Products and services included in this invoice.
          </p>
        </div>
        <div className="overflow-x-auto">
  <table className="w-full min-w-[760px]">
    <thead className="bg-gray-50 text-xs uppercase text-gray-700 dark:bg-gray-800/50 dark:text-gray-200">
      <tr>
        <th className="px-5 py-3 text-left">Description</th>
        <th className="px-5 py-3 text-right">Qty</th>
        <th className="px-5 py-3 text-right">Unit price</th>
        <th className="px-5 py-3 text-right">Tax</th>
        <th className="px-5 py-3 text-right">Total</th>
      </tr>
    </thead>

    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
      {(invoice.invoice_items || []).map((item) => (
        <tr key={item.id}>
          <td className="px-5 py-4 text-left text-sm text-gray-900 dark:text-white">
            {item.description}
          </td>

          <td className="px-5 py-4 text-right text-sm text-gray-900 dark:text-white">
            {item.quantity}
          </td>

          <td className="px-5 py-4 text-right text-sm text-gray-900 dark:text-white">
            {money(item.unit_price)}
          </td>

          <td className="px-5 py-4 text-right text-sm text-gray-900 dark:text-white">
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
        <div className="border-t border-gray-200 p-5 dark:border-gray-800">
          <div className="ml-auto max-w-xs space-y-2 text-sm">
            <SummaryRow label="Subtotal" value={money(invoice.subtotal)} />
            <SummaryRow label="Tax" value={money(invoice.tax_amount)} />

     <div className="flex justify-between border-t border-gray-200 pt-3 text-base font-bold text-gray-900 dark:border-gray-800 dark:text-white">
  <span>Total</span>
  <span className="text-gray-900 dark:text-white">
    {money(invoice.total_amount)}
  </span>
</div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Payment history</h2>
        </div>

        {!invoice.payments?.length ? (
          <p className="p-5 text-sm text-gray-600 dark:text-gray-400">
            No payments have been recorded for this invoice.
          </p>
        ) : (
          <div className="divide-y dark:divide-gray-800">
            {invoice.payments.map((payment) => (
              <div
                key={payment.id}
                className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {money(payment.amount)}
                  </p>
                  <p className="text-xs capitalize text-gray-500">
                    {payment.payment_method} ·{" "}
                    {dateText(payment.payment_date)}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <p className="text-xs text-gray-500">
                    {payment.transaction_reference || "No reference"}
                  </p>
                  <p className="mt-1 text-xs capitalize text-gray-500">
                    {payment.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showShare && (
        <ShareInvoiceModal
          invoice={invoice}
          onClose={() => setShowShare(false)}
        />
      )}

      {showPayment && (
        <RecordPaymentModal
          invoice={invoice}
          onClose={() => setShowPayment(false)}
          onSaved={async () => {
            setShowPayment(false);
            await onRefresh();
          }}
        />
      )}

      {invoice.notes && (
        <section className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">
            {invoice.notes}
          </p>
        </section>
      )}
    </div>
  );
}

// ==========================================
// SUMMARY CARD
// ==========================================

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-gray-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

// ==========================================
// SUMMARY ROW
// ==========================================

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex justify-between text-gray-600 dark:text-gray-300">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// ==========================================
// RECORD PAYMENT MODAL
// ==========================================

function RecordPaymentModal({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: InvoiceDetails;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [amount, setAmount] = useState(String(Number(invoice.amount_due || 0).toFixed(2)));
  const [method, setMethod] = useState("other");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    try {
      setSaving(true); setError("");
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new Error("Payment amount must be greater than zero.");
      if (numericAmount > Number(invoice.amount_due) + 0.005) throw new Error("Payment cannot exceed the outstanding balance.");
      const res = await fetch(`/api/invoices/${invoice.id}/payments`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: numericAmount, payment_method: method, transaction_reference: reference, payment_date: paymentDate || null, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record payment.");
      await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to record payment."); }
    finally { setSaving(false); }
  };

  const field = "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-3 sm:p-5">
      <div className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white text-gray-900 shadow-2xl dark:bg-gray-950 dark:text-gray-100 sm:max-h-[calc(100vh-2.5rem)]">
        <div className="flex items-center justify-between border-b border-gray-200 p-5 dark:border-gray-800">
          <div><h2 className="font-bold text-gray-900 dark:text-white">Record payment</h2><p className="text-xs text-gray-500 dark:text-gray-400">{invoice.invoice_number} · Balance {money(invoice.amount_due)}</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close"><X size={19}/></button>
        </div>
        <div className="min-h-0 space-y-4 overflow-y-auto p-5">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
          <label className="block text-sm"><span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">Amount</span><input type="number" min="0.01" max={Number(invoice.amount_due)} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm"><span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">Payment method</span><select value={method} onChange={(e) => setMethod(e.target.value)} className={field}><option className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white" value="other">Other</option><option className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white" value="cash">Cash</option><option className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white" value="bank_transfer">Bank transfer</option><option className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white" value="mobile_money">Mobile money</option><option className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white" value="card">Card</option><option className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white" value="cheque">Cheque</option></select></label>
            <label className="block text-sm"><span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">Payment date</span><input type="datetime-local" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={field} /></label>
          </div>
          <label className="block text-sm"><span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">Transaction reference</span><input value={reference} onChange={(e) => setReference(e.target.value)} className={field} /></label>
          <label className="block text-sm"><span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">Notes</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={field} /></label>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 p-4 dark:border-gray-800"><button type="button" onClick={onClose} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-800 dark:border-gray-700 dark:text-gray-100">Cancel</button><button type="button" disabled={saving} onClick={submit} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Record payment"}</button></div>
      </div>
    </div>
  );
}

// ==========================================
// EXPORT INVOICE CSV
// ==========================================

function exportInvoiceCsv(invoice: InvoiceDetails) {
  const rows = [
    ["Invoice", invoice.invoice_number],
    ["Customer", invoice.customer?.company_name || ""],
    ["Contact", invoice.customer?.contact_name || ""],
    ["Email", invoice.customer?.email || ""],
    ["Phone", invoice.customer?.phone || ""],
    ["Issue date", invoice.issue_date],
    ["Due date", invoice.due_date || ""],
    ["Status", getDisplayStatus(invoice)],
    ["Subtotal", String(invoice.subtotal)],
    ["Tax", String(invoice.tax_amount)],
    ["Total", String(invoice.total_amount)],
    ["Paid", String(invoice.amount_paid)],
    ["Balance due", String(invoice.amount_due)],
    [],
    ["Description", "Quantity", "Unit price", "Tax rate", "Tax amount", "Line total"],
    ...(invoice.invoice_items || []).map((item) => [item.description, String(item.quantity), String(item.unit_price), String(item.tax_rate), String(item.tax_amount), String(item.line_total)]),
    [],
    ["Payment date", "Amount", "Method", "Reference", "Status", "Notes"],
    ...(invoice.payments || []).map((p) => [p.payment_date, String(p.amount), p.payment_method, p.transaction_reference || "", p.status, p.notes || ""]),
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${invoice.invoice_number}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ==========================================
// PRINT INVOICE
// ==========================================

function printInvoice(invoice: InvoiceDetails) {
  const items = (invoice.invoice_items || []).map((item) => `<tr><td>${escapeHtml(item.description)}</td><td>${item.quantity}</td><td>${money(item.unit_price)}</td><td>${item.tax_rate}%</td><td>${money(item.line_total)}</td></tr>`).join("");
  const html = `<!doctype html><html><head><title>${escapeHtml(invoice.invoice_number)}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{margin-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}th:nth-child(n+2),td:nth-child(n+2){text-align:right}.totals{margin:24px 0 0 auto;max-width:320px}.row{display:flex;justify-content:space-between;padding:5px}.grand{font-weight:700;border-top:2px solid #111;padding-top:10px}</style></head><body><h1>${escapeHtml(invoice.invoice_number)}</h1><p>${escapeHtml(invoice.customer?.company_name || "")} · ${escapeHtml(invoice.customer?.email || "")} · ${escapeHtml(invoice.customer?.phone || "")}</p><p>Issued: ${escapeHtml(dateText(invoice.issue_date))} · Due: ${escapeHtml(dateText(invoice.due_date))}</p><table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Tax</th><th>Total</th></tr></thead><tbody>${items}</tbody></table><div class="totals"><div class="row"><span>Subtotal</span><span>${money(invoice.subtotal)}</span></div><div class="row"><span>Tax</span><span>${money(invoice.tax_amount)}</span></div><div class="row grand"><span>Total</span><span>${money(invoice.total_amount)}</span></div><div class="row"><span>Paid</span><span>${money(invoice.amount_paid)}</span></div><div class="row"><span>Balance due</span><span>${money(invoice.amount_due)}</span></div></div>${invoice.notes ? `<p><strong>Notes:</strong><br>${escapeHtml(invoice.notes).replace(/\n/g,"<br>")}</p>` : ""}</body></html>`;
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { alert("Please allow pop-ups to print this invoice."); return; }
  win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 250);
}

// ==========================================
// ESCAPE HTML
// ==========================================

function escapeHtml(value: string) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}

// ==========================================
// SHARE INVOICE MODAL
// ==========================================

function ShareInvoiceModal({
  invoice,
  onClose,
}: {
  invoice: InvoiceDetails;
  onClose: () => void;
}) {
  const [channel, setChannel] = useState<"whatsapp" | "email" | "photo">(
    "whatsapp"
  );
  const [recipient, setRecipient] = useState(
    invoice.customer?.phone || invoice.customer?.email || ""
  );
  const [extra, setExtra] = useState("");
  const [copied, setCopied] = useState(false);

  const [business, setBusiness] = useState<{
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    logo_url?: string | null;
    address?: string | null;
    website?: string | null;
    tax_id?: string | null;
    registration_number?: string | null;
  } | null>(null);

  const [loadingBusiness, setLoadingBusiness] = useState(true);
  const [generatingPhoto, setGeneratingPhoto] = useState(false);

  const invoiceImageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const loadBusiness = async () => {
      try {
        setLoadingBusiness(true);

        const response = await fetch("/api/business/settings", {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to load business settings.");
        }

        const data = await response.json();

        if (!cancelled) {
          setBusiness(data.business || data);
        }
      } catch (error) {
        console.error("Failed to load business settings:", error);

        if (!cancelled) {
          setBusiness(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingBusiness(false);
        }
      }
    };

    loadBusiness();

    return () => {
      cancelled = true;
    };
  }, []);

  const defaultMessage = `Hello ${
    invoice.customer?.contact_name ||
    invoice.customer?.company_name ||
    "there"
  },

Please find invoice ${invoice.invoice_number} for ${money(
    invoice.total_amount
  )}.
Amount paid: ${money(invoice.amount_paid)}
Balance due: ${money(invoice.amount_due)}
Due date: ${dateText(invoice.due_date)}${extra ? `\n\n${extra}` : ""}

Thank you.`;

  const message = defaultMessage;

  const share = () => {
    if (!recipient.trim()) return;

    if (channel === "whatsapp") {
      let phone = recipient.replace(/[^0-9+]/g, "");

      if (phone.startsWith("0")) {
        phone = `254${phone.slice(1)}`;
      } else if (phone.startsWith("+")) {
        phone = phone.slice(1);
      }

      window.open(
        `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener,noreferrer"
      );
    } else {
      window.location.href = `mailto:${encodeURIComponent(
        recipient.trim()
      )}?subject=${encodeURIComponent(
        `Invoice ${invoice.invoice_number}`
      )}&body=${encodeURIComponent(message)}`;
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(message);
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 1600);
  };

  const switchChannel = (
    next: "whatsapp" | "email" | "photo"
  ) => {
    setChannel(next);

    if (next === "whatsapp") {
      setRecipient(invoice.customer?.phone || "");
    } else if (next === "email") {
      setRecipient(invoice.customer?.email || "");
    } else {
      setRecipient("");
    }
  };

  const generateInvoicePhoto = async () => {
    if (!invoiceImageRef.current || generatingPhoto) return;

    try {
      setGeneratingPhoto(true);

      const dataUrl = await toPng(invoiceImageRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });

      const fileName = `Invoice-${invoice.invoice_number}.png`;

      const response = await fetch(dataUrl);
      const blob = await response.blob();

      const file = new File([blob], fileName, {
        type: "image/png",
      });

      if (
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          title: `Invoice ${invoice.invoice_number}`,
          text: message,
          files: [file],
        });

        return;
      }

      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Failed to generate invoice photo:", error);
      alert("Unable to generate the invoice photo. Please try again.");
    } finally {
      setGeneratingPhoto(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-3 sm:p-5">
      <div className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white text-gray-900 shadow-2xl dark:bg-gray-950 dark:text-gray-100 sm:max-h-[calc(100vh-2.5rem)]">

        {/* HEADER */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 p-4 dark:border-gray-800 sm:p-5">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Share invoice
            </h2>

            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              Share the invoice by WhatsApp, email, or as a professional
              invoice image.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close"
          >
            <X size={19} />
          </button>
        </div>

        {/* BODY */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="space-y-5">

            {/* CHANNELS */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => switchChannel("whatsapp")}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                  channel === "whatsapp"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-200"
                }`}
              >
                <MessageCircle
                  className="mr-2 inline"
                  size={17}
                />
                WhatsApp
              </button>

              <button
                type="button"
                onClick={() => switchChannel("email")}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                  channel === "email"
                    ? "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-400"
                    : "border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-200"
                }`}
              >
                <Mail
                  className="mr-2 inline"
                  size={17}
                />
                Email
              </button>

              <button
                type="button"
                onClick={() => switchChannel("photo")}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                  channel === "photo"
                    ? "border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-400"
                    : "border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-200"
                }`}
              >
                <ImageIcon
                  className="mr-2 inline"
                  size={17}
                />
                Photo
              </button>
            </div>

            {/* RECIPIENT */}
            {channel !== "photo" && (
              <label className="block text-sm text-gray-900 dark:text-gray-100">
                <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  {channel === "whatsapp"
                    ? "WhatsApp number"
                    : "Email address"}
                </span>

                <input
                  value={recipient}
                  onChange={(e) =>
                    setRecipient(e.target.value)
                  }
                  placeholder={
                    channel === "whatsapp"
                      ? "e.g. +254712345678"
                      : "customer@example.com"
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white placeholder:text-gray-400"
                />
              </label>
            )}

            {/* EXTRA MESSAGE */}
            <label className="block text-sm text-gray-900 dark:text-gray-100">
              <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                Additional details/message (optional)
              </span>

              <textarea
                value={extra}
                onChange={(e) =>
                  setExtra(e.target.value)
                }
                rows={4}
                placeholder="Add delivery instructions, payment details, a personal note, etc."
                className="w-full resize-y rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white placeholder:text-gray-400"
              />
            </label>

            {/* PHOTO PREVIEW */}
            {channel === "photo" && (
              <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-3 dark:border-purple-900/50 dark:bg-purple-950/20">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      Invoice image preview
                    </p>

                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Your business logo is pulled from Business Settings.
                    </p>
                  </div>

                  {loadingBusiness && (
                    <Loader2
                      size={17}
                      className="animate-spin text-gray-500"
                    />
                  )}
                </div>

                <div className="overflow-x-auto rounded-xl bg-gray-200 p-3 dark:bg-gray-900">
                  <div
                    ref={invoiceImageRef}
                    className="mx-auto w-[760px] bg-white p-10 text-gray-900"
                  >
                    {/* BRAND HEADER */}
                    <div className="flex items-start justify-between border-b-2 border-gray-900 pb-7">
                      <div className="flex items-center gap-4">
                        {business?.logo_url ? (
                          <img
                            src={business.logo_url}
                            alt={business.name || "Company logo"}
                            crossOrigin="anonymous"
                            className="h-20 w-20 rounded-xl object-contain"
                          />
                        ) : (
                          <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-gray-900 text-xl font-black text-white">
                            SaMi
                          </div>
                        )}

                        <div>
                          <h1 className="text-2xl font-black">
                            {business?.name ||
                              "Your Business"}
                          </h1>

                          <div className="mt-2 space-y-0.5 text-xs text-gray-500">
                            {business?.email && (
                              <p>{business.email}</p>
                            )}

                            {business?.phone && (
                              <p>{business.phone}</p>
                            )}

                            {business?.address && (
                              <p>{business.address}</p>
                            )}

                            {business?.website && (
                              <p>{business.website}</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                          Invoice
                        </p>

                        <p className="mt-1 text-2xl font-black">
                          {invoice.invoice_number}
                        </p>

                        <p className="mt-2 text-xs text-gray-500">
                          Issued:{" "}
                          {dateText(invoice.issue_date)}
                        </p>

                        {invoice.due_date && (
                          <p className="text-xs text-gray-500">
                            Due:{" "}
                            {dateText(invoice.due_date)}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* CUSTOMER */}
                    <div className="grid grid-cols-2 gap-8 py-7">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                          Bill To
                        </p>

                        <p className="mt-2 text-base font-bold">
                          {invoice.customer?.company_name ||
                            "Unknown customer"}
                        </p>

                        {invoice.customer?.contact_name && (
                          <p className="text-sm text-gray-600">
                            {invoice.customer.contact_name}
                          </p>
                        )}

                        {invoice.customer?.email && (
                          <p className="mt-1 text-xs text-gray-500">
                            {invoice.customer.email}
                          </p>
                        )}

                        {invoice.customer?.phone && (
                          <p className="text-xs text-gray-500">
                            {invoice.customer.phone}
                          </p>
                        )}

                        {invoice.customer?.address && (
                          <p className="mt-1 whitespace-pre-line text-xs text-gray-500">
                            {invoice.customer.address}
                          </p>
                        )}
                      </div>

                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                          Status
                        </p>

                        <p className="mt-2 text-sm font-bold">
                          {LABELS[
                            getDisplayStatus(invoice)
                          ]}
                        </p>

                        <p className="mt-3 text-xs text-gray-500">
                          Amount paid:{" "}
                          {money(invoice.amount_paid)}
                        </p>

                        <p className="text-xs font-semibold text-gray-900">
                          Balance due:{" "}
                          {money(invoice.amount_due)}
                        </p>
                      </div>
                    </div>

                    {/* ITEMS */}
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-y border-gray-200 bg-gray-50">
                          <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wide">
                            Description
                          </th>

                          <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wide">
                            Qty
                          </th>

                          <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wide">
                            Unit
                          </th>

                          <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wide">
                            Tax
                          </th>

                          <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wide">
                            Total
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {(invoice.invoice_items || []).map(
                          (item) => (
                            <tr
                              key={item.id}
                              className="border-b border-gray-100"
                            >
                              <td className="px-3 py-4 text-sm font-medium">
                                {item.description}
                              </td>

                              <td className="px-3 py-4 text-right text-sm">
                                {item.quantity}
                              </td>

                              <td className="px-3 py-4 text-right text-sm">
                                {money(item.unit_price)}
                              </td>

                              <td className="px-3 py-4 text-right text-sm">
                                {money(item.tax_amount)}
                              </td>

                              <td className="px-3 py-4 text-right text-sm font-bold">
                                {money(item.line_total)}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>

                    {/* TOTALS */}
                    <div className="mt-8 flex justify-end">
                      <div className="w-72 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">
                            Subtotal
                          </span>

                          <span className="font-medium">
                            {money(invoice.subtotal)}
                          </span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-gray-500">
                            Tax
                          </span>

                          <span className="font-medium">
                            {money(invoice.tax_amount)}
                          </span>
                        </div>

                        <div className="flex justify-between border-t-2 border-gray-900 pt-3 text-lg font-black">
                          <span>Total</span>
                          <span>
                            {money(invoice.total_amount)}
                          </span>
                        </div>

                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">
                            Paid
                          </span>

                          <span>
                            {money(invoice.amount_paid)}
                          </span>
                        </div>

                        <div className="flex justify-between font-bold">
                          <span>Balance due</span>

                          <span>
                            {money(invoice.amount_due)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* EXTRA MESSAGE */}
                    {extra.trim() && (
                      <div className="mt-8 rounded-xl bg-gray-50 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                          Additional information
                        </p>

                        <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-gray-600">
                          {extra}
                        </p>
                      </div>
                    )}

                    {/* FOOTER / WATERMARK */}
                    <div className="mt-10 flex items-end justify-between border-t border-gray-200 pt-5">
                      <div>
                        {business?.tax_id && (
                          <p className="text-[10px] text-gray-400">
                            Tax ID: {business.tax_id}
                          </p>
                        )}

                        {business?.registration_number && (
                          <p className="text-[10px] text-gray-400">
                            Registration:{" "}
                            {business.registration_number}
                          </p>
                        )}
                      </div>

                      <p className="text-[10px] font-semibold tracking-wide text-gray-300">
                        Powered by SaMi
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TEXT MESSAGE PREVIEW */}
            {channel !== "photo" && (
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Message preview
                  </p>

                  <button
                    type="button"
                    onClick={copy}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                  >
                    {copied ? (
                      <Check size={14} />
                    ) : (
                      <Copy size={14} />
                    )}

                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>

                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                  {message}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-800 dark:border-gray-700 dark:text-gray-100"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={
              channel === "photo"
                ? generatingPhoto
                : !recipient.trim()
            }
            onClick={() => {
              if (channel === "photo") {
                generateInvoicePhoto();
                return;
              }

              share();
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900"
          >
            {channel === "photo" ? (
              generatingPhoto ? (
                <Loader2
                  size={16}
                  className="animate-spin"
                />
              ) : (
                <ImageIcon size={16} />
              )
            ) : channel === "whatsapp" ? (
              <MessageCircle size={16} />
            ) : (
              <Mail size={16} />
            )}

            {channel === "photo"
              ? generatingPhoto
                ? "Preparing..."
                : "Share Invoice Photo"
              : channel === "whatsapp"
              ? "Open WhatsApp"
              : "Open Email"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// CUSTOMER MANAGER
// ==========================================

function CustomerManager() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    address: "",
    status: "active",
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/customers", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load customers.");
      setCustomers(Array.isArray(data) ? data : data.customers || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load customers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = customers.filter((customer) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [customer.company_name, customer.contact_name, customer.email, customer.phone]
      .some((value) => String(value || "").toLowerCase().includes(q));
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ company_name: "", contact_name: "", email: "", phone: "", address: "", status: "active" });
    setShowForm(true);
  };

  const openEdit = (customer: Customer) => {
    setEditing(customer);
    setForm({
      company_name: customer.company_name || "",
      contact_name: customer.contact_name || "",
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
      status: "active",
    });
    setShowForm(true);
  };

  const save = async () => {
    try {
      if (!form.company_name.trim()) throw new Error("Company name is required.");
      setSaving(true);
      setError("");
      const res = await fetch(editing ? `/api/customers/${editing.id}` : "/api/customers", {
        method: editing ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save customer.");
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save customer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-gray-500">Invoicing · Customers</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">Customers</h1>
          <p className="mt-1 text-sm text-gray-500">Manage the customers connected to your invoices.</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-900">
          <UserPlus size={17} /> Add customer
        </button>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Customers" value={String(customers.length)} icon={Users} />
        <StatCard label="Active" value={String(customers.filter((c) => (c as Customer & { status?: string }).status !== "inactive").length)} icon={Users} />
        <StatCard label="With email" value={String(customers.filter((c) => c.email).length)} icon={FileText} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
          <div><h2 className="font-semibold">Customer register</h2><p className="text-xs text-gray-500">{filtered.length} customer{filtered.length === 1 ? "" : "s"}</p></div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customers" className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 sm:w-72 dark:border-gray-700 dark:bg-gray-800 dark:text-white placeholder:text-gray-400" />
        </div>
        {loading ? <div className="p-10 text-center text-sm text-gray-500">Loading customers…</div> : filtered.length === 0 ? <div className="p-10 text-center text-sm text-gray-500">No customers found.</div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm text-gray-900 dark:text-gray-100"><thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800/50"><tr><th className="px-5 py-3">Company</th><th className="px-5 py-3">Contact</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Phone</th><th className="px-5 py-3">Address</th><th className="px-5 py-3">Actions</th></tr></thead><tbody className="divide-y dark:divide-gray-800">{filtered.map((customer) => <tr key={customer.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40"><td className="px-5 py-4 font-semibold">{customer.company_name}</td><td className="px-5 py-4">{customer.contact_name || "—"}</td><td className="px-5 py-4">{customer.email || "—"}</td><td className="px-5 py-4">{customer.phone || "—"}</td><td className="max-w-xs truncate px-5 py-4">{customer.address || "—"}</td><td className="px-5 py-4"><button onClick={() => openEdit(customer)} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold dark:border-gray-700"><Pencil size={13}/> Edit</button></td></tr>)}</tbody></table></div>
        )}
      </section>

      {showForm && <CustomerFormModal form={form} setForm={setForm} editing={editing} saving={saving} onClose={() => setShowForm(false)} onSave={save} />}
    </div>
  );
}

// ==========================================
// CUSTOMER FORM MODAL
// ==========================================

function CustomerFormModal({
  form, setForm, editing, saving, onClose, onSave,
}: {
  form: { company_name: string; contact_name: string; email: string; phone: string; address: string; status: string };
  setForm: Dispatch<SetStateAction<{ company_name: string; contact_name: string; email: string; phone: string; address: string; status: string }>>;
  editing: Customer | null;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const field = (key: keyof typeof form, labelText: string, type = "text") => (
    <label className="text-sm text-gray-900 dark:text-gray-100"><span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">{labelText}</span><input type={type} value={form[key]} onChange={(e) => setForm((v) => ({ ...v, [key]: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white placeholder:text-gray-400" /></label>
  );
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4"><div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white text-gray-900 shadow-2xl dark:bg-gray-950 dark:text-gray-100"><div className="flex items-center justify-between border-b p-5 dark:border-gray-800"><div><h2 className="font-bold">{editing ? "Edit customer" : "Add customer"}</h2><p className="text-xs text-gray-500">Fields match the invoicing customers schema.</p></div><button onClick={onClose}><X size={19}/></button></div><div className="grid min-h-0 gap-4 overflow-y-auto p-5 sm:grid-cols-2">{field("company_name", "Company name")}{field("contact_name", "Contact name")}{field("email", "Email", "email")}{field("phone", "Phone")}{field("address", "Address")}{field("status", "Status")}</div><div className="flex justify-end gap-2 border-t p-4 dark:border-gray-800"><button onClick={onClose} className="rounded-xl border px-4 py-2.5 text-sm dark:border-gray-700">Cancel</button><button disabled={saving} onClick={onSave} className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">{saving ? "Saving…" : editing ? "Save changes" : "Add customer"}</button></div></div></div>;
}

// ==========================================
// PAYMENTS MANAGER
// ==========================================

function PaymentsManager({ onOpenInvoice }: { onOpenInvoice: (id: string) => Promise<void> }) {
  const [payments, setPayments] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const res = await fetch("/api/invoices/payments", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load payments.");
      setPayments(data.payments || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load payments."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const total = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  return <div className="space-y-6 text-gray-900 dark:text-gray-100"><header><p className="text-sm text-gray-500 dark:text-gray-400">Invoicing · Payments</p><h1 className="mt-1 text-2xl font-bold">Payments</h1><p className="mt-1 text-sm text-gray-500">Track money received against invoices.</p></header>{error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}<section className="grid gap-4 sm:grid-cols-2"><StatCard label="Payments recorded" value={String(payments.length)} icon={CreditCard}/><StatCard label="Total received" value={money(total)} icon={Wallet}/></section><section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"><div className="border-b p-4 dark:border-gray-800"><h2 className="font-semibold">Payment register</h2></div>{loading ? <div className="p-10 text-center text-sm text-gray-500">Loading payments…</div> : payments.length === 0 ? <div className="p-10 text-center text-sm text-gray-500">No payments recorded yet.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm text-gray-900 dark:text-gray-100"><thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800/50"><tr><th className="px-5 py-3">Invoice</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Method</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y dark:divide-gray-800">{payments.map((p) => <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40"><td className="px-5 py-4"><button onClick={() => onOpenInvoice(p.invoice_id)} className="font-semibold text-blue-600 hover:underline">{p.invoice_number}</button></td><td className="px-5 py-4">{p.company_name || "—"}</td><td className="px-5 py-4 font-semibold">{money(p.amount)}</td><td className="px-5 py-4 capitalize">{p.payment_method}</td><td className="px-5 py-4">{p.transaction_reference || "—"}</td><td className="px-5 py-4">{dateText(p.payment_date)}</td><td className="px-5 py-4 capitalize">{p.status}</td></tr>)}</tbody></table></div>}</section></div>;
}

// ==========================================
// ALL INVOICES VIEW
// ==========================================

function AllInvoicesView({ onOpenInvoice }: { onOpenInvoice: (id: string) => Promise<void> }) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (filter !== "all") params.append("status", filter);
      params.append("page", String(page));
      params.append("limit", String(limit));

      const res = await fetch(`/api/invoices?${params.toString()}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load invoices.");
      setInvoices(data.invoices || []);
      setTotal(data.pagination?.total || data.invoices?.length || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  }, [search, filter, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-gray-500">Invoicing · All Invoices</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">All Invoices</h1>
        <p className="mt-1 text-sm text-gray-500">View and manage all your invoices in one place.</p>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoices..."
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="viewed">Viewed</option>
          <option value="partially_paid">Partially Paid</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
          <option value="void">Void</option>
        </select>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <Loader2 size={28} className="animate-spin text-gray-400" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-center p-6">
            <FileText size={32} className="text-gray-400" />
            <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">No invoices found</h3>
            <p className="mt-1 text-sm text-gray-500">Try changing your search or filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800/50">
                <tr>
                  <th className="px-5 py-3.5">Invoice</th>
                  <th className="px-5 py-3.5">Customer</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Due</th>
                  <th className="px-5 py-3.5 text-right">Total</th>
                  <th className="px-5 py-3.5 text-right">Balance</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-800">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer" onClick={() => onOpenInvoice(invoice.id)}>
                    <td className="px-5 py-4 text-sm font-semibold">{invoice.invoice_number}</td>
                    <td className="px-5 py-4 text-sm">{invoice.customer?.company_name || "—"}</td>
                    <td className="px-5 py-4 text-sm text-gray-500">{dateText(invoice.issue_date)}</td>
                    <td className="px-5 py-4 text-sm text-gray-500">{dateText(invoice.due_date)}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-right">{money(invoice.total_amount)}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-right">{money(invoice.amount_due)}</td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 text-xs rounded-full ${statusClass(getDisplayStatus(invoice))}`}>
                        {LABELS[getDisplayStatus(invoice)]}
                      </span>
                    </td>
                    <td className="px-5 py-4"><ChevronRight size={17} className="text-gray-400" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 border rounded-lg disabled:opacity-50">Previous</button>
            <span className="px-3 py-1 text-sm">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 border rounded-lg disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// CREATE INVOICE PAGE
// ==========================================

function CreateInvoicePage({ onCreated }: { onCreated: () => Promise<void> }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([
    { description: "", quantity: "1", unit_price: "0", tax_rate: "0" },
  ]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [customersRes, productsRes, termsRes] = await Promise.all([
          fetch("/api/customers", { credentials: "include" }),
          fetch("/api/products", { credentials: "include" }),
          fetch("/api/payment-terms", { credentials: "include" }),
        ]);
        const customersData = await customersRes.json();
        const productsData = await productsRes.json();
        const termsData = await termsRes.json();
        setCustomers(customersData.customers || []);
        setProducts(productsData.products || []);
        setPaymentTerms(termsData.paymentTerms || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load data.");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const updateItem = (index: number, field: keyof DraftItem, value: string) => {
    setItems((current) => current.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const addItem = () => {
    setItems([...items, { description: "", quantity: "1", unit_price: "0", tax_rate: "0" }]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
  const tax = items.reduce((sum, item) => {
    const line = Number(item.quantity || 0) * Number(item.unit_price || 0);
    return sum + (line * Number(item.tax_rate || 0)) / 100;
  }, 0);
  const total = subtotal + tax;

  const handleCustomerChange = (id: string) => {
    setCustomerId(id);
    const customer = customers.find(c => c.id === id);
    setSelectedCustomer(customer || null);
  };

  const submit = async () => {
    try {
      setSaving(true);
      setError("");
      if (!customerId) throw new Error("Select a customer.");
      if (items.some(item => !item.description.trim())) throw new Error("Every invoice item needs a description.");
      if (items.some(item => Number(item.quantity) <= 0 || Number(item.unit_price) < 0 || Number(item.tax_rate) < 0)) {
        throw new Error("Check quantity, price and tax values.");
      }

      const res = await fetch("/api/invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          due_date: dueDate || null,
          po_number: poNumber || null,
          notes: notes.trim() || null,
          items: items.map(item => ({
            description: item.description.trim(),
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price),
            tax_rate: Number(item.tax_rate),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create invoice.");
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create invoice.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 size={28} className="animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-gray-500">Invoicing · Create Invoice</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">Create Invoice</h1>
        <p className="mt-1 text-sm text-gray-500">Create a new invoice for your customer.</p>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Customer & Details */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Invoice Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Customer *</label>
                <select value={customerId} onChange={(e) => handleCustomerChange(e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                  <option value="">Select customer...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">PO Number</label>
                <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO-12345" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Issue Date</label>
                <input type="date" value={new Date().toISOString().split('T')[0]} disabled className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white opacity-70" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Line Items</h3>
              <button onClick={addItem} className="inline-flex items-center gap-1 text-sm text-blue-600"><Plus size={16} /> Add item</button>
            </div>
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-5">
                    <input type="text" value={item.description} onChange={(e) => updateItem(index, "description", e.target.value)} placeholder="Description" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                  </div>
                  <div className="col-span-2">
                    <input type="number" value={item.quantity} onChange={(e) => updateItem(index, "quantity", e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-center dark:border-gray-700 dark:bg-gray-800 dark:text-white" min="0.01" step="0.01" />
                  </div>
                  <div className="col-span-2">
                    <input type="number" value={item.unit_price} onChange={(e) => updateItem(index, "unit_price", e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-right dark:border-gray-700 dark:bg-gray-800 dark:text-white" min="0" step="0.01" />
                  </div>
                  <div className="col-span-2">
                    <input type="number" value={item.tax_rate} onChange={(e) => updateItem(index, "tax_rate", e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-center dark:border-gray-700 dark:bg-gray-800 dark:text-white" min="0" max="100" step="0.01" />
                  </div>
                  <div className="col-span-1 text-right">
                    <button onClick={() => removeItem(index)} disabled={items.length <= 1} className="text-red-500 disabled:opacity-30"><X size={18} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes..." className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900 sticky top-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{money(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{money(tax)}</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-2 font-bold text-lg"><span>Total</span><span>{money(total)}</span></div>
              <div className="flex justify-between text-xs text-gray-500"><span>Items</span><span>{items.length}</span></div>
              <div className="flex justify-between text-xs text-gray-500"><span>Customer</span><span>{selectedCustomer?.company_name || "None"}</span></div>
            </div>
            <button onClick={submit} disabled={saving} className="w-full mt-4 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">
              {saving ? <Loader2 size={17} className="animate-spin inline mr-2" /> : null}
              {saving ? "Creating..." : "Create Invoice"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// PRODUCTS MANAGER
// ==========================================

function ProductsManager() {
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    sku: "",
    unit_price: "",
    tax_rate_id: "",
    category: "",
    notes: "",
  });
  const [taxRates, setTaxRates] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [productsRes, taxRes] = await Promise.all([
        fetch("/api/products", { credentials: "include" }),
        fetch("/api/tax-rates", { credentials: "include" }),
      ]);

      const productsData = await productsRes.json();
      const taxData = await taxRes.json();

      if (!productsRes.ok) throw new Error(productsData.error || "Failed to load products.");
      if (!taxRes.ok) throw new Error(taxData.error || "Failed to load tax rates.");

      setProducts(Array.isArray(productsData) ? productsData : productsData.products || []);
      setTaxRates(Array.isArray(taxData) ? taxData : taxData.taxRates || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load products.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = products.filter((product) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [product.name, product.sku, product.category, product.description]
      .some((value) => String(value || "").toLowerCase().includes(q));
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "", sku: "", unit_price: "", tax_rate_id: "", category: "", notes: "" });
    setShowForm(true);
  };

  const openEdit = (product: any) => {
    setEditing(product);
    setForm({
      name: product.name || "",
      description: product.description || "",
      sku: product.sku || "",
      unit_price: product.unit_price || "",
      tax_rate_id: product.tax_rate_id || "",
      category: product.category || "",
      notes: product.notes || "",
    });
    setShowForm(true);
  };

  const save = async () => {
    try {
      if (!form.name.trim()) throw new Error("Product name is required.");
      if (!form.unit_price || parseFloat(form.unit_price) < 0) throw new Error("Valid unit price is required.");

      setSaving(true);
      setError("");

      const payload = {
        name: form.name.trim(),
        description: form.description?.trim() || null,
        sku: form.sku?.trim() || null,
        unit_price: parseFloat(form.unit_price),
        tax_rate_id: form.tax_rate_id || null,
        category: form.category?.trim() || null,
        notes: form.notes?.trim() || null,
      };

      const res = await fetch(editing ? `/api/products/${editing.id}` : "/api/products", {
        method: editing ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save product.");

      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save product.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (product: any) => {
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !product.is_active }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update product.");
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update product.");
    }
  };

  const deleteProduct = async (product: any) => {
    if (!confirm(`Delete "${product.name}"? This action cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete product.");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete product.");
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-gray-500">Invoicing · Products</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">Products & Services</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your product and service catalog for invoicing.</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-900">
          <Plus size={17} /> Add product
        </button>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total products" value={String(products.length)} icon={Package} />
        <StatCard label="Active" value={String(products.filter(p => p.is_active).length)} icon={Package} />
        <StatCard label="Categories" value={String([...new Set(products.map(p => p.category).filter(Boolean))].length)} icon={Package} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
          <div><h2 className="font-semibold">Product catalog</h2><p className="text-xs text-gray-500">{filtered.length} product{filtered.length === 1 ? "" : "s"}</p></div>
          <div className="flex gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..." className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 sm:w-72 dark:border-gray-700 dark:bg-gray-800 dark:text-white placeholder:text-gray-400" />
          </div>
        </div>
        {loading ? <div className="p-10 text-center text-sm text-gray-500">Loading products…</div> : filtered.length === 0 ? <div className="p-10 text-center text-sm text-gray-500">No products found.</div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm text-gray-900 dark:text-gray-100"><thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800/50"><tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">SKU</th><th className="px-5 py-3">Price</th><th className="px-5 py-3">Tax</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Actions</th></tr></thead><tbody className="divide-y dark:divide-gray-800">{filtered.map((product) => {
            const taxRate = taxRates.find(t => t.id === product.tax_rate_id);
            return <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
              <td className="px-5 py-4 font-semibold">{product.name}</td>
              <td className="px-5 py-4">{product.sku || "—"}</td>
              <td className="px-5 py-4">${Number(product.unit_price).toFixed(2)}</td>
              <td className="px-5 py-4">{taxRate ? `${taxRate.rate}%` : "—"}</td>
              <td className="px-5 py-4">{product.category || "—"}</td>
              <td className="px-5 py-4">
                <button onClick={() => toggleActive(product)} className={`px-2 py-1 text-xs rounded-full ${product.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                  {product.is_active ? "Active" : "Inactive"}
                </button>
              </td>
              <td className="px-5 py-4">
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(product)} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold dark:border-gray-700"><Pencil size={13}/> Edit</button>
                  <button onClick={() => deleteProduct(product)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/30 dark:text-red-400"><Trash2 size={13}/></button>
                </div>
              </td>
            </tr>;
          })}</tbody></table></div>
        )}
      </section>

      {showForm && <ProductFormModal form={form} setForm={setForm} editing={editing} saving={saving} taxRates={taxRates} onClose={() => setShowForm(false)} onSave={save} />}
    </div>
  );
}

// ==========================================
// PRODUCT FORM MODAL
// ==========================================

function ProductFormModal({
  form, setForm, editing, saving, taxRates, onClose, onSave,
}: {
  form: any;
  setForm: (form: any) => void;
  editing: any | null;
  saving: boolean;
  taxRates: any[];
  onClose: () => void;
  onSave: () => void;
}) {
  const field = (key: string, label: string, type = "text") => (
    <label className="text-sm text-gray-900 dark:text-gray-100">
      <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
      {type === "textarea" ? (
        <textarea value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} rows={3} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white placeholder:text-gray-400" />
      ) : type === "select" ? (
        <select value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
          <option value="">None</option>
          {taxRates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.rate}%)</option>)}
        </select>
      ) : type === "number" ? (
        <input type="number" step="0.01" min="0" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white placeholder:text-gray-400" />
      ) : (
        <input type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white placeholder:text-gray-400" />
      )}
    </label>
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white text-gray-900 shadow-2xl dark:bg-gray-950 dark:text-gray-100">
        <div className="flex items-center justify-between border-b p-5 dark:border-gray-800">
          <div><h2 className="font-bold">{editing ? "Edit product" : "Add product"}</h2><p className="text-xs text-gray-500">Add products and services for your invoices.</p></div>
          <button onClick={onClose}><X size={19}/></button>
        </div>
        <div className="grid min-h-0 gap-4 overflow-y-auto p-5 sm:grid-cols-2">
          {field("name", "Product name *")}
          {field("sku", "SKU")}
          {field("unit_price", "Unit price *", "number")}
          {field("tax_rate_id", "Tax rate", "select")}
          {field("category", "Category")}
          {field("description", "Description", "textarea")}
          {field("notes", "Notes", "textarea")}
        </div>
        <div className="flex justify-end gap-2 border-t p-4 dark:border-gray-800">
          <button onClick={onClose} className="rounded-xl border px-4 py-2.5 text-sm dark:border-gray-700">Cancel</button>
          <button disabled={saving} onClick={onSave} className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">
            {saving ? "Saving…" : editing ? "Save changes" : "Add product"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// SETTINGS MANAGER
// ==========================================

function SettingsManager() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/invoice-settings", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load settings.");
      setSettings(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const res = await fetch("/api/invoice-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save settings.");
      setSettings(data);
      setSuccess("Settings saved successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[200px]"><Loader2 size={28} className="animate-spin text-gray-400" /></div>;
  }

  if (!settings) {
    return <div className="text-center py-8 text-gray-500">No settings found.</div>;
  }

  const update = (key: string, value: any) => {
    setSettings({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-gray-500">Invoicing · Settings</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">Invoice Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Customize your invoice preferences and company details.</p>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
      {success && <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300">{success}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Company Details */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Building2 size={18} /> Company Details
          </h3>
          <div className="space-y-3">
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Company Name</label>
              <input value={settings.company_name || ""} onChange={(e) => update("company_name", e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></div>
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Email</label>
              <input type="email" value={settings.company_email || ""} onChange={(e) => update("company_email", e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></div>
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Phone</label>
              <input value={settings.company_phone || ""} onChange={(e) => update("company_phone", e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></div>
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Tax ID / VAT</label>
              <input value={settings.company_tax_id || ""} onChange={(e) => update("company_tax_id", e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></div>
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Address</label>
              <textarea value={settings.company_address || ""} onChange={(e) => update("company_address", e.target.value)} rows={3} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></div>
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Website</label>
              <input value={settings.company_website || ""} onChange={(e) => update("company_website", e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></div>
          </div>
        </div>

        {/* Invoice Defaults */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <FileText size={18} /> Invoice Defaults
            </h3>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Prefix</label>
                <input value={settings.invoice_prefix || "INV-"} onChange={(e) => update("invoice_prefix", e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></div>
              <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Next Number</label>
                <input type="number" value={settings.invoice_next_number || 1} onChange={(e) => update("invoice_next_number", parseInt(e.target.value) || 1)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></div>
              <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Number Padding</label>
                <input type="number" value={settings.invoice_number_padding || 6} onChange={(e) => update("invoice_number_padding", parseInt(e.target.value) || 6)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></div>
              <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Default Currency</label>
                <select value={settings.default_currency || "USD"} onChange={(e) => update("default_currency", e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="CAD">CAD (C$)</option>
                  <option value="AUD">AUD (A$)</option>
                  <option value="KES">KES (KSh)</option>
                </select></div>
              <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Default Due Days</label>
                <input type="number" value={settings.default_due_days || 30} onChange={(e) => update("default_due_days", parseInt(e.target.value) || 30)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Bell size={18} /> Reminders
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-700 dark:text-gray-300">Enable reminders</label>
                <select value={settings.reminder_enabled ? "true" : "false"} onChange={(e) => update("reminder_enabled", e.target.value === "true")} className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
              <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Days before due</label>
                <input type="number" value={settings.reminder_days_before || 3} onChange={(e) => update("reminder_days_before", parseInt(e.target.value) || 3)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></div>
              <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Days after due</label>
                <input type="number" value={settings.reminder_days_after || 1} onChange={(e) => update("reminder_days_after", parseInt(e.target.value) || 1)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">
          <Save size={16} /> {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}