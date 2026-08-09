/* Complete invoice workspace UI.
   Place this file at:
   app/components/layout/invoices.tsx

   It expects the existing tenant-aware invoice APIs:
   GET/POST /api/invoices
   GET /api/invoices/[id]
   GET /api/invoices/stats
   GET /api/customers
*/

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  FileText,
  Loader2,
  Plus,
  Receipt,
  Search,
  Wallet,
  X,
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
    <div className="space-y-6">
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
          onClick={() => setShowCreate(true)}
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
                onClick={() => setShowCreate(true)}
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
  const [showPayment, setShowPayment] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("mobile_money");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [shareMethod, setShareMethod] = useState<"whatsapp" | "email">("whatsapp");
  const [shareRecipient, setShareRecipient] = useState("");
  const [shareExtra, setShareExtra] = useState("");
  const [copied, setCopied] = useState(false);

  if (loading || !invoice) {
    return (
      <div className="flex min-h-[500px] items-center justify-center text-gray-500 dark:text-gray-300">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  const status = getDisplayStatus(invoice);
  const customer = invoice.customer;

  const invoiceShareText = [
    `Invoice ${invoice.invoice_number}`,
    `Customer: ${customer?.company_name || "Customer"}`,
    `Total: ${money(invoice.total_amount)}`,
    `Paid: ${money(invoice.amount_paid)}`,
    `Balance due: ${money(invoice.amount_due)}`,
    `Due: ${dateText(invoice.due_date)}`,
    shareExtra.trim() ? `\n${shareExtra.trim()}` : "",
  ].filter(Boolean).join("\n");

  const openShare = () => {
    setShareMethod("whatsapp");
    setShareRecipient(customer?.phone || "");
    setShareExtra("");
    setCopied(false);
    setShowShare(true);
  };

  const openPayment = () => {
    setPaymentError("");
    setPaymentAmount(Number(invoice.amount_due || 0) > 0 ? String(invoice.amount_due) : "");
    setPaymentMethod("mobile_money");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentReference("");
    setPaymentNotes("");
    setShowPayment(true);
  };

  const submitPayment = async () => {
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError("Enter a valid payment amount.");
      return;
    }
    if (amount > Number(invoice.amount_due || 0) + 0.005) {
      setPaymentError("Payment cannot be greater than the outstanding balance.");
      return;
    }

    try {
      setPaymentSaving(true);
      setPaymentError("");
      const response = await fetch(`/api/invoices/${invoice.id}/payments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          payment_method: paymentMethod,
          payment_date: paymentDate,
          transaction_reference: paymentReference.trim() || null,
          notes: paymentNotes.trim() || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.details || "Failed to record payment.");
      setShowPayment(false);
      await onRefresh();
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setPaymentSaving(false);
    }
  };

  const downloadCsv = () => {
    const rows = [
      ["Invoice", "Customer", "Issue date", "Due date", "Subtotal", "Tax", "Total", "Paid", "Balance", "Status"],
      [
        invoice.invoice_number,
        customer?.company_name || "",
        dateText(invoice.issue_date),
        dateText(invoice.due_date),
        String(invoice.subtotal),
        String(invoice.tax_amount),
        String(invoice.total_amount),
        String(invoice.amount_paid),
        String(invoice.amount_due),
        LABELS[status],
      ],
    ];
    const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${invoice.invoice_number}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setShowExport(false);
  };

  const printInvoice = () => {
    setShowExport(false);
    window.setTimeout(() => window.print(), 50);
  };

  const shareInvoice = () => {
    const recipient = shareRecipient.trim();
    if (!recipient) return;

    if (shareMethod === "whatsapp") {
      const digits = recipient.replace(/[^0-9]/g, "");
      if (!digits) return;
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(invoiceShareText)}`, "_blank", "noopener,noreferrer");
    } else {
      window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(`Invoice ${invoice.invoice_number}`)}&body=${encodeURIComponent(invoiceShareText)}`;
    }
    setShowShare(false);
  };

  const copyShareText = async () => {
    await navigator.clipboard.writeText(invoiceShareText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="space-y-6 text-gray-900 dark:text-gray-100 print:space-y-3">
      <div className="flex items-center justify-between print:hidden">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
        >
          <ArrowLeft size={16} />
          Back to invoices
        </button>
      </div>

      <header className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900 print:border-gray-300 print:p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{invoice.invoice_number}</h1>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}>{LABELS[status]}</span>
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Issued {dateText(invoice.issue_date)}{invoice.due_date && ` · Due ${dateText(invoice.due_date)}`}
            </p>
          </div>

          <div className="relative flex flex-wrap gap-2 print:hidden">
            <button onClick={onRefresh} className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800">Refresh</button>
            <button onClick={openPayment} disabled={Number(invoice.amount_due || 0) <= 0} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
              <Wallet size={16} /> Record payment
            </button>
            <button onClick={openShare} className="inline-flex items-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70">
              <Share2 size={16} /> Share
            </button>
            <button onClick={() => setShowExport((v) => !v)} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100">
              <ArrowDownToLine size={16} /> Export
            </button>
            {showExport && (
              <div className="absolute right-0 top-12 z-40 w-56 rounded-xl border border-gray-200 bg-white p-2 text-gray-900 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-white">
                <button onClick={printInvoice} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800"><Printer size={16} /> Print / Save as PDF</button>
                <button onClick={downloadCsv} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800"><Download size={16} /> Download CSV</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Invoice total" value={money(invoice.total_amount)} />
        <SummaryCard label="Amount paid" value={money(invoice.amount_paid)} />
        <SummaryCard label="Balance due" value={money(invoice.amount_due)} />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800"><h2 className="text-sm font-semibold text-gray-900 dark:text-white">Customer</h2></div>
        <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {[["Company", customer?.company_name], ["Contact", customer?.contact_name], ["Email", customer?.email], ["Phone", customer?.phone]].map(([label, value]) => (
            <div key={label}>
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
              <p className="mt-1 text-sm text-gray-900 dark:text-white">{value || "—"}</p>
            </div>
          ))}
        </div>
        {customer?.address && <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-800"><p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Address</p><p className="mt-1 text-sm text-gray-900 dark:text-white">{customer.address}</p></div>}
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800"><h2 className="text-sm font-semibold text-gray-900 dark:text-white">Invoice items</h2><p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Products and services included in this invoice.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-gray-900 dark:text-gray-100">
            <thead className="bg-gray-50 text-xs uppercase text-gray-600 dark:bg-gray-800/50 dark:text-gray-300"><tr><th className="px-5 py-3 text-left">Description</th><th className="px-5 py-3 text-right">Qty</th><th className="px-5 py-3 text-right">Unit price</th><th className="px-5 py-3 text-right">Tax</th><th className="px-5 py-3 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {(invoice.invoice_items || []).map((item) => <tr key={item.id}><td className="px-5 py-4 text-sm text-gray-900 dark:text-white">{item.description}</td><td className="px-5 py-4 text-right text-sm text-gray-700 dark:text-gray-200">{item.quantity}</td><td className="px-5 py-4 text-right text-sm text-gray-700 dark:text-gray-200">{money(item.unit_price)}</td><td className="px-5 py-4 text-right text-sm text-gray-700 dark:text-gray-200">{money(item.tax_amount)} ({item.tax_rate}%)</td><td className="px-5 py-4 text-right text-sm font-semibold text-gray-900 dark:text-white">{money(item.line_total)}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-200 p-5 dark:border-gray-800"><div className="ml-auto max-w-xs space-y-2 text-sm"><SummaryRow label="Subtotal" value={money(invoice.subtotal)} /><SummaryRow label="Tax" value={money(invoice.tax_amount)} /><div className="flex justify-between border-t border-gray-200 pt-3 text-base font-bold dark:border-gray-800"><span>Total</span><span>{money(invoice.total_amount)}</span></div></div></div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800"><h2 className="text-sm font-semibold text-gray-900 dark:text-white">Payment history</h2></div>
        {!invoice.payments?.length ? <p className="p-5 text-sm text-gray-600 dark:text-gray-300">No payments have been recorded for this invoice.</p> : <div className="divide-y divide-gray-100 dark:divide-gray-800">{invoice.payments.map((payment) => <div key={payment.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-gray-900 dark:text-white">{money(payment.amount)}</p><p className="text-xs capitalize text-gray-600 dark:text-gray-400">{payment.payment_method} · {dateText(payment.payment_date)}</p></div><div className="text-left sm:text-right"><p className="text-xs text-gray-600 dark:text-gray-400">{payment.transaction_reference || "No reference"}</p><p className="mt-1 text-xs capitalize text-gray-600 dark:text-gray-400">{payment.status}</p></div></div>)}</div>}
      </section>

      {invoice.notes && <section className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800"><h2 className="text-sm font-semibold text-gray-900 dark:text-white">Notes</h2><p className="mt-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{invoice.notes}</p></section>}

      {showPayment && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-3 sm:p-6" role="dialog" aria-modal="true">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-gray-700 bg-gray-950 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-800 p-5">
              <div><h2 className="text-lg font-bold text-white">Record payment</h2><p className="mt-1 text-sm text-gray-300">{invoice.invoice_number} · Balance {money(invoice.amount_due)}</p></div>
              <button onClick={() => setShowPayment(false)} className="rounded-lg p-2 text-gray-300 hover:bg-gray-800 hover:text-white" aria-label="Close"><X size={19} /></button>
            </div>
            <div className="space-y-4 p-5">
              {paymentError && <div className="rounded-xl border border-red-800 bg-red-950/50 p-3 text-sm font-medium text-red-200">{paymentError}</div>}
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-200">Amount</span><input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-3 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-200">Payment method</span><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-3 text-sm text-white outline-none focus:border-blue-500"><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="card">Card</option><option value="cheque">Cheque</option><option value="other">Other</option></select></label>
                <label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-200">Payment date</span><input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-3 text-sm text-white outline-none focus:border-blue-500" /></label>
              </div>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-200">Transaction reference</span><input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="e.g. MPESA code / bank reference" className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-3 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500" /></label>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-200">Notes</span><textarea value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} rows={3} placeholder="Optional payment notes" className="w-full resize-none rounded-xl border border-gray-700 bg-gray-900 px-3 py-3 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500" /></label>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-800 p-5">
              <button onClick={() => setShowPayment(false)} disabled={paymentSaving} className="rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-50">Cancel</button>
              <button onClick={submitPayment} disabled={paymentSaving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">{paymentSaving && <Loader2 size={16} className="animate-spin" />} {paymentSaving ? "Saving..." : "Record payment"}</button>
            </div>
          </div>
        </div>
      )}

      {showShare && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-3 sm:p-6" role="dialog" aria-modal="true">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-gray-700 bg-gray-950 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-800 p-5"><div><h2 className="text-lg font-bold text-white">Share invoice</h2><p className="mt-1 text-sm text-gray-300">Use the customer details already stored in your database, or change them before sharing.</p></div><button onClick={() => setShowShare(false)} className="rounded-lg p-2 text-gray-300 hover:bg-gray-800 hover:text-white"><X size={19} /></button></div>
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-900 p-1">
                <button onClick={() => { setShareMethod("whatsapp"); setShareRecipient(customer?.phone || ""); }} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ${shareMethod === "whatsapp" ? "bg-emerald-600 text-white" : "text-gray-300 hover:bg-gray-800"}`}><MessageCircle size={16} /> WhatsApp</button>
                <button onClick={() => { setShareMethod("email"); setShareRecipient(customer?.email || ""); }} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ${shareMethod === "email" ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-800"}`}><Mail size={16} /> Email</button>
              </div>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-200">{shareMethod === "whatsapp" ? "WhatsApp number" : "Email address"}</span><input type={shareMethod === "email" ? "email" : "tel"} value={shareRecipient} onChange={(e) => setShareRecipient(e.target.value)} placeholder={shareMethod === "whatsapp" ? "e.g. +254700000000" : "customer@example.com"} className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-3 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500" /><p className="mt-1.5 text-xs text-gray-400">{shareMethod === "whatsapp" ? "The saved customer phone number is pre-filled when available." : "The saved customer email is pre-filled when available."}</p></label>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-200">Additional message / details</span><textarea value={shareExtra} onChange={(e) => setShareExtra(e.target.value)} rows={4} placeholder="Add payment instructions, a thank-you note, delivery details, or anything else..." className="w-full resize-none rounded-xl border border-gray-700 bg-gray-900 px-3 py-3 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500" /></label>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Message preview</p><p className="whitespace-pre-wrap text-sm leading-6 text-gray-200">{invoiceShareText}</p></div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-800 p-5"><button onClick={copyShareText} className="inline-flex items-center gap-2 rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm font-semibold text-gray-200 hover:bg-gray-800">{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy message"}</button><button onClick={() => setShowShare(false)} className="rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm font-semibold text-gray-200 hover:bg-gray-800">Cancel</button><button onClick={shareInvoice} disabled={!shareRecipient.trim()} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${shareMethod === "whatsapp" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"}`}>{shareMethod === "whatsapp" ? <MessageCircle size={16} /> : <Mail size={16} />} {shareMethod === "whatsapp" ? "Open WhatsApp" : "Open email"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-6">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-950">
        <header className="flex items-center justify-between border-b border-gray-200 p-5 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Create invoice
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Customer, line items, tax, payment terms and notes.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
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

              <section>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Customer & payment terms
                </h3>

                <p className="mt-1 text-xs text-gray-500">
                  Choose the customer who will receive this invoice.
                </p>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="sm:col-span-2">
                    <span className="mb-1.5 block text-xs font-medium">
                      Customer
                    </span>

                    <select
                      value={customerId}
                      disabled={loadingCustomers}
                      onChange={(event) =>
                        setCustomerId(event.target.value)
                      }
                      className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
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
                    <span className="mb-1.5 block text-xs font-medium">
                      Due date
                    </span>

                    <input
                      type="date"
                      value={dueDate}
                      onChange={(event) =>
                        setDueDate(event.target.value)
                      }
                      className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
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
                    className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold dark:border-gray-700"
                  >
                    <Plus size={14} className="mr-1 inline" />
                    Add item
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
                  <table className="w-full min-w-[800px]">
                    <thead className="bg-gray-50 text-xs text-gray-500 dark:bg-gray-800/50">
                      <tr>
                        <th className="p-3 text-left">
                          Description
                        </th>
                        <th className="p-3">Qty</th>
                        <th className="p-3">Unit price</th>
                        <th className="p-3">Tax %</th>
                        <th className="p-3 text-right">
                          Total
                        </th>
                        <th />
                      </tr>
                    </thead>

                    <tbody className="divide-y dark:divide-gray-800">
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
                                className="w-full rounded-lg border border-gray-200 px-2.5 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
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
                                className="w-24 rounded-lg border border-gray-200 px-2.5 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
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
                                className="w-32 rounded-lg border border-gray-200 px-2.5 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
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
                                className="w-24 rounded-lg border border-gray-200 px-2.5 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                              />
                            </td>

                            <td className="p-3 text-right text-sm font-semibold">
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
                                className="rounded-lg p-2 text-gray-400 disabled:opacity-30"
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

              <label>
                <span className="mb-1.5 block text-xs font-medium">
                  Notes
                </span>

                <textarea
                  value={notes}
                  onChange={(event) =>
                    setNotes(event.target.value)
                  }
                  rows={4}
                  placeholder="Optional notes or payment instructions..."
                  className="w-full rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
              </label>
            </div>

            <aside className="h-fit rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900">
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
                  <p className="mt-1 text-sm font-semibold">
                    {items.length}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    Due date
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {dueDate ? dateText(dueDate) : "Not set"}
                  </p>
                </div>
              </div>

              <div className="my-5 border-t border-gray-200 dark:border-gray-800" />

              <div className="space-y-2.5 text-sm">
                <SummaryRow
                  label="Subtotal"
                  value={money(subtotal)}
                />
                <SummaryRow
                  label="Tax"
                  value={money(tax)}
                />

                <div className="flex justify-between border-t border-gray-200 pt-3 text-base font-bold dark:border-gray-800">
                  <span>Total</span>
                  <span>{money(total)}</span>
                </div>
              </div>

              <button
                disabled={saving || loadingCustomers}
                onClick={submit}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900"
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
                className="mt-2 w-full rounded-xl px-4 py-2.5 text-sm text-gray-500"
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
