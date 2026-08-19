// app/invoices/payments/page.tsx

"use client";

import {
  ArrowDownToLine,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Download,
  Eye,
  FileText,
  Filter,
  MoreHorizontal,
  Search,
  Wallet,
  XCircle,
  Clock3,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Payment = {
  id: string;
  payment_number?: string | null;
  invoice_id?: string | null;
  invoice_number?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  amount: number | string;
  currency?: string | null;
  payment_method?: string | null;
  reference?: string | null;
  payment_date?: string | null;
  status?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

type PaymentsResponse = {
  payments?: Payment[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
};

const PAYMENT_METHODS = [
  "All methods",
  "Cash",
  "M-Pesa",
  "Bank Transfer",
  "Card",
  "Cheque",
  "Other",
];

const PAYMENT_STATUSES = [
  "All statuses",
  "completed",
  "pending",
  "failed",
  "refunded",
];

function formatMoney(
  value: number | string | null | undefined,
  currency = "KES"
) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function statusClass(status?: string | null) {
  switch ((status || "").toLowerCase()) {
    case "completed":
    case "paid":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";

    case "pending":
      return "border-amber-500/20 bg-amber-500/10 text-amber-400";

    case "failed":
      return "border-red-500/20 bg-red-500/10 text-red-400";

    case "refunded":
      return "border-purple-500/20 bg-purple-500/10 text-purple-400";

    default:
      return "border-white/10 bg-white/5 text-slate-400";
  }
}

function methodLabel(method?: string | null) {
  if (!method) return "Other";

  switch (method.toLowerCase()) {
    case "mpesa":
    case "m-pesa":
      return "M-Pesa";

    case "bank":
    case "bank_transfer":
    case "bank-transfer":
      return "Bank Transfer";

    case "credit_card":
    case "credit-card":
    case "card":
      return "Card";

    case "cheque":
    case "check":
      return "Cheque";

    default:
      return method;
  }
}

export default function PaymentsPage() {
  const router = useRouter();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("All methods");
  const [status, setStatus] = useState("All statuses");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [menuId, setMenuId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [summary, setSummary] = useState({
    total: 0,
    completed: 0,
    pending: 0,
    failed: 0,
  });

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();

      params.set("page", String(page));
      params.set("limit", "20");

      if (search.trim()) {
        params.set("search", search.trim());
      }

      if (method !== "All methods") {
        params.set("payment_method", method);
      }

      if (status !== "All statuses") {
        params.set("status", status);
      }

      if (dateFrom) {
        params.set("date_from", dateFrom);
      }

      if (dateTo) {
        params.set("date_to", dateTo);
      }

      const response = await fetch(
        `/api/invoice-payments?${params.toString()}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data: PaymentsResponse = await response.json();

      if (!response.ok) {
        throw new Error(
          (data as PaymentsResponse & { error?: string })?.error ||
            "Unable to load payments."
        );
      }

      const loadedPayments = data.payments || [];

      setPayments(loadedPayments);
      setTotalPages(Math.max(1, data.totalPages || 1));

      const completed = loadedPayments
        .filter(
          (payment) =>
            (payment.status || "").toLowerCase() === "completed"
        )
        .reduce(
          (sum, payment) => sum + Number(payment.amount || 0),
          0
        );

      const pending = loadedPayments
        .filter(
          (payment) =>
            (payment.status || "").toLowerCase() === "pending"
        )
        .reduce(
          (sum, payment) => sum + Number(payment.amount || 0),
          0
        );

      const failed = loadedPayments
        .filter(
          (payment) =>
            (payment.status || "").toLowerCase() === "failed"
        )
        .reduce(
          (sum, payment) => sum + Number(payment.amount || 0),
          0
        );

      const total = loadedPayments.reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      );

      setSummary({
        total,
        completed,
        pending,
        failed,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load payments."
      );
    } finally {
      setLoading(false);
    }
  }, [
    page,
    search,
    method,
    status,
    dateFrom,
    dateTo,
  ]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    setPage(1);
  }, [search, method, status, dateFrom, dateTo]);

  const filteredPayments = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return payments;
    }

    return payments.filter((payment) => {
      return [
        payment.payment_number,
        payment.invoice_number,
        payment.customer_name,
        payment.reference,
        payment.payment_method,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query)
        );
    });
  }, [payments, search]);

  function clearFilters() {
    setSearch("");
    setMethod("All methods");
    setStatus("All statuses");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  function exportCsv() {
    const headers = [
      "Payment Number",
      "Invoice",
      "Customer",
      "Amount",
      "Currency",
      "Payment Method",
      "Reference",
      "Payment Date",
      "Status",
    ];

    const rows = filteredPayments.map((payment) => [
      payment.payment_number || "",
      payment.invoice_number || "",
      payment.customer_name || "",
      payment.amount || 0,
      payment.currency || "KES",
      methodLabel(payment.payment_method),
      payment.reference || "",
      payment.payment_date || "",
      payment.status || "",
    ]);

    const csv = [
      headers,
      ...rows,
    ]
      .map((row) =>
        row
          .map((value) => {
            const text = String(value ?? "");

            return `"${text.replace(/"/g, '""')}"`
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `payments-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  }

  const hasFilters =
    search.trim() !== "" ||
    method !== "All methods" ||
    status !== "All statuses" ||
    dateFrom !== "" ||
    dateTo !== "";

  return (
    <main className="min-h-screen bg-[#07111f] text-white">
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        {/* HEADER */}

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-600">
              <CreditCard size={14} />
              Invoicing
            </div>

            <h1 className="mt-2 text-2xl font-bold tracking-tight">
              Payments
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Track money received against your invoices.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={filteredPayments.length === 0}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={17} />
              Export CSV
            </button>

            <button
              type="button"
              onClick={() => router.push("/invoices")}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 transition hover:bg-blue-500"
            >
              <FileText size={17} />
              View Invoices
            </button>
          </div>
        </div>

        {/* SUMMARY */}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            icon={Wallet}
            label="Total Payments"
            value={formatMoney(summary.total)}
            description="Payments in current result"
          />

          <SummaryCard
            icon={CheckCircle2}
            label="Completed"
            value={formatMoney(summary.completed)}
            description="Successfully received"
          />

          <SummaryCard
            icon={Clock3}
            label="Pending"
            value={formatMoney(summary.pending)}
            description="Awaiting confirmation"
          />

          <SummaryCard
            icon={XCircle}
            label="Failed"
            value={formatMoney(summary.failed)}
            description="Unsuccessful payments"
          />
        </div>

        {/* FILTER BAR */}

        <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"
              />

              <input
                type="search"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search payments, customers, invoices..."
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
              />
            </div>

            <button
              type="button"
              onClick={() =>
                setShowFilters((value) => !value)
              }
              className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                showFilters || hasFilters
                  ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                  : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]"
              }`}
            >
              <Filter size={16} />
              Filters

              {hasFilters && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] text-white">
                  !
                </span>
              )}

              <ChevronDown
                size={15}
                className={`transition-transform ${
                  showFilters ? "rotate-180" : ""
                }`}
              />
            </button>

            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-xl px-3 py-2.5 text-sm text-slate-500 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {showFilters && (
            <div className="grid gap-4 border-t border-white/[0.07] p-4 md:grid-cols-2 lg:grid-cols-4">
              <SelectFilter
                label="Payment Method"
                value={method}
                options={PAYMENT_METHODS}
                onChange={setMethod}
              />

              <SelectFilter
                label="Status"
                value={status}
                options={PAYMENT_STATUSES}
                onChange={setStatus}
              />

              <DateFilter
                label="From"
                value={dateFrom}
                onChange={setDateFrom}
              />

              <DateFilter
                label="To"
                value={dateTo}
                onChange={setDateTo}
              />
            </div>
          )}
        </section>

        {/* ERROR */}

        {error && (
          <div className="mb-5 flex flex-col gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-red-300">
              {error}
            </p>

            <button
              type="button"
              onClick={loadPayments}
              className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-medium text-red-300 hover:bg-red-500/20"
            >
              Try Again
            </button>
          </div>
        )}

        {/* PAYMENTS */}

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="flex items-center justify-between border-b border-white/[0.07] p-5">
            <div>
              <h2 className="font-semibold">
                Payment Transactions
              </h2>

              <p className="mt-1 text-xs text-slate-600">
                {loading
                  ? "Loading payments..."
                  : `${filteredPayments.length} payment${
                      filteredPayments.length === 1
                        ? ""
                        : "s"
                    } shown`}
              </p>
            </div>

            <button
              type="button"
              onClick={loadPayments}
              className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white"
              title="Refresh"
            >
              <ArrowDownToLine size={17} />
            </button>
          </div>

          {loading ? (
            <PaymentSkeleton />
          ) : filteredPayments.length === 0 ? (
            <EmptyPayments hasFilters={hasFilters} />
          ) : (
            <>
              {/* DESKTOP */}

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/[0.07] text-left text-[10px] uppercase tracking-[0.14em] text-slate-600">
                      <th className="px-5 py-4 font-medium">
                        Payment
                      </th>

                      <th className="px-5 py-4 font-medium">
                        Customer
                      </th>

                      <th className="px-5 py-4 font-medium">
                        Invoice
                      </th>

                      <th className="px-5 py-4 font-medium">
                        Method
                      </th>

                      <th className="px-5 py-4 font-medium">
                        Date
                      </th>

                      <th className="px-5 py-4 font-medium">
                        Status
                      </th>

                      <th className="px-5 py-4 text-right font-medium">
                        Amount
                      </th>

                      <th className="w-12 px-3 py-4" />
                    </tr>
                  </thead>

                  <tbody>
                    {filteredPayments.map((payment) => (
                      <PaymentRow
                        key={payment.id}
                        payment={payment}
                        menuOpen={menuId === payment.id}
                        onMenu={() =>
                          setMenuId((current) =>
                            current === payment.id
                              ? null
                              : payment.id
                          )
                        }
                        onInvoice={() => {
                          if (payment.invoice_id) {
                            router.push(
                              `/invoices/${payment.invoice_id}`
                            );
                          }
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MOBILE */}

              <div className="space-y-3 p-4 md:hidden">
                {filteredPayments.map((payment) => (
                  <PaymentMobileCard
                    key={payment.id}
                    payment={payment}
                    menuOpen={menuId === payment.id}
                    onMenu={() =>
                      setMenuId((current) =>
                        current === payment.id
                          ? null
                          : payment.id
                      )
                    }
                    onInvoice={() => {
                      if (payment.invoice_id) {
                        router.push(
                          `/invoices/${payment.invoice_id}`
                        );
                      }
                    }}
                  />
                ))}
              </div>

              {/* PAGINATION */}

              <div className="flex flex-col gap-3 border-t border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-600">
                  Page {page} of {totalPages}
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() =>
                      setPage((current) =>
                        Math.max(1, current - 1)
                      )
                    }
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Previous
                  </button>

                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() =>
                      setPage((current) =>
                        Math.min(totalPages, current + 1)
                      )
                    }
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
          <Icon size={18} />
        </div>

        <ArrowUpRight
          size={15}
          className="text-slate-700"
        />
      </div>

      <p className="mt-4 text-xs uppercase tracking-wider text-slate-600">
        {label}
      </p>

      <p className="mt-1 truncate text-xl font-bold text-white">
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {description}
      </p>
    </div>
  );
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium text-slate-500">
        {label}
      </span>

      <div className="relative">
        <select
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          className="w-full appearance-none rounded-xl border border-white/10 bg-[#0b1727] px-3 py-2.5 pr-9 text-sm text-slate-300 outline-none focus:border-blue-500"
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <ChevronDown
          size={15}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-600"
        />
      </div>
    </label>
  );
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium text-slate-500">
        {label}
      </span>

      <input
        type="date"
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="w-full rounded-xl border border-white/10 bg-[#0b1727] px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-blue-500"
      />
    </label>
  );
}

function PaymentRow({
  payment,
  menuOpen,
  onMenu,
  onInvoice,
}: {
  payment: Payment;
  menuOpen: boolean;
  onMenu: () => void;
  onInvoice: () => void;
}) {
  return (
    <tr className="border-b border-white/[0.05] transition hover:bg-white/[0.025]">
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
            <Wallet size={16} />
          </div>

          <div>
            <p className="text-sm font-medium text-white">
              {payment.payment_number ||
                `Payment ${payment.id.slice(0, 8)}`}
            </p>

            {payment.reference && (
              <p className="mt-1 text-xs text-slate-600">
                Ref: {payment.reference}
              </p>
            )}
          </div>
        </div>
      </td>

      <td className="px-5 py-4">
        <p className="max-w-[180px] truncate text-sm text-slate-300">
          {payment.customer_name || "Unknown customer"}
        </p>
      </td>

      <td className="px-5 py-4">
        {payment.invoice_id ? (
          <button
            type="button"
            onClick={onInvoice}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            {payment.invoice_number ||
              payment.invoice_id}
          </button>
        ) : (
          <span className="text-sm text-slate-600">
            —
          </span>
        )}
      </td>

      <td className="px-5 py-4 text-sm text-slate-400">
        {methodLabel(payment.payment_method)}
      </td>

      <td className="px-5 py-4 text-sm text-slate-400">
        {formatDate(payment.payment_date)}
      </td>

      <td className="px-5 py-4">
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium capitalize ${statusClass(
            payment.status
          )}`}
        >
          {payment.status || "Unknown"}
        </span>
      </td>

      <td className="px-5 py-4 text-right">
        <p className="text-sm font-semibold text-white">
          {formatMoney(
            payment.amount,
            payment.currency || "KES"
          )}
        </p>
      </td>

      <td className="relative px-3 py-4">
        <button
          type="button"
          onClick={onMenu}
          className="rounded-lg p-2 text-slate-600 hover:bg-white/5 hover:text-white"
        >
          <MoreHorizontal size={17} />
        </button>

        {menuOpen && (
          <div className="absolute right-3 top-12 z-20 w-40 rounded-xl border border-white/10 bg-[#0c1828] p-1 shadow-2xl">
            {payment.invoice_id && (
              <button
                type="button"
                onClick={onInvoice}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5 hover:text-white"
              >
                <Eye size={14} />
                View Invoice
              </button>
            )}

            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5 hover:text-white"
            >
              <FileText size={14} />
              View Payment
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function PaymentMobileCard({
  payment,
  menuOpen,
  onMenu,
  onInvoice,
}: {
  payment: Payment;
  menuOpen: boolean;
  onMenu: () => void;
  onInvoice: () => void;
}) {
  return (
    <div className="relative rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <Wallet size={17} />
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {payment.payment_number ||
                `Payment ${payment.id.slice(0, 8)}`}
            </p>

            <p className="mt-1 truncate text-xs text-slate-500">
              {payment.customer_name ||
                "Unknown customer"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onMenu}
          className="rounded-lg p-1.5 text-slate-600 hover:bg-white/5 hover:text-white"
        >
          <MoreHorizontal size={17} />
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-medium capitalize ${statusClass(
            payment.status
          )}`}
        >
          {payment.status || "Unknown"}
        </span>

        <p className="text-sm font-bold text-white">
          {formatMoney(
            payment.amount,
            payment.currency || "KES"
          )}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-600">
            Method
          </p>

          <p className="mt-1 text-xs text-slate-300">
            {methodLabel(payment.payment_method)}
          </p>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-600">
            Date
          </p>

          <p className="mt-1 text-xs text-slate-300">
            {formatDate(payment.payment_date)}
          </p>
        </div>
      </div>

      {payment.invoice_id && (
        <button
          type="button"
          onClick={onInvoice}
          className="mt-3 flex w-full items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-blue-400 hover:bg-white/[0.06]"
        >
          <span>
            {payment.invoice_number ||
              "View invoice"}
          </span>

          <ArrowUpRight size={14} />
        </button>
      )}

      {menuOpen && (
        <div className="absolute right-4 top-14 z-20 w-40 rounded-xl border border-white/10 bg-[#0c1828] p-1 shadow-2xl">
          {payment.invoice_id && (
            <button
              type="button"
              onClick={onInvoice}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5 hover:text-white"
            >
              <Eye size={14} />
              View Invoice
            </button>
          )}

          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5 hover:text-white"
          >
            <FileText size={14} />
            View Payment
          </button>
        </div>
      )}
    </div>
  );
}

function PaymentSkeleton() {
  return (
    <div className="divide-y divide-white/[0.05]">
      {Array.from({ length: 7 }).map((_, index) => (
        <div
          key={index}
          className="flex animate-pulse items-center gap-5 p-5"
        >
          <div className="h-10 w-10 rounded-xl bg-white/5" />

          <div className="flex-1 space-y-2">
            <div className="h-3 w-32 rounded bg-white/5" />
            <div className="h-2.5 w-48 rounded bg-white/5" />
          </div>

          <div className="hidden h-3 w-24 rounded bg-white/5 md:block" />
          <div className="hidden h-3 w-20 rounded bg-white/5 md:block" />
          <div className="h-3 w-24 rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}

function EmptyPayments({
  hasFilters,
}: {
  hasFilters: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
        {hasFilters ? (
          <Search size={26} className="text-slate-600" />
        ) : (
          <Wallet size={26} className="text-slate-600" />
        )}
      </div>

      <h3 className="mt-5 font-semibold text-white">
        {hasFilters
          ? "No payments found"
          : "No payments yet"}
      </h3>

      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
        {hasFilters
          ? "No payment transactions match your current search and filters. Try changing the filters."
          : "Payments recorded against your invoices will appear here."}
      </p>
    </div>
  );
}