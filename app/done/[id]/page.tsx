"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  Edit3,
  FileText,
  Mail,
  MoreHorizontal,
  Phone,
  Printer,
  Send,
  Share2,
  Trash2,
  XCircle,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type InvoiceStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled";

type InvoiceItem = {
  id: string;
  product_id?: string | null;
  service_id?: string | null;
  name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  discount?: number;
  tax_rate?: number;
  subtotal: number;
  tax_amount?: number;
  total: number;
};

type Customer = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
};

type Invoice = {
  id: string;
  invoice_number: string;
  customer_id?: string | null;
  customer?: Customer | null;

  issue_date: string;
  due_date?: string | null;

  status: InvoiceStatus;

  currency: string;

  subtotal: number;
  discount?: number;
  tax_amount?: number;
  total: number;
  amount_paid?: number;
  amount_due?: number;

  notes?: string | null;
  terms?: string | null;

  items: InvoiceItem[];

  created_at: string;
  updated_at: string;
};

type InvoiceResponse = {
  invoice?: Invoice;
  data?: Invoice;
  error?: string;
};

function formatMoney(
  amount: number | null | undefined,
  currency = "KES"
) {
  const value = Number(amount || 0);

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
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

function getStatusLabel(status: InvoiceStatus) {
  switch (status) {
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "viewed":
      return "Viewed";
    case "partially_paid":
      return "Partially Paid";
    case "paid":
      return "Paid";
    case "overdue":
      return "Overdue";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function StatusIcon({
  status,
}: {
  status: InvoiceStatus;
}) {
  if (status === "paid") {
    return <CheckCircle2 size={15} />;
  }

  if (status === "overdue" || status === "cancelled") {
    return <XCircle size={15} />;
  }

  if (status === "draft") {
    return <FileText size={15} />;
  }

  return <Clock3 size={15} />;
}

function StatusBadge({
  status,
}: {
  status: InvoiceStatus;
}) {
  const classes =
    status === "paid"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
      : status === "overdue"
        ? "border-red-500/20 bg-red-500/10 text-red-400"
        : status === "cancelled"
          ? "border-slate-500/20 bg-slate-500/10 text-slate-400"
          : status === "partially_paid"
            ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
            : status === "sent" || status === "viewed"
              ? "border-blue-500/20 bg-blue-500/10 text-blue-400"
              : "border-slate-500/20 bg-white/5 text-slate-400";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${classes}`}
    >
      <StatusIcon status={status} />
      {getStatusLabel(status)}
    </span>
  );
}

export default function InvoiceDetailsPage() {
  const params = useParams();
  const router = useRouter();

  const invoiceId = String(params?.id || "");

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  const loadInvoice = useCallback(async () => {
    if (!invoiceId) return;

    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `/api/invoices/${encodeURIComponent(invoiceId)}`,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }
      );

      const payload: InvoiceResponse = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload.error || "Unable to load invoice."
        );
      }

      const loadedInvoice =
        payload.invoice || payload.data;

      if (!loadedInvoice) {
        throw new Error("Invoice was not returned by the API.");
      }

      setInvoice(loadedInvoice);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load invoice."
      );
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    loadInvoice();
  }, [loadInvoice]);

  const amountPaid = Number(invoice?.amount_paid || 0);

  const amountDue = useMemo(() => {
    if (!invoice) return 0;

    if (invoice.amount_due !== undefined) {
      return Number(invoice.amount_due || 0);
    }

    return Math.max(
      Number(invoice.total || 0) - amountPaid,
      0
    );
  }, [invoice, amountPaid]);

  const paymentProgress = useMemo(() => {
    if (!invoice || Number(invoice.total) <= 0) {
      return 0;
    }

    return Math.min(
      Math.max(
        (amountPaid / Number(invoice.total)) * 100,
        0
      ),
      100
    );
  }, [invoice, amountPaid]);

  const handleSend = async () => {
    if (!invoice) return;

    try {
      setActionLoading(true);
      setError("");

      const response = await fetch(
        `/api/invoices/${encodeURIComponent(invoice.id)}/send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
        }
      );

      const payload = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload.error || "Unable to send invoice."
        );
      }

      await loadInvoice();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to send invoice."
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!invoice) return;

    const confirmed = window.confirm(
      `Delete invoice ${invoice.invoice_number}? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setActionLoading(true);
      setError("");

      const response = await fetch(
        `/api/invoices/${encodeURIComponent(invoice.id)}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const payload = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload.error || "Unable to delete invoice."
        );
      }

      router.push("/invoices");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete invoice."
      );
    } finally {
      setActionLoading(false);
      setShowMenu(false);
    }
  };

  const handlePrint = () => {
    window.print();
    setShowMenu(false);
  };

  const handleDownload = async () => {
    if (!invoice) return;

    try {
      setActionLoading(true);
      setError("");

      const response = await fetch(
        `/api/invoices/${encodeURIComponent(invoice.id)}/pdf`,
        {
          method: "GET",
          credentials: "include",
        }
      );

      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => ({}));

        throw new Error(
          payload.error || "Unable to download invoice."
        );
      }

      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = `${invoice.invoice_number}.pdf`;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to download invoice."
      );
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07111f] p-6 text-white">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="h-10 w-48 animate-pulse rounded-xl bg-white/5" />
          <div className="h-32 animate-pulse rounded-2xl bg-white/5" />

          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="h-[600px] animate-pulse rounded-2xl bg-white/5" />
            <div className="h-[400px] animate-pulse rounded-2xl bg-white/5" />
          </div>
        </div>
      </div>
    );
  }

  if (error && !invoice) {
    return (
      <div className="min-h-screen bg-[#07111f] p-6 text-white">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            onClick={() => router.push("/invoices")}
            className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
          >
            <ArrowLeft size={17} />
            Back to invoices
          </button>

          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
            <h2 className="text-lg font-semibold text-red-300">
              Unable to load invoice
            </h2>

            <p className="mt-2 text-sm text-red-200/70">
              {error}
            </p>

            <button
              type="button"
              onClick={loadInvoice}
              className="mt-5 rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return null;
  }

  const customer = invoice.customer;

  return (
    <div className="min-h-screen bg-[#07111f] text-white print:bg-white print:text-black">
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        {/* HEADER */}

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => router.push("/invoices")}
              className="mt-1 rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-400 hover:bg-white/10 hover:text-white print:hidden"
              aria-label="Back"
            >
              <ArrowLeft size={18} />
            </button>

            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">
                  {invoice.invoice_number}
                </h1>

                <StatusBadge status={invoice.status} />
              </div>

              <p className="mt-1 text-sm text-slate-500">
                Invoice details and payment information
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/invoices/new?edit=${encodeURIComponent(
                    invoice.id
                  )}`
                )
              }
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10"
            >
              <Edit3 size={16} />
              Edit
            </button>

            <button
              type="button"
              onClick={handleSend}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-900/20 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={16} />
              {actionLoading ? "Sending..." : "Send"}
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10 disabled:opacity-50"
            >
              <Download size={16} />
              PDF
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10"
            >
              <Printer size={16} />
              Print
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMenu((value) => !value)}
                className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-400 hover:bg-white/10 hover:text-white"
                aria-label="More actions"
              >
                <MoreHorizontal size={18} />
              </button>

              {showMenu && (
                <div className="absolute right-0 top-12 z-20 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#0c1828] shadow-2xl">
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                  >
                    <Printer size={16} />
                    Print invoice
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);

                      if (
                        navigator.clipboard &&
                        typeof window !== "undefined"
                      ) {
                        navigator.clipboard.writeText(
                          window.location.href
                        );
                      }
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                  >
                    <Share2 size={16} />
                    Copy link
                  </button>

                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={actionLoading}
                    className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3 text-left text-sm text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 size={16} />
                    Delete invoice
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300 print:hidden">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* INVOICE DOCUMENT */}

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1727] shadow-2xl print:rounded-none print:border-0 print:bg-white print:shadow-none">
            <div className="p-6 sm:p-8 lg:p-10">
              {/* DOCUMENT TOP */}

              <div className="flex flex-col gap-8 border-b border-white/10 pb-8 sm:flex-row sm:items-start sm:justify-between print:border-gray-200">
                <div>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
                    <FileText size={23} />
                  </div>

                  <h2 className="text-2xl font-bold">
                    INVOICE
                  </h2>

                  <p className="mt-1 text-sm text-slate-500 print:text-gray-500">
                    {invoice.invoice_number}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <p className="text-xs uppercase tracking-wider text-slate-500 print:text-gray-500">
                    Total Due
                  </p>

                  <p className="mt-1 text-3xl font-bold text-white print:text-black">
                    {formatMoney(
                      amountDue,
                      invoice.currency
                    )}
                  </p>

                  <p className="mt-2 text-sm text-slate-500 print:text-gray-500">
                    Due {formatDate(invoice.due_date)}
                  </p>
                </div>
              </div>

              {/* CUSTOMER / DATE */}

              <div className="grid gap-8 border-b border-white/10 py-8 sm:grid-cols-2 print:border-gray-200">
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 print:text-gray-500">
                    Bill To
                  </p>

                  {customer ? (
                    <div>
                      <p className="font-semibold text-white print:text-black">
                        {customer.name}
                      </p>

                      {customer.email && (
                        <p className="mt-1 text-sm text-slate-400 print:text-gray-600">
                          {customer.email}
                        </p>
                      )}

                      {customer.phone && (
                        <p className="mt-1 text-sm text-slate-400 print:text-gray-600">
                          {customer.phone}
                        </p>
                      )}

                      {customer.address && (
                        <p className="mt-2 whitespace-pre-line text-sm text-slate-500 print:text-gray-600">
                          {customer.address}
                        </p>
                      )}

                      {(customer.city ||
                        customer.country) && (
                        <p className="text-sm text-slate-500 print:text-gray-600">
                          {[
                            customer.city,
                            customer.country,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">
                      No customer information
                    </p>
                  )}
                </div>

                <div className="sm:text-right">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 print:text-gray-500">
                    Invoice Information
                  </p>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between gap-6 sm:justify-end">
                      <span className="text-slate-500">
                        Issue date
                      </span>
                      <span className="font-medium text-slate-200 print:text-black">
                        {formatDate(invoice.issue_date)}
                      </span>
                    </div>

                    <div className="flex justify-between gap-6 sm:justify-end">
                      <span className="text-slate-500">
                        Due date
                      </span>
                      <span className="font-medium text-slate-200 print:text-black">
                        {formatDate(invoice.due_date)}
                      </span>
                    </div>

                    <div className="flex justify-between gap-6 sm:justify-end">
                      <span className="text-slate-500">
                        Currency
                      </span>
                      <span className="font-medium text-slate-200 print:text-black">
                        {invoice.currency}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ITEMS */}

              <div className="py-8">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[650px]">
                    <thead>
                      <tr className="border-b border-white/10 text-left print:border-gray-200">
                        <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500 print:text-gray-500">
                          Description
                        </th>

                        <th className="pb-3 px-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 print:text-gray-500">
                          Qty
                        </th>

                        <th className="pb-3 px-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 print:text-gray-500">
                          Unit Price
                        </th>

                        <th className="pb-3 pl-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 print:text-gray-500">
                          Amount
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {invoice.items?.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-white/5 print:border-gray-100"
                        >
                          <td className="py-4 pr-4">
                            <p className="font-medium text-slate-200 print:text-black">
                              {item.name}
                            </p>

                            {item.description && (
                              <p className="mt-1 text-xs text-slate-500 print:text-gray-500">
                                {item.description}
                              </p>
                            )}
                          </td>

                          <td className="px-4 py-4 text-right text-sm text-slate-400 print:text-gray-600">
                            {item.quantity}
                          </td>

                          <td className="px-4 py-4 text-right text-sm text-slate-400 print:text-gray-600">
                            {formatMoney(
                              item.unit_price,
                              invoice.currency
                            )}
                          </td>

                          <td className="py-4 pl-4 text-right text-sm font-medium text-slate-200 print:text-black">
                            {formatMoney(
                              item.total,
                              invoice.currency
                            )}
                          </td>
                        </tr>
                      ))}

                      {!invoice.items?.length && (
                        <tr>
                          <td
                            colSpan={4}
                            className="py-10 text-center text-sm text-slate-500"
                          >
                            No invoice items.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* TOTALS */}

              <div className="flex justify-end border-t border-white/10 pt-6 print:border-gray-200">
                <div className="w-full max-w-sm space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">
                      Subtotal
                    </span>

                    <span className="text-slate-300 print:text-black">
                      {formatMoney(
                        invoice.subtotal,
                        invoice.currency
                      )}
                    </span>
                  </div>

                  {!!invoice.discount && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">
                        Discount
                      </span>

                      <span className="text-slate-300 print:text-black">
                        -
                        {formatMoney(
                          invoice.discount,
                          invoice.currency
                        )}
                      </span>
                    </div>
                  )}

                  {!!invoice.tax_amount && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">
                        Tax
                      </span>

                      <span className="text-slate-300 print:text-black">
                        {formatMoney(
                          invoice.tax_amount,
                          invoice.currency
                        )}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between border-t border-white/10 pt-4 print:border-gray-200">
                    <span className="font-semibold">
                      Total
                    </span>

                    <span className="text-xl font-bold">
                      {formatMoney(
                        invoice.total,
                        invoice.currency
                      )}
                    </span>
                  </div>

                  {amountPaid > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-emerald-400">
                        Paid
                      </span>

                      <span className="font-medium text-emerald-400">
                        {formatMoney(
                          amountPaid,
                          invoice.currency
                        )}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-blue-400">
                      Balance Due
                    </span>

                    <span className="font-bold text-blue-400">
                      {formatMoney(
                        amountDue,
                        invoice.currency
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* NOTES / TERMS */}

              {(invoice.notes || invoice.terms) && (
                <div className="mt-10 grid gap-8 border-t border-white/10 pt-8 sm:grid-cols-2 print:border-gray-200">
                  {invoice.notes && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Notes
                      </p>

                      <p className="whitespace-pre-line text-sm leading-6 text-slate-400 print:text-gray-600">
                        {invoice.notes}
                      </p>
                    </div>
                  )}

                  {invoice.terms && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Terms & Conditions
                      </p>

                      <p className="whitespace-pre-line text-sm leading-6 text-slate-400 print:text-gray-600">
                        {invoice.terms}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL */}

          <div className="space-y-6 print:hidden">
            {/* PAYMENT SUMMARY */}

            <div className="rounded-2xl border border-white/10 bg-[#0b1727] p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">
                    Payment Summary
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Current invoice balance
                  </p>
                </div>

                <CreditCardIcon />
              </div>

              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex justify-between text-xs">
                    <span className="text-slate-500">
                      Payment progress
                    </span>

                    <span className="text-slate-300">
                      {Math.round(paymentProgress)}%
                    </span>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{
                        width: `${paymentProgress}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/[0.03] p-3">
                    <p className="text-xs text-slate-500">
                      Total
                    </p>

                    <p className="mt-1 text-sm font-semibold">
                      {formatMoney(
                        invoice.total,
                        invoice.currency
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl bg-white/[0.03] p-3">
                    <p className="text-xs text-slate-500">
                      Paid
                    </p>

                    <p className="mt-1 text-sm font-semibold text-emerald-400">
                      {formatMoney(
                        amountPaid,
                        invoice.currency
                      )}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-blue-500/10 bg-blue-500/5 p-4">
                  <p className="text-xs text-slate-500">
                    Balance due
                  </p>

                  <p className="mt-1 text-xl font-bold text-blue-400">
                    {formatMoney(
                      amountDue,
                      invoice.currency
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/invoices/payments?invoice=${encodeURIComponent(
                        invoice.id
                      )}`
                    )
                  }
                  className="w-full rounded-xl bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white"
                >
                  View Payments
                </button>
              </div>
            </div>

            {/* CUSTOMER */}

            <div className="rounded-2xl border border-white/10 bg-[#0b1727] p-5">
              <div className="mb-5 flex items-center justify-between">
                <p className="text-sm font-semibold">
                  Customer
                </p>

                {customer?.id && (
                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        `/invoices/customers/${encodeURIComponent(
                          customer.id
                        )}`
                      )
                    }
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    View customer
                  </button>
                )}
              </div>

              {customer ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600/15 text-sm font-bold text-blue-400">
                      {customer.name
                        ?.slice(0, 2)
                        .toUpperCase()}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {customer.name}
                      </p>

                      <p className="truncate text-xs text-slate-500">
                        Customer
                      </p>
                    </div>
                  </div>

                  {customer.email && (
                    <div className="flex items-center gap-3 text-sm">
                      <Mail
                        size={16}
                        className="text-slate-500"
                      />

                      <span className="truncate text-slate-400">
                        {customer.email}
                      </span>
                    </div>
                  )}

                  {customer.phone && (
                    <div className="flex items-center gap-3 text-sm">
                      <Phone
                        size={16}
                        className="text-slate-500"
                      />

                      <span className="text-slate-400">
                        {customer.phone}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No customer attached.
                </p>
              )}
            </div>

            {/* QUICK ACTIONS */}

            <div className="rounded-2xl border border-white/10 bg-[#0b1727] p-5">
              <p className="mb-4 text-sm font-semibold">
                Quick Actions
              </p>

              <div className="space-y-2">
                {customer?.email && (
                  <a
                    href={`mailto:${customer.email}`}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
                  >
                    <Mail size={17} />
                    Email customer
                  </a>
                )}

                {customer?.phone && (
                  <a
                    href={`tel:${customer.phone}`}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
                  >
                    <Phone size={17} />
                    Call customer
                  </a>
                )}

                <button
                  type="button"
                  onClick={handleSend}
                  disabled={actionLoading}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-50"
                >
                  <Send size={17} />
                  Send invoice
                </button>
              </div>
            </div>

            {/* TIMELINE */}

            <div className="rounded-2xl border border-white/10 bg-[#0b1727] p-5">
              <p className="mb-5 text-sm font-semibold">
                Invoice Activity
              </p>

              <div className="relative space-y-5">
                <TimelineItem
                  title="Invoice created"
                  date={invoice.created_at}
                  active
                />

                {invoice.status !== "draft" && (
                  <TimelineItem
                    title="Invoice sent"
                    date={invoice.updated_at}
                    active
                  />
                )}

                {invoice.status === "paid" && (
                  <TimelineItem
                    title="Invoice paid"
                    date={invoice.updated_at}
                    active
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }

          @page {
            margin: 15mm;
          }
        }
      `}</style>
    </div>
  );
}

function TimelineItem({
  title,
  date,
  active = false,
}: {
  title: string;
  date?: string | null;
  active?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div
        className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
          active
            ? "bg-blue-500/15 text-blue-400"
            : "bg-white/5 text-slate-500"
        }`}
      >
        <CheckCircle2 size={14} />
      </div>

      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-300">
          {title}
        </p>

        <p className="mt-1 text-xs text-slate-500">
          {formatDate(date)}
        </p>
      </div>
    </div>
  );
}

function CreditCardIcon() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
      <CreditCardSmall />
    </div>
  );
}

function CreditCardSmall() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect
        width="20"
        height="14"
        x="2"
        y="5"
        rx="2"
      />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}