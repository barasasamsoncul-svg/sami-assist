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
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ArrowDownToLine,
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
  const [section, setSection] = useState<"overview" | "customers" | "payments">("overview");

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

  if (section === "customers") {
    return (
      <InvoicingSectionShell section={section} setSection={setSection}>
        <CustomerManager />
      </InvoicingSectionShell>
    );
  }

  if (section === "payments") {
    return (
      <InvoicingSectionShell section={section} setSection={setSection}>
        <PaymentsManager onOpenInvoice={openInvoice} />
      </InvoicingSectionShell>
    );
  }

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

            <p className="mt-2 text-sm text-gray-500">
              Issued {dateText(invoice.issue_date)}
              {invoice.due_date && ` · Due ${dateText(invoice.due_date)}`}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onRefresh}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold dark:border-gray-700"
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

            <button className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-900">
              <ArrowDownToLine size={16} />
              Export
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
          <h2 className="text-sm font-semibold">Customer</h2>
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
          <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-800">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Address
            </p>
            <p className="mt-1 text-sm">{invoice.customer.address}</p>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <h2 className="text-sm font-semibold">Invoice items</h2>
          <p className="mt-1 text-xs text-gray-500">
            Products and services included in this invoice.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800/50">
              <tr>
                <th className="px-5 py-3 text-left">Description</th>
                <th className="px-5 py-3 text-right">Qty</th>
                <th className="px-5 py-3 text-right">Unit price</th>
                <th className="px-5 py-3 text-right">Tax</th>
                <th className="px-5 py-3 text-right">Total</th>
              </tr>
            </thead>

            <tbody className="divide-y dark:divide-gray-800">
              {(invoice.invoice_items || []).map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-4 text-sm">
                    {item.description}
                  </td>
                  <td className="px-5 py-4 text-right text-sm">
                    {item.quantity}
                  </td>
                  <td className="px-5 py-4 text-right text-sm">
                    {money(item.unit_price)}
                  </td>
                  <td className="px-5 py-4 text-right text-sm">
                    {money(item.tax_amount)} ({item.tax_rate}%)
                  </td>
                  <td className="px-5 py-4 text-right text-sm font-semibold">
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

            <div className="flex justify-between border-t border-gray-200 pt-3 text-base font-bold dark:border-gray-800">
              <span>Total</span>
              <span>{money(invoice.total_amount)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <h2 className="text-sm font-semibold">Payment history</h2>
        </div>

        {!invoice.payments?.length ? (
          <p className="p-5 text-sm text-gray-500">
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
                  <p className="font-semibold">
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
          <h2 className="text-sm font-semibold">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">
            {invoice.notes}
          </p>
        </section>
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

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"><div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-gray-950"><div className="flex items-center justify-between border-b p-5 dark:border-gray-800"><div><h2 className="font-bold">Record payment</h2><p className="text-xs text-gray-500">{invoice.invoice_number} · Balance {money(invoice.amount_due)}</p></div><button onClick={onClose}><X size={19}/></button></div><div className="space-y-4 p-5">{error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}<label className="block text-sm"><span className="mb-1.5 block text-xs font-medium">Amount</span><input type="number" min="0.01" max={Number(invoice.amount_due)} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm"><span className="mb-1.5 block text-xs font-medium">Payment method</span><select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900"><option value="other">Other</option><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="mobile_money">Mobile money</option><option value="card">Card</option><option value="cheque">Cheque</option></select></label><label className="block text-sm"><span className="mb-1.5 block text-xs font-medium">Payment date</span><input type="datetime-local" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900" /></label></div><label className="block text-sm"><span className="mb-1.5 block text-xs font-medium">Transaction reference</span><input value={reference} onChange={(e) => setReference(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900" /></label><label className="block text-sm"><span className="mb-1.5 block text-xs font-medium">Notes</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-xl border px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900" /></label></div><div className="flex justify-end gap-2 border-t p-4 dark:border-gray-800"><button onClick={onClose} className="rounded-xl border px-4 py-2.5 text-sm dark:border-gray-700">Cancel</button><button disabled={saving} onClick={submit} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Record payment"}</button></div></div></div>;
}

function InvoicingNav({
  section,
  setSection,
}: {
  section: "overview" | "customers" | "payments";
  setSection: (section: "overview" | "customers" | "payments") => void;
}) {
  const items = [
    ["overview", "Invoices", Receipt],
    ["customers", "Customers", Users],
    ["payments", "Payments", CreditCard],
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

function InvoicingSectionShell({
  section,
  setSection,
  children,
}: {
  section: "overview" | "customers" | "payments";
  setSection: (section: "overview" | "customers" | "payments") => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <InvoicingNav section={section} setSection={setSection} />
      {children}
    </div>
  );
}

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
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customers" className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-gray-400 sm:w-72 dark:border-gray-700 dark:bg-gray-800" />
        </div>
        {loading ? <div className="p-10 text-center text-sm text-gray-500">Loading customers…</div> : filtered.length === 0 ? <div className="p-10 text-center text-sm text-gray-500">No customers found.</div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800/50"><tr><th className="px-5 py-3">Company</th><th className="px-5 py-3">Contact</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Phone</th><th className="px-5 py-3">Address</th><th className="px-5 py-3">Actions</th></tr></thead><tbody className="divide-y dark:divide-gray-800">{filtered.map((customer) => <tr key={customer.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40"><td className="px-5 py-4 font-semibold">{customer.company_name}</td><td className="px-5 py-4">{customer.contact_name || "—"}</td><td className="px-5 py-4">{customer.email || "—"}</td><td className="px-5 py-4">{customer.phone || "—"}</td><td className="max-w-xs truncate px-5 py-4">{customer.address || "—"}</td><td className="px-5 py-4"><button onClick={() => openEdit(customer)} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold dark:border-gray-700"><Pencil size={13}/> Edit</button></td></tr>)}</tbody></table></div>
        )}
      </section>

      {showForm && <CustomerFormModal form={form} setForm={setForm} editing={editing} saving={saving} onClose={() => setShowForm(false)} onSave={save} />}
    </div>
  );
}

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
    <label className="text-sm"><span className="mb-1.5 block text-xs font-medium">{labelText}</span><input type={type} value={form[key]} onChange={(e) => setForm((v) => ({ ...v, [key]: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900" /></label>
  );
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4"><div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-gray-950"><div className="flex items-center justify-between border-b p-5 dark:border-gray-800"><div><h2 className="font-bold">{editing ? "Edit customer" : "Add customer"}</h2><p className="text-xs text-gray-500">Fields match the invoicing customers schema.</p></div><button onClick={onClose}><X size={19}/></button></div><div className="grid gap-4 p-5 sm:grid-cols-2">{field("company_name", "Company name")}{field("contact_name", "Contact name")}{field("email", "Email", "email")}{field("phone", "Phone")}{field("address", "Address")}{field("status", "Status")}</div><div className="flex justify-end gap-2 border-t p-4 dark:border-gray-800"><button onClick={onClose} className="rounded-xl border px-4 py-2.5 text-sm dark:border-gray-700">Cancel</button><button disabled={saving} onClick={onSave} className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">{saving ? "Saving…" : editing ? "Save changes" : "Add customer"}</button></div></div></div>;
}

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
  return <div className="space-y-6"><header><p className="text-sm text-gray-500">Invoicing · Payments</p><h1 className="mt-1 text-2xl font-bold">Payments</h1><p className="mt-1 text-sm text-gray-500">Track money received against invoices.</p></header>{error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}<section className="grid gap-4 sm:grid-cols-2"><StatCard label="Payments recorded" value={String(payments.length)} icon={CreditCard}/><StatCard label="Total received" value={money(total)} icon={Wallet}/></section><section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"><div className="border-b p-4 dark:border-gray-800"><h2 className="font-semibold">Payment register</h2></div>{loading ? <div className="p-10 text-center text-sm text-gray-500">Loading payments…</div> : payments.length === 0 ? <div className="p-10 text-center text-sm text-gray-500">No payments recorded yet.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800/50"><tr><th className="px-5 py-3">Invoice</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Method</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y dark:divide-gray-800">{payments.map((p) => <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40"><td className="px-5 py-4"><button onClick={() => onOpenInvoice(p.invoice_id)} className="font-semibold text-blue-600 hover:underline">{p.invoice_number}</button></td><td className="px-5 py-4">{p.company_name || "—"}</td><td className="px-5 py-4 font-semibold">{money(p.amount)}</td><td className="px-5 py-4 capitalize">{p.payment_method}</td><td className="px-5 py-4">{p.transaction_reference || "—"}</td><td className="px-5 py-4">{dateText(p.payment_date)}</td><td className="px-5 py-4 capitalize">{p.status}</td></tr>)}</tbody></table></div>}</section></div>;
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
