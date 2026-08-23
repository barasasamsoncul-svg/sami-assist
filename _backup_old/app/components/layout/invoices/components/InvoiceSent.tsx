"use client";

import { useState, useEffect } from "react";
import {
  Send,
  Eye,
  CheckCircle,
  RefreshCw,
  AlertCircle,
  Search,
  DollarSign,
  Calendar,
  User,
} from "lucide-react";

interface SentInvoice {
  id: string;
  invoice_number: string;
  customer: { company_name: string };
  issue_date: string;
  due_date: string;
  total_amount: number;
  currency: string;
  sent_at: string;
  viewed_at: string | null;
}

export default function InvoiceSent() {
  const [invoices, setInvoices] = useState<SentInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchSent();
  }, []);

  const fetchSent = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/invoices?status=sent&limit=100");
      if (!response.ok) throw new Error("Failed to fetch sent invoices");
      const data = await response.json();
      setInvoices(data.invoices || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sent invoices");
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Sent Invoices</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {invoices.length} sent invoices found
          </p>
        </div>
        <button
          onClick={fetchSent}
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-12 dark:border-gray-800 dark:bg-gray-900">
          <Send className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No sent invoices</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Invoices you send will appear here
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
                  Due
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Amount
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Viewed
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
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {new Date(invoice.due_date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                    {invoice.currency || "KES"} {invoice.total_amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {invoice.viewed_at ? (
                      <CheckCircle size={16} className="mx-auto text-emerald-500" />
                    ) : (
                      <span className="text-xs text-gray-400">Not viewed</span>
                    )}
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