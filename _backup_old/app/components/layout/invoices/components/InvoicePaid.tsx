"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle,
  RefreshCw,
  AlertCircle,
  Search,
  DollarSign,
  Calendar,
  User,
  Eye,
  Download,
} from "lucide-react";

interface PaidInvoice {
  id: string;
  invoice_number: string;
  customer: { company_name: string };
  issue_date: string;
  payment_date: string;
  total_amount: number;
  currency: string;
}

export default function InvoicePaid() {
  const [invoices, setInvoices] = useState<PaidInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchPaid();
  }, []);

  const fetchPaid = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/invoices?status=paid&limit=100");
      if (!response.ok) throw new Error("Failed to fetch paid invoices");
      const data = await response.json();
      setInvoices(data.invoices || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load paid invoices");
    } finally {
      setLoading(false);
    }
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
          <h2 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">Paid Invoices</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {invoices.length} paid invoices found
          </p>
        </div>
        <button
          onClick={fetchPaid}
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-12 dark:border-gray-800 dark:bg-gray-900">
          <CheckCircle className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No paid invoices</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Paid invoices will appear here
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
                  Paid Date
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Amount
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
                    <a href={`#invoice-detail?id=${invoice.id}`}>{invoice.invoice_number}</a>
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">
                    {invoice.customer?.company_name || "N/A"}
                  </td>
                  <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400">
                    {invoice.payment_date ? new Date(invoice.payment_date).toLocaleDateString() : "N/A"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                    {invoice.currency || "KES"} {invoice.total_amount.toLocaleString()}
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
                        title="Download PDF"
                      >
                        <Download size={16} />
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