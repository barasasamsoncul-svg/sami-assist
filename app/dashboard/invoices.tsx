"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Loader2,
  Plus,
  Receipt,
  Search,
  Wallet,
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
  customer: Customer;
};

type InvoiceStats = {
  total_invoices: number;
  draft_invoices: number;
  sent_invoices: number;
  partial_invoices: number;
  paid_invoices: number;
  overdue_invoices: number;
  cancelled_invoices: number;
  total_invoiced: number;
  total_collected: number;
  total_outstanding: number;
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

const STATUS_LABELS: Record<
  InvoiceStatus,
  string
> = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partial",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

function money(value: number | string) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function date(value?: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function statusClasses(status: InvoiceStatus) {
  switch (status) {
    case "paid":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";

    case "partial":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400";

    case "overdue":
      return "bg-red-500/10 text-red-600 dark:text-red-400";

    case "cancelled":
      return "bg-gray-500/10 text-gray-500";

    case "sent":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400";

    default:
      return "bg-purple-500/10 text-purple-600 dark:text-purple-400";
  }
}

function isActuallyOverdue(invoice: Invoice) {
  // Draft invoices are never overdue.
  if (invoice.status === "draft") {
    return false;
  }

  // Paid and cancelled invoices are never overdue.
  if (
    invoice.status === "paid" ||
    invoice.status === "cancelled"
  ) {
    return false;
  }

  // No due date means there is nothing to mark overdue.
  if (!invoice.due_date) {
    return false;
  }

  // An invoice with no outstanding balance cannot be overdue.
  if (Number(invoice.amount_due) <= 0) {
    return false;
  }

  // Compare calendar dates, not timestamps.
  // This prevents an invoice due today from being
  // incorrectly marked overdue at midnight.
  const today = new Date();

  const todayDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  const dueDate = new Date(
    `${invoice.due_date}T00:00:00`
  );

  return dueDate < todayDate;
}

export default function Invoices() {
  const [invoices, setInvoices] =
    useState<Invoice[]>([]);

  const [stats, setStats] =
    useState<InvoiceStats | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState<"all" | InvoiceStatus>("all");

  const [selectedInvoiceId, setSelectedInvoiceId] =
    useState<string | null>(null);

  const [selectedInvoice, setSelectedInvoice] =
    useState<InvoiceDetails | null>(null);

  const [detailsLoading, setDetailsLoading] =
    useState(false);

  const [showCreate, setShowCreate] =
    useState(false);

  const loadInvoices = useCallback(
    async () => {
      try {
        setLoading(true);
        setError("");

        const [
          invoicesResponse,
          statsResponse,
        ] = await Promise.all([
          fetch("/api/invoices", {
            credentials: "include",
          }),
          fetch("/api/invoices/stats", {
            credentials: "include",
          }),
        ]);

        const invoicesData =
          await invoicesResponse.json();

        const statsData =
          await statsResponse.json();

        if (!invoicesResponse.ok) {
          throw new Error(
            invoicesData.error ||
              "Failed to load invoices"
          );
        }

        if (!statsResponse.ok) {
          throw new Error(
            statsData.error ||
              "Failed to load invoice statistics"
          );
        }

        setInvoices(
          invoicesData.invoices || []
        );

        setStats(
          statsData.stats || null
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load invoices"
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const openInvoice = async (
    invoiceId: string
  ) => {
    try {
      setSelectedInvoiceId(invoiceId);
      setSelectedInvoice(null);
      setDetailsLoading(true);

      const response = await fetch(
        `/api/invoices/${invoiceId}`,
        {
          credentials: "include",
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to load invoice"
        );
      }

      setSelectedInvoice(
        data.invoice
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load invoice"
      );
    } finally {
      setDetailsLoading(false);
    }
  };

  const filteredInvoices = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    return invoices.filter(
      (invoice) => {
        const actualStatus =
          isActuallyOverdue(invoice)
            ? "overdue"
            : invoice.status;

        const matchesStatus =
          statusFilter === "all" ||
          actualStatus === statusFilter;

        const matchesSearch =
          !query ||
          invoice.invoice_number
            .toLowerCase()
            .includes(query) ||
          invoice.customer.company_name
            .toLowerCase()
            .includes(query) ||
          (
            invoice.customer
              .contact_name || ""
          )
            .toLowerCase()
            .includes(query);

        return (
          matchesStatus &&
          matchesSearch
        );
      }
    );
  }, [
    invoices,
    search,
    statusFilter,
  ]);

  const statCards = [
    {
      label: "Total Invoices",
      value:
        stats?.total_invoices ?? 0,
      icon: FileText,
    },
    {
      label: "Total Invoiced",
      value: money(
        stats?.total_invoiced ?? 0
      ),
      icon: Receipt,
    },
    {
      label: "Collected",
      value: money(
        stats?.total_collected ?? 0
      ),
      icon: Wallet,
    },
    {
      label: "Outstanding",
      value: money(
        stats?.total_outstanding ?? 0
      ),
      icon: CircleDollarSign,
    },
  ];

  if (selectedInvoiceId) {
    return (
      <InvoiceDetailsView
        invoice={selectedInvoice}
        loading={detailsLoading}
        onBack={() => {
          setSelectedInvoiceId(null);
          setSelectedInvoice(null);
        }}
        onRefresh={() => {
          openInvoice(
            selectedInvoiceId
          );
          loadInvoices();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Invoices
          </h2>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Create, track and manage your business invoices.
          </p>
        </div>

        <button
          onClick={() =>
            setShowCreate(true)
          }
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
        >
          <Plus size={17} />
          New Invoice
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(
          ({
            label,
            value,
            icon: Icon,
          }) => (
            <div
              key={label}
              className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
                  <Icon
                    size={19}
                    className="text-gray-700 dark:text-gray-300"
                  />
                </div>
              </div>

              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                {label}
              </p>

              <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
                {value}
              </p>
            </div>
          )
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
          <AlertCircle
            size={18}
            className="mt-0.5 shrink-0"
          />
          <span>{error}</span>
        </div>
      )}

      {/* Quick status cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatusShortcut
          label="Draft"
          value={
            stats?.draft_invoices ?? 0
          }
          active={
            statusFilter === "draft"
          }
          onClick={() =>
            setStatusFilter(
              statusFilter === "draft"
                ? "all"
                : "draft"
            )
          }
        />

        <StatusShortcut
          label="Sent"
          value={
            stats?.sent_invoices ?? 0
          }
          active={
            statusFilter === "sent"
          }
          onClick={() =>
            setStatusFilter(
              statusFilter === "sent"
                ? "all"
                : "sent"
            )
          }
        />

        <StatusShortcut
          label="Partial"
          value={
            stats?.partial_invoices ?? 0
          }
          active={
            statusFilter === "partial"
          }
          onClick={() =>
            setStatusFilter(
              statusFilter === "partial"
                ? "all"
                : "partial"
            )
          }
        />

        <StatusShortcut
          label="Overdue"
          value={
            stats?.overdue_invoices ?? 0
          }
          active={
            statusFilter === "overdue"
          }
          onClick={() =>
            setStatusFilter(
              statusFilter === "overdue"
                ? "all"
                : "overdue"
            )
          }
        />
      </div>

      {/* Invoice table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {/* Search */}
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
          <div className="relative w-full sm:max-w-sm">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />

            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search invoices or customers..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:border-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as
                  | "all"
                  | InvoiceStatus
              )
            }
            className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="all">
              All statuses
            </option>
            <option value="draft">
              Draft
            </option>
            <option value="sent">
              Sent
            </option>
            <option value="partial">
              Partial
            </option>
            <option value="paid">
              Paid
            </option>
            <option value="overdue">
              Overdue
            </option>
            <option value="cancelled">
              Cancelled
            </option>
          </select>
        </div>

        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center">
            <Loader2
              size={24}
              className="animate-spin text-gray-400"
            />
          </div>
        ) : filteredInvoices.length ===
          0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
              <FileText
                size={22}
                className="text-gray-400"
              />
            </div>

            <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-white">
              No invoices found
            </h3>

            <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
              {search ||
              statusFilter !== "all"
                ? "Try changing your search or filter."
                : "Create your first invoice to start tracking sales and payments."}
            </p>

            {!search &&
              statusFilter ===
                "all" && (
                <button
                  onClick={() =>
                    setShowCreate(true)
                  }
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-gray-900"
                >
                  <Plus size={16} />
                  Create invoice
                </button>
              )}
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
                  <tr>
                    <th className="px-5 py-3 font-medium">
                      Invoice
                    </th>
                    <th className="px-5 py-3 font-medium">
                      Customer
                    </th>
                    <th className="px-5 py-3 font-medium">
                      Due
                    </th>
                    <th className="px-5 py-3 font-medium">
                      Total
                    </th>
                    <th className="px-5 py-3 font-medium">
                      Balance
                    </th>
                    <th className="px-5 py-3 font-medium">
                      Status
                    </th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredInvoices.map(
                    (invoice) => {
                      const overdue =
                        isActuallyOverdue(
                          invoice
                        );

                      const displayStatus =
                        overdue
                          ? "overdue"
                          : invoice.status;

                      return (
                        <tr
                          key={invoice.id}
                          onClick={() =>
                            openInvoice(
                              invoice.id
                            )
                          }
                          className="cursor-pointer transition hover:bg-gray-50 dark:hover:bg-gray-800/40"
                        >
                          <td className="px-5 py-4">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {
                                invoice.invoice_number
                              }
                            </p>

                            <p className="mt-0.5 text-xs text-gray-500">
                              {date(
                                invoice.issue_date
                              )}
                            </p>
                          </td>

                          <td className="px-5 py-4">
                            <p className="text-sm text-gray-900 dark:text-white">
                              {
                                invoice
                                  .customer
                                  .company_name
                              }
                            </p>

                            {invoice
                              .customer
                              .contact_name && (
                              <p className="mt-0.5 text-xs text-gray-500">
                                {
                                  invoice
                                    .customer
                                    .contact_name
                                }
                              </p>
                            )}
                          </td>

                          <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                            {date(
                              invoice.due_date
                            )}
                          </td>

                          <td className="px-5 py-4 text-sm font-medium text-gray-900 dark:text-white">
                            {money(
                              invoice.total_amount
                            )}
                          </td>

                          <td className="px-5 py-4 text-sm font-medium text-gray-900 dark:text-white">
                            {money(
                              invoice.amount_due
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses(
                                displayStatus
                              )}`}
                            >
                              {
                                STATUS_LABELS[
                                  displayStatus
                                ]
                              }
                            </span>
                          </td>

                          <td className="px-5 py-4">
                            <ChevronRight
                              size={17}
                              className="text-gray-400"
                            />
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="divide-y divide-gray-100 md:hidden dark:divide-gray-800">
              {filteredInvoices.map(
                (invoice) => {
                  const overdue =
                    isActuallyOverdue(
                      invoice
                    );

                  const displayStatus =
                    overdue
                      ? "overdue"
                      : invoice.status;

                  return (
                    <button
                      key={invoice.id}
                      onClick={() =>
                        openInvoice(
                          invoice.id
                        )
                      }
                      className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-gray-50 dark:hover:bg-gray-800/40"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
                        <Receipt
                          size={18}
                          className="text-gray-500"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                              {
                                invoice.invoice_number
                              }
                            </p>

                            <p className="mt-0.5 truncate text-xs text-gray-500">
                              {
                                invoice
                                  .customer
                                  .company_name
                              }
                            </p>
                          </div>

                          <ChevronRight
                            size={17}
                            className="mt-1 shrink-0 text-gray-400"
                          />
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {money(
                              invoice.total_amount
                            )}
                          </span>

                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses(
                              displayStatus
                            )}`}
                          >
                            {
                              STATUS_LABELS[
                                displayStatus
                              ]
                            }
                          </span>
                        </div>

                        <p className="mt-1 text-xs text-gray-500">
                          Balance:{" "}
                          {money(
                            invoice.amount_due
                          )}
                        </p>
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          </>
        )}
      </div>

      {/* Create placeholder */}
      {showCreate && (
        <CreateInvoiceModal
          onClose={() =>
            setShowCreate(false)
          }
          onCreated={() => {
            setShowCreate(false);
            loadInvoices();
          }}
        />
      )}
    </div>
  );
}

// ==========================================
// STATUS SHORTCUT
// ==========================================

function StatusShortcut({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition ${
        active
          ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
          : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
      }`}
    >
      <p
        className={`text-xs ${
          active
            ? "text-gray-300 dark:text-gray-600"
            : "text-gray-500 dark:text-gray-400"
        }`}
      >
        {label}
      </p>

      <p className="mt-1 text-lg font-semibold">
        {value}
      </p>
    </button>
  );
}

// ==========================================
// INVOICE DETAILS
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
  if (loading || !invoice) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2
          size={26}
          className="animate-spin text-gray-400"
        />
      </div>
    );
  }

  const displayStatus =
    isActuallyOverdue(invoice)
      ? "overdue"
      : invoice.status;

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="text-sm text-gray-500 transition hover:text-gray-900 dark:hover:text-white"
      >
        ← Back to invoices
      </button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {invoice.invoice_number}
            </h2>

            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses(
                displayStatus
              )}`}
            >
              {STATUS_LABELS[
                displayStatus
              ]}
            </span>
          </div>

          <p className="mt-1 text-sm text-gray-500">
            Issued {date(invoice.issue_date)}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200"
          >
            Refresh
          </button>

          <button
            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-gray-900"
          >
            <ArrowDownToLine
              size={16}
            />
            Export
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Invoice total"
          value={money(
            invoice.total_amount
          )}
        />

        <SummaryCard
          label="Amount paid"
          value={money(
            invoice.amount_paid
          )}
        />

        <SummaryCard
          label="Amount due"
          value={money(
            invoice.amount_due
          )}
        />
      </div>

      {/* Customer */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Customer
        </h3>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Detail
            label="Company"
            value={
              invoice.customer
                .company_name
            }
          />

          <Detail
            label="Contact"
            value={
              invoice.customer
                .contact_name || "—"
            }
          />

          <Detail
            label="Email"
            value={
              invoice.customer.email ||
              "—"
            }
          />

          <Detail
            label="Phone"
            value={
              invoice.customer.phone ||
              "—"
            }
          />
        </div>
      </section>

      {/* Items */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Invoice items
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800/50">
              <tr>
                <th className="px-5 py-3">
                  Description
                </th>
                <th className="px-5 py-3">
                  Qty
                </th>
                <th className="px-5 py-3">
                  Unit price
                </th>
                <th className="px-5 py-3">
                  Tax
                </th>
                <th className="px-5 py-3">
                  Total
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {invoice.invoice_items.map(
                (item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-4 text-sm text-gray-900 dark:text-white">
                      {item.description}
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {item.quantity}
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {money(
                        item.unit_price
                      )}
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {item.tax_rate}%
                    </td>

                    <td className="px-5 py-4 text-sm font-medium text-gray-900 dark:text-white">
                      {money(
                        item.line_total
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Payments */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Payment history
          </h3>
        </div>

        {invoice.payments.length ===
        0 ? (
          <div className="p-5 text-sm text-gray-500">
            No payments recorded.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {invoice.payments.map(
              (payment) => (
                <div
                  key={payment.id}
                  className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {money(
                        payment.amount
                      )}
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                      {
                        payment.payment_method
                      }{" "}
                      ·{" "}
                      {date(
                        payment.payment_date
                      )}
                    </p>
                  </div>

                  <div className="text-xs text-gray-500">
                    {payment
                      .transaction_reference ||
                      "No reference"}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </section>

      {invoice.notes && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Notes
          </h3>

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
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {label}
      </p>

      <p className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

// ==========================================
// DETAIL
// ==========================================

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500">
        {label}
      </p>

      <p className="mt-1 text-sm text-gray-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

// ==========================================
// CREATE INVOICE
// ==========================================

function CreateInvoiceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  type Product = {
    id: string;
    name: string;
    description?: string | null;
    sku?: string | null;
    product_type: string;
    unit_price: number | string;
    tax_rate: number | string;
    is_active: boolean;
  };

  type InvoiceItemForm = {
    product_id: string;
    description: string;
    quantity: string;
    unit_price: string;
    tax_rate: string;
  };

  const [customers, setCustomers] =
    useState<Customer[]>([]);

  const [products, setProducts] =
    useState<Product[]>([]);

  const [customerId, setCustomerId] =
    useState("");

  const [dueDate, setDueDate] =
    useState("");

  const [notes, setNotes] =
    useState("");

  const [items, setItems] = useState<
    InvoiceItemForm[]
  >([
    {
      product_id: "",
      description: "",
      quantity: "1",
      unit_price: "0",
      tax_rate: "0",
    },
  ]);

  const [loadingCustomers, setLoadingCustomers] =
    useState(true);

  const [loadingProducts, setLoadingProducts] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  // ==========================================
  // LOAD CUSTOMERS + PRODUCTS
  // ==========================================

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoadingCustomers(true);
        setLoadingProducts(true);
        setError("");

        const [
          customersResponse,
          productsResponse,
        ] = await Promise.all([
          fetch("/api/customers", {
            credentials: "include",
          }),

          fetch("/api/products", {
            credentials: "include",
          }),
        ]);

        const customersData =
          await customersResponse.json();

        const productsData =
          await productsResponse.json();

        if (!customersResponse.ok) {
          throw new Error(
            customersData.error ||
              "Failed to load customers"
          );
        }

        if (!productsResponse.ok) {
          throw new Error(
            productsData.error ||
              "Failed to load products"
          );
        }

        if (!cancelled) {
          setCustomers(
            Array.isArray(
              customersData.customers
            )
              ? customersData.customers
              : []
          );

          setProducts(
            Array.isArray(
              productsData.products
            )
              ? productsData.products
              : []
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load invoice data"
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingCustomers(false);
          setLoadingProducts(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  // ==========================================
  // ADD ITEM
  // ==========================================

  const addItem = () => {
    setItems((current) => [
      ...current,
      {
        product_id: "",
        description: "",
        quantity: "1",
        unit_price: "0",
        tax_rate: "0",
      },
    ]);
  };

  // ==========================================
  // REMOVE ITEM
  // ==========================================

  const removeItem = (index: number) => {
    setItems((current) =>
      current.filter(
        (_, itemIndex) =>
          itemIndex !== index
      )
    );
  };

  // ==========================================
  // UPDATE ITEM
  // ==========================================

  const updateItem = (
    index: number,
    field:
      | "product_id"
      | "description"
      | "quantity"
      | "unit_price"
      | "tax_rate",
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

  // ==========================================
  // SELECT PRODUCT / SERVICE
  // ==========================================

  const selectProduct = (
    index: number,
    productId: string
  ) => {
    if (!productId) {
      updateItem(
        index,
        "product_id",
        ""
      );
      return;
    }

    const product =
      products.find(
        (item) =>
          item.id === productId
      );

    if (!product) {
      return;
    }

    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              product_id: product.id,
              description:
                product.description?.trim() ||
                product.name,
              unit_price:
                String(product.unit_price),
              tax_rate:
                String(product.tax_rate),
            }
          : item
      )
    );
  };

  // ==========================================
  // LINE CALCULATIONS
  // ==========================================

  const getLineSubtotal = (
    item: InvoiceItemForm
  ) => {
    const quantity =
      Number(item.quantity) || 0;

    const unitPrice =
      Number(item.unit_price) || 0;

    return quantity * unitPrice;
  };

  const getLineTax = (
    item: InvoiceItemForm
  ) => {
    const lineSubtotal =
      getLineSubtotal(item);

    const taxRate =
      Number(item.tax_rate) || 0;

    return (
      lineSubtotal *
      (taxRate / 100)
    );
  };

  const getLineTotal = (
    item: InvoiceItemForm
  ) => {
    return (
      getLineSubtotal(item) +
      getLineTax(item)
    );
  };

  const subtotal = items.reduce(
    (sum, item) =>
      sum + getLineSubtotal(item),
    0
  );

  const tax = items.reduce(
    (sum, item) =>
      sum + getLineTax(item),
    0
  );

  const total = subtotal + tax;

  // ==========================================
  // SUBMIT INVOICE
  // ==========================================

  const submit = async () => {
    try {
      setSaving(true);
      setError("");

      // ----------------------------------------
      // CUSTOMER
      // ----------------------------------------

      if (!customerId) {
        throw new Error(
          "Select a customer."
        );
      }

      // ----------------------------------------
      // ITEMS
      // ----------------------------------------

      if (items.length === 0) {
        throw new Error(
          "Add at least one invoice item."
        );
      }

      const invalidItem =
        items.find((item) => {
          const quantity =
            Number(item.quantity);

          const unitPrice =
            Number(item.unit_price);

          const taxRate =
            Number(item.tax_rate);

          return (
            !item.description.trim() ||
            !Number.isFinite(quantity) ||
            quantity <= 0 ||
            !Number.isFinite(unitPrice) ||
            unitPrice < 0 ||
            !Number.isFinite(taxRate) ||
            taxRate < 0 ||
            taxRate > 100
          );
        });

      if (invalidItem) {
        throw new Error(
          "Check every invoice item. Description, quantity, price and tax must be valid."
        );
      }

      // ----------------------------------------
      // CREATE
      // ----------------------------------------

      const response = await fetch(
        "/api/invoices",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            customer_id: customerId,

            due_date:
              dueDate || null,

            notes:
              notes.trim() || null,

            items: items.map(
              (item) => ({
                description:
                  item.description.trim(),

                quantity:
                  Number(item.quantity),

                unit_price:
                  Number(item.unit_price),

                tax_rate:
                  Number(item.tax_rate),
              })
            ),
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to create invoice"
        );
      }

      onCreated();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create invoice"
      );
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // UI
  // ==========================================

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-gray-900">

        {/* HEADER */}

        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Create invoice
            </h2>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Create an invoice for your customer.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            ✕
          </button>
        </div>

        {/* BODY */}

        <div className="overflow-y-auto p-5">
          <div className="space-y-6">

            {/* ERROR */}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
                {error}
              </div>
            )}

            {/* CUSTOMER */}

            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                Customer
              </label>

              <select
                value={customerId}
                onChange={(e) =>
                  setCustomerId(
                    e.target.value
                  )
                }
                disabled={
                  loadingCustomers
                }
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="">
                  {loadingCustomers
                    ? "Loading customers..."
                    : "Select customer"}
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
            </div>

            {/* DUE DATE */}

            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                Due date
              </label>

              <input
                type="date"
                value={dueDate}
                onChange={(e) =>
                  setDueDate(
                    e.target.value
                  )
                }
                className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>

            {/* ITEMS */}

            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Invoice items
                  </h3>

                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Select a product/service or enter a custom item.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={addItem}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <Plus size={14} />
                  Add item
                </button>
              </div>

              <div className="mt-4 space-y-4">
                {items.map(
                  (item, index) => (
                    <div
                      key={index}
                      className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
                    >
                      <div className="space-y-4">

                        {/* PRODUCT */}

                        <div>
                          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                            Product / Service
                          </label>

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
                            disabled={
                              loadingProducts
                            }
                            className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                          >
                            <option value="">
                              {loadingProducts
                                ? "Loading products..."
                                : products.length ===
                                    0
                                  ? "No products yet — enter a custom item below"
                                  : "Select product/service"}
                            </option>

                            {products.map(
                              (product) => (
                                <option
                                  key={
                                    product.id
                                  }
                                  value={
                                    product.id
                                  }
                                >
                                  {product.name}
                                  {product.sku
                                    ? ` (${product.sku})`
                                    : ""}
                                </option>
                              )
                            )}
                          </select>
                        </div>

                        {/* DESCRIPTION */}

                        <div>
                          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                            Description
                          </label>

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
                            className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                          />
                        </div>

                        {/* QUANTITY / PRICE / TAX */}

                        <div className="grid gap-3 sm:grid-cols-3">

                          <div>
                            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                              Quantity
                            </label>

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
                              className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                            />
                          </div>

                          <div>
                            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                              Unit price
                            </label>

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
                              className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                            />
                          </div>

                          <div>
                            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                              Tax rate %
                            </label>

                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
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
                              className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                            />
                          </div>
                        </div>

                        {/* LINE SUMMARY */}

                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-800/60">
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Line subtotal:{" "}
                            <span className="font-medium text-gray-700 dark:text-gray-200">
                              {money(
                                getLineSubtotal(
                                  item
                                )
                              )}
                            </span>

                            <span className="mx-2">
                              +
                            </span>

                            Tax:{" "}
                            <span className="font-medium text-gray-700 dark:text-gray-200">
                              {money(
                                getLineTax(
                                  item
                                )
                              )}
                            </span>
                          </div>

                          <div className="text-sm font-semibold text-gray-900 dark:text-white">
                            Line total:{" "}
                            {money(
                              getLineTotal(
                                item
                              )
                            )}
                          </div>
                        </div>

                        {/* REMOVE */}

                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              removeItem(
                                index
                              )
                            }
                            className="text-xs font-medium text-red-500 hover:text-red-600"
                          >
                            Remove item
                          </button>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* NOTES */}

            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                Notes
              </label>

              <textarea
                value={notes}
                onChange={(e) =>
                  setNotes(
                    e.target.value
                  )
                }
                rows={3}
                placeholder="Optional notes."
                className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>

            {/* TOTALS */}

            <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/60">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
                <span>
                  Subtotal
                </span>

                <span>
                  {money(subtotal)}
                </span>
              </div>

              <div className="mt-2 flex justify-between text-sm text-gray-600 dark:text-gray-300">
                <span>
                  Tax
                </span>

                <span>
                  {money(tax)}
                </span>
              </div>

              <div className="mt-3 flex justify-between border-t border-gray-200 pt-3 text-base font-semibold text-gray-900 dark:border-gray-700 dark:text-white">
                <span>
                  Total
                </span>

                <span>
                  {money(total)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 px-5 py-4 sm:flex-row sm:justify-end dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={submit}
            disabled={
              saving ||
              loadingCustomers
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-gray-900"
          >
            {saving && (
              <Loader2
                size={16}
                className="animate-spin"
              />
            )}

            {saving
              ? "Creating..."
              : "Create invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}