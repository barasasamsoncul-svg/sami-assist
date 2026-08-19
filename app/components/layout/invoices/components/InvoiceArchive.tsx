"use client";

import { useState, useEffect } from "react";
import {
  Archive,
  Search,
  RefreshCw,
  AlertCircle,
  Clock,
  DollarSign,
  User,
  Calendar,
  X,
  CheckCircle,
  Trash2,
  RotateCcw,
} from "lucide-react";

interface ArchivedInvoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  issue_date: string;
  due_date: string;
  status: string;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  archived_at: string;
  archived_by: string | null;
}

export default function InvoiceArchive() {
  const [invoices, setInvoices] = useState<ArchivedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchArchivedInvoices();
  }, []);

  const fetchArchivedInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/invoices/archive");
      if (!response.ok) throw new Error("Failed to fetch archived invoices");
      const data = await response.json();
      setInvoices(data.archived_invoices || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load archived invoices");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchArchivedInvoices();
  };

  const handleRestore = async (id: string) => {
    if (!confirm("Are you sure you want to restore this invoice?")) return;

    try {
      // Note: You'd need a restore endpoint
      // For now, we'll just refresh the list
      fetchArchivedInvoices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore invoice");
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
      cancelled: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400",
      void: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400",
    };
    return (
      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${colors[status as keyof typeof colors] || colors.cancelled}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Invoice Archive</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {invoices.length} archived invoices found
          </p>
        </div>
        <button
          onClick={fetchArchivedInvoices}
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search archived invoices..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Search
        </button>
      </form>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            ×
          </button>
        </div>
      )}

      {/* Table */}
      {invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-12 dark:border-gray-800 dark:bg-gray-900">
          <Archive className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No archived invoices</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Archived invoices will appear here
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Invoice
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Date
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Archived
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                    {invoice.invoice_number}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {invoice.customer_id}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {new Date(invoice.issue_date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                    {invoice.currency || "KES"} {invoice.total_amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(invoice.status)}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {new Date(invoice.archived_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRestore(invoice.id)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10"
                      title="Restore"
                    >
                      <RotateCcw size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}