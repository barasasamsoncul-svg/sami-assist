"use client";

import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Download,
  Send,
  Printer,
  Edit,
  Copy,
  Trash2,
  MoreVertical,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Eye,
  Calendar,
  User,
  DollarSign,
  FileText,
  CreditCard,
  Clock,
} from "lucide-react";

interface InvoiceDetailProps {
  invoiceId?: string;
}

export default function InvoiceDetail({ invoiceId: propId }: InvoiceDetailProps) {
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showActions, setShowActions] = useState(false);

  // Get invoice ID from URL if not passed as prop
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split("?")[1]);
    const id = propId || params.get("id");
    if (id) {
      fetchInvoice(id);
    }
  }, [propId]);

  const fetchInvoice = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/invoices/${id}`);
      if (!response.ok) throw new Error("Failed to fetch invoice");
      const data = await response.json();
      setInvoice(data.invoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: string) => {
    if (!invoice) return;
    setActionLoading(true);
    setError(null);

    try {
      let response;
      switch (action) {
        case "send":
          response = await fetch(`/api/invoices/${invoice.id}/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ via: "email" }),
          });
          break;
        case "duplicate":
          response = await fetch(`/api/invoices/${invoice.id}/duplicate`, {
            method: "POST",
          });
          break;
        case "void":
          response = await fetch(`/api/invoices/${invoice.id}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason: "Voided by user" }),
          });
          break;
        case "mark_paid":
          response = await fetch(`/api/invoices/${invoice.id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "paid" }),
          });
          break;
        default:
          return;
      }

      if (!response?.ok) {
        const errorData = await response?.json();
        throw new Error(errorData?.error || `Failed to ${action} invoice`);
      }

      // Refresh invoice
      await fetchInvoice(invoice.id);
      setShowActions(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} invoice`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 p-12 text-center">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <h3 className="mt-4 text-lg font-medium text-red-600 dark:text-red-400">
          {error || "Invoice not found"}
        </h3>
        <a href="#invoices" className="mt-4 text-sm text-blue-600 hover:text-blue-700">
          ← Back to Invoices
        </a>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400",
    pending_approval: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400",
    sent: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",
    viewed: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400",
    partially_paid: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400",
    paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
    overdue: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
    cancelled: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400",
    void: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <a
            href="#invoices"
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <ArrowLeft size={20} />
          </a>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {invoice.invoice_number}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Issued {new Date(invoice.issue_date).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${statusColors[invoice.status] || statusColors.draft}`}>
            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
          </span>

          <div className="relative">
            <button
              onClick={() => setShowActions(!showActions)}
              className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              <MoreVertical size={18} />
            </button>

            {showActions && (
              <div className="absolute right-0 top-full mt-1 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                {invoice.status === "draft" && (
                  <>
                    <button
                      onClick={() => handleAction("send")}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <Send size={14} />
                      Send Invoice
                    </button>
                    <a
                      href={`#create-invoice?edit=${invoice.id}`}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <Edit size={14} />
                      Edit
                    </a>
                  </>
                )}
                {invoice.status === "sent" && (
                  <button
                    onClick={() => handleAction("mark_paid")}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <CheckCircle size={14} />
                    Mark as Paid
                  </button>
                )}
                {(invoice.status === "draft" || invoice.status === "sent") && (
                  <button
                    onClick={() => handleAction("void")}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                  >
                    <Trash2 size={14} />
                    Void Invoice
                  </button>
                )}
                <button
                  onClick={() => handleAction("duplicate")}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Copy size={14} />
                  Duplicate
                </button>
                <button
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Download size={14} />
                  Download PDF
                </button>
                <button
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Printer size={14} />
                  Print
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            ×
          </button>
        </div>
      )}

      {/* Invoice Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer & Dates */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Bill To</h4>
                <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                  {invoice.customer?.company_name || "N/A"}
                </p>
                {invoice.customer?.contact_name && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {invoice.customer.contact_name}
                  </p>
                )}
                {invoice.customer?.email && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {invoice.customer.email}
                  </p>
                )}
                {invoice.customer?.phone && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {invoice.customer.phone}
                  </p>
                )}
                {invoice.customer?.billing_address && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">
                    {invoice.customer.billing_address}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">Issue Date</span>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {new Date(invoice.issue_date).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">Due Date</span>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {new Date(invoice.due_date).toLocaleDateString()}
                  </p>
                </div>
                {invoice.po_number && (
                  <div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">PO Number</span>
                    <p className="font-medium text-gray-900 dark:text-white">{invoice.po_number}</p>
                  </div>
                )}
                {invoice.payment_terms_display && (
                  <div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">Payment Terms</span>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {invoice.payment_terms_display}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <h4 className="mb-4 text-sm font-medium text-gray-500 dark:text-gray-400">Line Items</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800">
                    <th className="pb-2 text-left font-medium text-gray-500 dark:text-gray-400">Item</th>
                    <th className="pb-2 text-center font-medium text-gray-500 dark:text-gray-400">Qty</th>
                    <th className="pb-2 text-right font-medium text-gray-500 dark:text-gray-400">Unit Price</th>
                    <th className="pb-2 text-right font-medium text-gray-500 dark:text-gray-400">Discount</th>
                    <th className="pb-2 text-right font-medium text-gray-500 dark:text-gray-400">Tax</th>
                    <th className="pb-2 text-right font-medium text-gray-500 dark:text-gray-400">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {invoice.items?.map((item: any) => (
                    <tr key={item.id}>
                      <td className="py-3">
                        <p className="font-medium text-gray-900 dark:text-white">{item.description}</p>
                        {item.product?.name && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">{item.product.name}</p>
                        )}
                      </td>
                      <td className="py-3 text-center text-gray-600 dark:text-gray-400">{item.quantity}</td>
                      <td className="py-3 text-right text-gray-600 dark:text-gray-400">
                        {invoice.currency} {item.unit_price.toFixed(2)}
                      </td>
                      <td className="py-3 text-right text-gray-600 dark:text-gray-400">
                        {item.discount_amount > 0 ? `${invoice.currency} ${item.discount_amount.toFixed(2)}` : "-"}
                      </td>
                      <td className="py-3 text-right text-gray-600 dark:text-gray-400">
                        {item.tax_amount > 0 ? `${invoice.currency} ${item.tax_amount.toFixed(2)}` : "-"}
                      </td>
                      <td className="py-3 text-right font-medium text-gray-900 dark:text-white">
                        {invoice.currency} {item.line_total.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {invoice.notes && (
              <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">
                <p className="text-sm text-gray-500 dark:text-gray-400">Notes</p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{invoice.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Summary */}
        <div className="space-y-6">
          {/* Totals */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <h4 className="mb-4 text-sm font-medium text-gray-500 dark:text-gray-400">Summary</h4>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {invoice.currency} {invoice.subtotal.toFixed(2)}
                </span>
              </div>
              {invoice.discount_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Discount</span>
                  <span className="font-medium text-red-500">
                    -{invoice.currency} {invoice.discount_amount.toFixed(2)}
                  </span>
                </div>
              )}
              {invoice.tax_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Tax</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {invoice.currency} {invoice.tax_amount.toFixed(2)}
                  </span>
                </div>
              )}
              {invoice.shipping_cost > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Shipping</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {invoice.currency} {invoice.shipping_cost.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-2 dark:border-gray-800">
                <div className="flex justify-between text-lg font-bold">
                  <span className="text-gray-900 dark:text-white">Total</span>
                  <span className="text-gray-900 dark:text-white">
                    {invoice.currency} {invoice.total_amount.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Status */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <h4 className="mb-4 text-sm font-medium text-gray-500 dark:text-gray-400">Payment Status</h4>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Amount Paid</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {invoice.currency} {invoice.amount_paid.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Amount Due</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {invoice.currency} {invoice.amount_due.toFixed(2)}
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{
                    width: `${invoice.total_amount > 0 ? (invoice.amount_paid / invoice.total_amount) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                {invoice.total_amount > 0
                  ? `${((invoice.amount_paid / invoice.total_amount) * 100).toFixed(0)}% paid`
                  : "0% paid"}
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          {invoice.status === "sent" && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
              <button
                onClick={() => handleAction("mark_paid")}
                disabled={actionLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle size={18} />
                Mark as Paid
              </button>
            </div>
          )}

          {invoice.status === "draft" && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
              <button
                onClick={() => handleAction("send")}
                disabled={actionLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                <Send size={18} />
                Send Invoice
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}