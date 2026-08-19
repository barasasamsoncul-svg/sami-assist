"use client";

import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Eye,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  TrendingUp,
  Users,
  X,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";

/* ============================================================
   TYPES
   ============================================================ */

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

type Invoice = {
  id: string;
  invoice_number: string;

  customer_id: string;

  customer?: {
    id?: string;
    company_name?: string | null;
    contact_name?: string | null;
    email?: string | null;
  } | null;

  customer_name?: string | null;
  company_name?: string | null;

  issue_date: string;
  due_date: string | null;
  payment_date?: string | null;

  sent_at?: string | null;
  viewed_at?: string | null;

  status: InvoiceStatus | string;

  subtotal: number | string;
  discount_amount: number | string;
  tax_amount: number | string;
  shipping_cost: number | string;
  shipping_tax?: number | string;

  total_amount: number | string;
  amount_paid: number | string;
  amount_due: number | string;

  po_number?: string | null;

  currency: string;

  exchange_rate?: number | string;

  payment_terms_id?: string | null;
  payment_terms_display?: string | null;

  notes?: string | null;
  internal_notes?: string | null;

  created_at: string;
  updated_at: string;
};

type Customer = {
  id: string;
  company_name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string;
};

type ApiResponse = {
  success?: boolean;
  data?: Invoice[];
  invoices?: Invoice[];
  customers?: Customer[];
  total?: number;
  count?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  error?: string;
  message?: string;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "pending_approval", label: "Pending approval" },
  { value: "sent", label: "Sent" },
  { value: "viewed", label: "Viewed" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
  { value: "void", label: "Void" },
];

/* ============================================================
   HELPERS
   ============================================================ */

function toNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);

  return Number.isFinite(number) ? number : 0;
}

function formatCurrency(
  amount: number | string | null | undefined,
  currency = "USD"
) {
  const value = toNumber(amount);

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency || "USD"} ${value.toFixed(2)}`;
  }
}

function formatDate(date: string | null | undefined) {
  if (!date) {
    return "—";
  }

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function getCustomerName(invoice: Invoice) {
  return (
    invoice.customer?.company_name ||
    invoice.company_name ||
    invoice.customer_name ||
    invoice.customer?.contact_name ||
    "Unknown customer"
  );
}

function getInitials(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "C";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function normalizeStatus(status: string | null | undefined) {
  return (status || "draft").toLowerCase();
}

function getStatusLabel(status: string | null | undefined) {
  const normalized = normalizeStatus(status);

  const option = STATUS_OPTIONS.find(
    (item) => item.value === normalized
  );

  if (option) {
    return option.label;
  }

  return normalized
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStatusClasses(status: string | null | undefined) {
  switch (normalizeStatus(status)) {
    case "paid":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";

    case "partially_paid":
      return "border-blue-500/20 bg-blue-500/10 text-blue-400";

    case "sent":
      return "border-indigo-500/20 bg-indigo-500/10 text-indigo-400";

    case "viewed":
      return "border-violet-500/20 bg-violet-500/10 text-violet-400";

    case "overdue":
      return "border-red-500/20 bg-red-500/10 text-red-400";

    case "cancelled":
    case "void":
      return "border-slate-500/20 bg-slate-500/10 text-slate-400";

    case "pending_approval":
      return "border-amber-500/20 bg-amber-500/10 text-amber-400";

    default:
      return "border-slate-500/20 bg-slate-500/10 text-slate-400";
  }
}

/* ============================================================
   SUMMARY CARD
   ============================================================ */

function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconClass,
  loading,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: typeof FileText;
  iconClass: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0b1728] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">
            {title}
          </p>

          {loading ? (
            <div className="mt-3 h-8 w-28 animate-pulse rounded-lg bg-white/[0.06]" />
          ) : (
            <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-white">
              {value}
            </p>
          )}

          <p className="mt-2 text-xs text-slate-500">
            {subtitle}
          </p>
        </div>

        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${iconClass}`}
        >
          <Icon size={19} />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PAGE
   ============================================================ */

export default function InvoicesPage() {
  const router = useRouter();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [loading, setLoading] = useState(true);
  const [customersLoading, setCustomersLoading] =
    useState(true);

  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [customerId, setCustomerId] = useState("all");

  const [sortField, setSortField] = useState<
    "issue_date" | "due_date" | "total_amount" | "amount_due"
  >("issue_date");

  const [sortDirection, setSortDirection] = useState<
    "asc" | "desc"
  >("desc");

  const [page, setPage] = useState(1);

  const [openMenu, setOpenMenu] = useState<string | null>(
    null
  );

  const [showFilters, setShowFilters] = useState(false);

  /* ==========================================================
     FETCH INVOICES
     ========================================================== */

  const fetchInvoices = useCallback(
    async (showRefresh = false) => {
      try {
        if (showRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const params = new URLSearchParams();

        params.set("page", String(page));
        params.set("limit", String(PAGE_SIZE));

        if (search.trim()) {
          params.set("search", search.trim());
        }

        if (status !== "all") {
          params.set("status", status);
        }

        if (customerId !== "all") {
          params.set("customer_id", customerId);
        }

        const response = await fetch(
          `/api/invoices?${params.toString()}`,
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          }
        );

        const result: ApiResponse =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ||
              result.message ||
              "Failed to load invoices."
          );
        }

        const invoiceData =
          result.invoices ||
          result.data ||
          [];

        setInvoices(
          Array.isArray(invoiceData)
            ? invoiceData
            : []
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load invoices."
        );

        setInvoices([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, search, status, customerId]
  );

  /* ==========================================================
     FETCH CUSTOMERS
     ========================================================== */

  const fetchCustomers = useCallback(async () => {
    try {
      setCustomersLoading(true);

      const response = await fetch(
        "/api/customers?limit=1000",
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }
      );

      if (!response.ok) {
        return;
      }

      const result: ApiResponse =
        await response.json();

      const customerData =
        result.customers ||
        result.data ||
        [];

      setCustomers(
        Array.isArray(customerData)
          ? (customerData as Customer[])
          : []
      );
    } catch {
      setCustomers([]);
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  /* ==========================================================
     SORTING
     ========================================================== */

  const sortedInvoices = useMemo(() => {
    const result = [...invoices];

    result.sort((a, b) => {
      let aValue: string | number = "";
      let bValue: string | number = "";

      if (
        sortField === "total_amount" ||
        sortField === "amount_due"
      ) {
        aValue = toNumber(a[sortField]);
        bValue = toNumber(b[sortField]);
      } else {
        aValue = String(a[sortField] || "");
        bValue = String(b[sortField] || "");
      }

      if (aValue < bValue) {
        return sortDirection === "asc" ? -1 : 1;
      }

      if (aValue > bValue) {
        return sortDirection === "asc" ? 1 : -1;
      }

      return 0;
    });

    return result;
  }, [invoices, sortField, sortDirection]);

  /* ==========================================================
     SUMMARY
     ========================================================== */

  const summary = useMemo(() => {
    let totalInvoiced = 0;
    let outstanding = 0;
    let paid = 0;
    let overdue = 0;

    for (const invoice of invoices) {
      totalInvoiced += toNumber(invoice.total_amount);
      outstanding += toNumber(invoice.amount_due);
      paid += toNumber(invoice.amount_paid);

      if (
        normalizeStatus(invoice.status) === "overdue"
      ) {
        overdue += toNumber(invoice.amount_due);
      }
    }

    return {
      totalInvoiced,
      outstanding,
      paid,
      overdue,
    };
  }, [invoices]);

  /* ==========================================================
     HANDLERS
     ========================================================== */

  function handleSort(
    field:
      | "issue_date"
      | "due_date"
      | "total_amount"
      | "amount_due"
  ) {
    if (sortField === field) {
      setSortDirection((current) =>
        current === "asc" ? "desc" : "asc"
      );
      return;
    }

    setSortField(field);
    setSortDirection("desc");
  }

  function handleSearchChange(
    value: string
  ) {
    setSearch(value);
    setPage(1);
  }

  function handleStatusChange(
    value: string
  ) {
    setStatus(value);
    setPage(1);
  }

  function handleCustomerChange(
    value: string
  ) {
    setCustomerId(value);
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setStatus("all");
    setCustomerId("all");
    setPage(1);
  }

  function viewInvoice(id: string) {
    router.push(`/invoices/${id}`);
  }

  function editInvoice(id: string) {
    router.push(`/invoices/${id}/edit`);
  }

  function createInvoice() {
    router.push("/invoices/new");
  }

  function recordPayment(id: string) {
    router.push(
      `/invoices/${id}?action=payment`
    );
  }

  function sendInvoice(id: string) {
    router.push(
      `/invoices/${id}?action=send`
    );
  }

  const hasFilters =
    search.trim() !== "" ||
    status !== "all" ||
    customerId !== "all";

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <div className="min-h-full bg-[#07111f] text-white">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        {/* ======================================================
            HEADER
        ====================================================== */}

        <div className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10">
                <FileText
                  size={21}
                  className="text-blue-400"
                />
              </div>

              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">
                  Invoices
                </h1>

                <p className="mt-1 text-sm text-slate-500">
                  Manage invoices, billing and customer payments.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                fetchInvoices(true)
              }
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />

              <span className="hidden sm:inline">
                Refresh
              </span>
            </button>

            <button
              type="button"
              onClick={createInvoice}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 transition hover:bg-blue-500"
            >
              <Plus size={17} />
              New Invoice
            </button>
          </div>
        </div>

        {/* ======================================================
            SUMMARY CARDS
        ====================================================== */}

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Total invoiced"
            value={formatCurrency(
              summary.totalInvoiced,
              invoices[0]?.currency || "USD"
            )}
            subtitle="Invoices on this page"
            icon={TrendingUp}
            iconClass="bg-blue-500/10 text-blue-400"
            loading={loading}
          />

          <SummaryCard
            title="Outstanding"
            value={formatCurrency(
              summary.outstanding,
              invoices[0]?.currency || "USD"
            )}
            subtitle="Amount still due"
            icon={CircleDollarSign}
            iconClass="bg-amber-500/10 text-amber-400"
            loading={loading}
          />

          <SummaryCard
            title="Paid"
            value={formatCurrency(
              summary.paid,
              invoices[0]?.currency || "USD"
            )}
            subtitle="Payments received"
            icon={Users}
            iconClass="bg-emerald-500/10 text-emerald-400"
            loading={loading}
          />

          <SummaryCard
            title="Overdue"
            value={formatCurrency(
              summary.overdue,
              invoices[0]?.currency || "USD"
            )}
            subtitle="Past due balance"
            icon={Clock3}
            iconClass="bg-red-500/10 text-red-400"
            loading={loading}
          />
        </div>

        {/* ======================================================
            TOOLBAR
        ====================================================== */}

        <div className="mb-4 rounded-2xl border border-white/[0.08] bg-[#0b1728] p-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            {/* SEARCH */}

            <div className="relative min-w-0 flex-1">
              <Search
                size={17}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600"
              />

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  handleSearchChange(
                    event.target.value
                  )
                }
                placeholder="Search invoice number, customer or PO number..."
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-2.5 pl-10 pr-10 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500/50 focus:bg-white/[0.05]"
              />

              {search && (
                <button
                  type="button"
                  onClick={() =>
                    handleSearchChange("")
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* DESKTOP FILTERS */}

            <div className="hidden items-center gap-2 lg:flex">
              <select
                value={status}
                onChange={(event) =>
                  handleStatusChange(
                    event.target.value
                  )
                }
                className="rounded-xl border border-white/[0.08] bg-[#0b1728] px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-blue-500/50"
              >
                {STATUS_OPTIONS.map(
                  (option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      className="bg-[#0b1728]"
                    >
                      {option.label}
                    </option>
                  )
                )}
              </select>

              <select
                value={customerId}
                onChange={(event) =>
                  handleCustomerChange(
                    event.target.value
                  )
                }
                disabled={customersLoading}
                className="max-w-[220px] rounded-xl border border-white/[0.08] bg-[#0b1728] px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-blue-500/50 disabled:opacity-50"
              >
                <option
                  value="all"
                  className="bg-[#0b1728]"
                >
                  All customers
                </option>

                {customers.map(
                  (customer) => (
                    <option
                      key={customer.id}
                      value={customer.id}
                      className="bg-[#0b1728]"
                    >
                      {customer.company_name}
                    </option>
                  )
                )}
              </select>

              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-xl px-3 py-2.5 text-sm text-slate-500 transition hover:bg-white/[0.05] hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>

            {/* MOBILE FILTER BUTTON */}

            <button
              type="button"
              onClick={() =>
                setShowFilters(
                  (current) => !current
                )
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-slate-300 lg:hidden"
            >
              <SlidersHorizontal
                size={16}
              />

              Filters

              {hasFilters && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
                  !
                </span>
              )}
            </button>
          </div>

          {/* MOBILE FILTER PANEL */}

          {showFilters && (
            <div className="mt-3 grid grid-cols-1 gap-3 border-t border-white/[0.06] pt-3 lg:hidden">
              <select
                value={status}
                onChange={(event) =>
                  handleStatusChange(
                    event.target.value
                  )
                }
                className="rounded-xl border border-white/[0.08] bg-[#0b1728] px-3 py-2.5 text-sm text-slate-300 outline-none"
              >
                {STATUS_OPTIONS.map(
                  (option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      className="bg-[#0b1728]"
                    >
                      {option.label}
                    </option>
                  )
                )}
              </select>

              <select
                value={customerId}
                onChange={(event) =>
                  handleCustomerChange(
                    event.target.value
                  )
                }
                className="rounded-xl border border-white/[0.08] bg-[#0b1728] px-3 py-2.5 text-sm text-slate-300 outline-none"
              >
                <option value="all">
                  All customers
                </option>

                {customers.map(
                  (customer) => (
                    <option
                      key={customer.id}
                      value={customer.id}
                    >
                      {customer.company_name}
                    </option>
                  )
                )}
              </select>

              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-xl border border-white/[0.08] px-3 py-2.5 text-sm text-slate-400"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* ======================================================
            ERROR
        ====================================================== */}

        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
            <AlertCircle
              size={19}
              className="mt-0.5 flex-shrink-0 text-red-400"
            />

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-red-300">
                Unable to load invoices
              </p>

              <p className="mt-1 text-xs text-red-400/80">
                {error}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                fetchInvoices(true)
              }
              className="text-xs font-medium text-red-300 hover:text-white"
            >
              Retry
            </button>
          </div>
        )}

        {/* ======================================================
            TABLE
        ====================================================== */}

        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b1728]">
          {/* TABLE HEADER */}

          <div className="flex flex-col gap-2 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">
                All invoices
              </h2>

              <p className="mt-1 text-xs text-slate-600">
                {loading
                  ? "Loading invoices..."
                  : `${invoices.length} invoice${
                      invoices.length === 1
                        ? ""
                        : "s"
                    } displayed`}
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span>Sort by</span>

              <button
                type="button"
                onClick={() =>
                  handleSort("issue_date")
                }
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-slate-400 hover:bg-white/[0.05] hover:text-white"
              >
                Date

                {sortField ===
                  "issue_date" &&
                  (sortDirection === "desc" ? (
                    <ArrowDown size={12} />
                  ) : (
                    <ArrowUp size={12} />
                  ))}
              </button>
            </div>
          </div>

          {/* LOADING */}

          {loading ? (
            <div className="divide-y divide-white/[0.05]">
              {Array.from({
                length: 7,
              }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 px-5 py-5"
                >
                  <div className="h-10 w-10 animate-pulse rounded-xl bg-white/[0.05]" />

                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 animate-pulse rounded bg-white/[0.05]" />
                    <div className="h-3 w-24 animate-pulse rounded bg-white/[0.04]" />
                  </div>

                  <div className="hidden h-4 w-20 animate-pulse rounded bg-white/[0.05] md:block" />

                  <div className="hidden h-4 w-24 animate-pulse rounded bg-white/[0.05] lg:block" />

                  <div className="h-7 w-20 animate-pulse rounded-full bg-white/[0.05]" />
                </div>
              ))}
            </div>
          ) : sortedInvoices.length === 0 ? (
            /* EMPTY */

            <div className="flex min-h-[380px] flex-col items-center justify-center px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03]">
                <FileText
                  size={25}
                  className="text-slate-600"
                />
              </div>

              <h3 className="mt-5 text-sm font-semibold text-white">
                {hasFilters
                  ? "No matching invoices"
                  : "No invoices yet"}
              </h3>

              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                {hasFilters
                  ? "Try changing your search or filters to find the invoice you're looking for."
                  : "Create your first invoice to start tracking customer billing and payments."}
              </p>

              {hasFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.08] hover:text-white"
                >
                  Clear filters
                </button>
              ) : (
                <button
                  type="button"
                  onClick={createInvoice}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
                >
                  <Plus size={16} />
                  Create Invoice
                </button>
              )}
            </div>
          ) : (
            <>
              {/* DESKTOP TABLE */}

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1000px]">
                  <thead>
                    <tr className="border-b border-white/[0.05] text-left">
                      <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                        Invoice
                      </th>

                      <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                        Customer
                      </th>

                      <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                        <button
                          type="button"
                          onClick={() =>
                            handleSort(
                              "issue_date"
                            )
                          }
                          className="inline-flex items-center gap-1 hover:text-slate-300"
                        >
                          Issue date

                          {sortField ===
                            "issue_date" &&
                            (sortDirection ===
                            "desc" ? (
                              <ArrowDown
                                size={11}
                              />
                            ) : (
                              <ArrowUp
                                size={11}
                              />
                            ))}
                        </button>
                      </th>

                      <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                        <button
                          type="button"
                          onClick={() =>
                            handleSort(
                              "due_date"
                            )
                          }
                          className="inline-flex items-center gap-1 hover:text-slate-300"
                        >
                          Due date

                          {sortField ===
                            "due_date" &&
                            (sortDirection ===
                            "desc" ? (
                              <ArrowDown
                                size={11}
                              />
                            ) : (
                              <ArrowUp
                                size={11}
                              />
                            ))}
                        </button>
                      </th>

                      <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                        <button
                          type="button"
                          onClick={() =>
                            handleSort(
                              "total_amount"
                            )
                          }
                          className="ml-auto inline-flex items-center gap-1 hover:text-slate-300"
                        >
                          Amount

                          {sortField ===
                            "total_amount" &&
                            (sortDirection ===
                            "desc" ? (
                              <ArrowDown
                                size={11}
                              />
                            ) : (
                              <ArrowUp
                                size={11}
                              />
                            ))}
                        </button>
                      </th>

                      <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                        Due
                      </th>

                      <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                        Status
                      </th>

                      <th className="w-12 px-3 py-3" />
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-white/[0.05]">
                    {sortedInvoices.map(
                      (invoice) => {
                        const customerName =
                          getCustomerName(
                            invoice
                          );

                        const currency =
                          invoice.currency ||
                          "USD";

                        return (
                          <tr
                            key={invoice.id}
                            className="group transition hover:bg-white/[0.025]"
                          >
                            <td className="px-5 py-4">
                              <button
                                type="button"
                                onClick={() =>
                                  viewInvoice(
                                    invoice.id
                                  )
                                }
                                className="text-left"
                              >
                                <p className="text-sm font-semibold text-white transition group-hover:text-blue-400">
                                  {
                                    invoice.invoice_number
                                  }
                                </p>

                                {invoice.po_number && (
                                  <p className="mt-1 text-[11px] text-slate-600">
                                    PO{" "}
                                    {
                                      invoice.po_number
                                    }
                                  </p>
                                )}
                              </button>
                            </td>

                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-[11px] font-semibold text-slate-400">
                                  {getInitials(
                                    customerName
                                  )}
                                </div>

                                <div className="min-w-0">
                                  <p className="max-w-[220px] truncate text-sm font-medium text-slate-200">
                                    {
                                      customerName
                                    }
                                  </p>

                                  {invoice
                                    .customer
                                    ?.email && (
                                    <p className="mt-0.5 max-w-[220px] truncate text-xs text-slate-600">
                                      {
                                        invoice
                                          .customer
                                          .email
                                      }
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="px-5 py-4 text-sm text-slate-400">
                              {formatDate(
                                invoice.issue_date
                              )}
                            </td>

                            <td className="px-5 py-4 text-sm text-slate-400">
                              {formatDate(
                                invoice.due_date
                              )}
                            </td>

                            <td className="px-5 py-4 text-right">
                              <p className="text-sm font-semibold text-white">
                                {formatCurrency(
                                  invoice.total_amount,
                                  currency
                                )}
                              </p>

                              {toNumber(
                                invoice.amount_paid
                              ) > 0 && (
                                <p className="mt-0.5 text-[11px] text-emerald-400">
                                  {formatCurrency(
                                    invoice.amount_paid,
                                    currency
                                  )}{" "}
                                  paid
                                </p>
                              )}
                            </td>

                            <td className="px-5 py-4 text-right">
                              <span
                                className={
                                  toNumber(
                                    invoice.amount_due
                                  ) > 0
                                    ? "text-sm font-medium text-amber-400"
                                    : "text-sm font-medium text-emerald-400"
                                }
                              >
                                {formatCurrency(
                                  invoice.amount_due,
                                  currency
                                )}
                              </span>
                            </td>

                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${getStatusClasses(
                                  invoice.status
                                )}`}
                              >
                                {getStatusLabel(
                                  invoice.status
                                )}
                              </span>
                            </td>

                            <td className="relative px-3 py-4">
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenMenu(
                                    openMenu ===
                                      invoice.id
                                      ? null
                                      : invoice.id
                                  )
                                }
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-white/[0.07] hover:text-white"
                              >
                                <MoreHorizontal
                                  size={17}
                                />
                              </button>

                              {openMenu ===
                                invoice.id && (
                                <>
                                  <button
                                    type="button"
                                    aria-label="Close menu"
                                    className="fixed inset-0 z-10 cursor-default"
                                    onClick={() =>
                                      setOpenMenu(
                                        null
                                      )
                                    }
                                  />

                                  <div className="absolute right-3 top-12 z-20 w-48 rounded-xl border border-white/10 bg-[#101d30] p-1.5 shadow-2xl">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenu(
                                          null
                                        );
                                        viewInvoice(
                                          invoice.id
                                        );
                                      }}
                                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-slate-300 hover:bg-white/[0.06] hover:text-white"
                                    >
                                      <Eye
                                        size={15}
                                      />
                                      View invoice
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenu(
                                          null
                                        );
                                        editInvoice(
                                          invoice.id
                                        );
                                      }}
                                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-slate-300 hover:bg-white/[0.06] hover:text-white"
                                    >
                                      <Pencil
                                        size={15}
                                      />
                                      Edit invoice
                                    </button>

                                    {toNumber(
                                      invoice.amount_due
                                    ) > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenMenu(
                                            null
                                          );
                                          recordPayment(
                                            invoice.id
                                          );
                                        }}
                                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-slate-300 hover:bg-white/[0.06] hover:text-white"
                                      >
                                        <CircleDollarSign
                                          size={15}
                                        />
                                        Record payment
                                      </button>
                                    )}

                                    {[
                                      "draft",
                                      "pending_approval",
                                    ].includes(
                                      normalizeStatus(
                                        invoice.status
                                      )
                                    ) && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenMenu(
                                            null
                                          );
                                          sendInvoice(
                                            invoice.id
                                          );
                                        }}
                                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-slate-300 hover:bg-white/[0.06] hover:text-white"
                                      >
                                        <Send
                                          size={15}
                                        />
                                        Send invoice
                                      </button>
                                    )}
                                  </div>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>

              {/* ==================================================
                  MOBILE / TABLET CARDS
              ================================================== */}

              <div className="divide-y divide-white/[0.05] lg:hidden">
                {sortedInvoices.map(
                  (invoice) => {
                    const customerName =
                      getCustomerName(
                        invoice
                      );

                    const currency =
                      invoice.currency ||
                      "USD";

                    return (
                      <div
                        key={invoice.id}
                        className="p-4 sm:p-5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              viewInvoice(
                                invoice.id
                              )
                            }
                            className="min-w-0 text-left"
                          >
                            <p className="text-sm font-semibold text-white">
                              {
                                invoice.invoice_number
                              }
                            </p>

                            <div className="mt-2 flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.05] text-[9px] font-semibold text-slate-400">
                                {getInitials(
                                  customerName
                                )}
                              </div>

                              <span className="truncate text-xs text-slate-400">
                                {
                                  customerName
                                }
                              </span>
                            </div>
                          </button>

                          <span
                            className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium ${getStatusClasses(
                              invoice.status
                            )}`}
                          >
                            {getStatusLabel(
                              invoice.status
                            )}
                          </span>
                        </div>

                        <div className="mt-5 grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-slate-600">
                              Issue date
                            </p>

                            <p className="mt-1 text-xs text-slate-300">
                              {formatDate(
                                invoice.issue_date
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-slate-600">
                              Due date
                            </p>

                            <p className="mt-1 text-xs text-slate-300">
                              {formatDate(
                                invoice.due_date
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-slate-600">
                              Total
                            </p>

                            <p className="mt-1 text-sm font-semibold text-white">
                              {formatCurrency(
                                invoice.total_amount,
                                currency
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-slate-600">
                              Amount due
                            </p>

                            <p
                              className={`mt-1 text-sm font-semibold ${
                                toNumber(
                                  invoice.amount_due
                                ) > 0
                                  ? "text-amber-400"
                                  : "text-emerald-400"
                              }`}
                            >
                              {formatCurrency(
                                invoice.amount_due,
                                currency
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center gap-2 border-t border-white/[0.05] pt-4">
                          <button
                            type="button"
                            onClick={() =>
                              viewInvoice(
                                invoice.id
                              )
                            }
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-xs font-medium text-slate-300 hover:bg-white/[0.07] hover:text-white"
                          >
                            <Eye size={14} />
                            View
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              editInvoice(
                                invoice.id
                              )
                            }
                            className="flex items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-slate-400 hover:bg-white/[0.07] hover:text-white"
                            aria-label="Edit invoice"
                          >
                            <Pencil size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setOpenMenu(
                                openMenu ===
                                  invoice.id
                                  ? null
                                  : invoice.id
                              )
                            }
                            className="flex items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-slate-400 hover:bg-white/[0.07] hover:text-white"
                            aria-label="More actions"
                          >
                            <MoreHorizontal
                              size={14}
                            />
                          </button>
                        </div>

                        {openMenu ===
                          invoice.id && (
                          <div className="mt-2 rounded-xl border border-white/10 bg-[#101d30] p-1.5">
                            {toNumber(
                              invoice.amount_due
                            ) > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenu(
                                    null
                                  );
                                  recordPayment(
                                    invoice.id
                                  );
                                }}
                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-slate-300 hover:bg-white/[0.06] hover:text-white"
                              >
                                <CircleDollarSign
                                  size={15}
                                />
                                Record payment
                              </button>
                            )}

                            {[
                              "draft",
                              "pending_approval",
                            ].includes(
                              normalizeStatus(
                                invoice.status
                              )
                            ) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenu(
                                    null
                                  );
                                  sendInvoice(
                                    invoice.id
                                  );
                                }}
                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-slate-300 hover:bg-white/[0.06] hover:text-white"
                              >
                                <Send
                                  size={15}
                                />
                                Send invoice
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            </>
          )}

          {/* ======================================================
              PAGINATION
          ====================================================== */}

          {!loading &&
            sortedInvoices.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-600">
                  Page {page}
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() =>
                      setPage(
                        (current) =>
                          Math.max(
                            1,
                            current - 1
                          )
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-medium text-slate-400 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronLeft
                      size={14}
                    />
                    Previous
                  </button>

                  <button
                    type="button"
                    disabled={
                      sortedInvoices.length <
                      PAGE_SIZE
                    }
                    onClick={() =>
                      setPage(
                        (current) =>
                          current + 1
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-medium text-slate-400 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Next
                    <ChevronRight
                      size={14}
                    />
                  </button>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}