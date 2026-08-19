"use client";

import { useState, useEffect } from "react";
import {
  Clock,
  AlertTriangle,
  RefreshCw,
  AlertCircle,
  Search,
  DollarSign,
  Calendar,
  User,
  Send,
  Eye,
  CheckCircle, // Added missing import
} from "lucide-react";

interface OverdueInvoice {
  id: string;
  invoice_number: string;
  customer: { company_name: string };
  issue_date: string;
  due_date: string;
  total_amount: number;
  amount_due: number;
  currency: string;
  days_overdue: number;
}

export default function InvoiceOverdue() {
  const [invoices, setInvoices] = useState<OverdueInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchOverdue();
  }, []);

  const fetchOverdue = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/invoices/overdue?limit=100");
      if (!response.ok) throw new Error("Failed to fetch overdue invoices");
      const data = await response.json();
      setInvoices(data.invoices || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overdue invoices");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOverdue();
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
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-red-600 dark:text-red-400">Overdue Invoices</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {invoices.length} overdue invoices found
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchOverdue}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search overdue invoices..."
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

      {invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-12 text-center">
          <CheckCircle className="h-12 w-12 text-emerald-500" />
          <h3 className="mt-4 text-lg font-medium text-emerald-600 dark:text-emerald-400">
            No overdue invoices!
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            All invoices are up to date
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-red-500/20 bg-white dark:border-red-500/20 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-red-700 dark:text-red-400">
                  Invoice
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-red-700 dark:text-red-400">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-red-700 dark:text-red-400">
                  Due
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-red-700 dark:text-red-400">
                  Total
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-red-700 dark:text-red-400">
                  Due
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-red-700 dark:text-red-400">
                  Days Overdue
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-red-700 dark:text-red-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-100 dark:divide-red-500/10">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-red-50 dark:hover:bg-red-500/5">
                  <td className="px-4 py-3 font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
                    <a href={`#invoice-detail?id=${invoice.id}`}>{invoice.invoice_number}</a>
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">
                    {invoice.customer?.company_name || "N/A"}
                  </td>
                  <td className="px-4 py-3 text-red-600 dark:text-red-400">
                    {new Date(invoice.due_date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                    {invoice.currency || "KES"} {invoice.total_amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-red-600 dark:text-red-400">
                    {invoice.currency || "KES"} {invoice.amount_due.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-500/20 dark:text-red-400">
                      <AlertTriangle size={12} />
                      {invoice.days_overdue || 0} days
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={`#invoice-detail?id=${invoice.id}`}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                        title="View"
                      >
                        <Eye size={16} />
                      </a>
                      <button
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                        title="Send Reminder"
                      >
                        <Send size={16} />
                      </button>
                    </div>
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