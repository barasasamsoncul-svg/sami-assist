"use client";

import { useState, useEffect } from "react";
import {
  Repeat,
  Plus,
  Search,
  RefreshCw,
  AlertCircle,
  Calendar,
  DollarSign,
  User,
  Eye,
  Edit,
  Trash2,
  Play,
  Pause,
  X,
} from "lucide-react";

interface RecurringInvoice {
  id: string;
  customer_id: string;
  customer_name: string;
  frequency: string;
  interval_value: number;
  start_date: string;
  end_date: string | null;
  next_issue_date: string;
  last_issue_date: string | null;
  currency: string;
  total_amount_generated: number;
  total_generated: number;
  status: "active" | "paused" | "completed" | "cancelled";
  notes: string | null;
}

export default function InvoiceRecurring() {
  const [recurring, setRecurring] = useState<RecurringInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchRecurring();
  }, []);

  const fetchRecurring = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/invoices/recurring?limit=100");
      if (!response.ok) throw new Error("Failed to fetch recurring invoices");
      const data = await response.json();
      setRecurring(data.recurringInvoices || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recurring invoices");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRecurring();
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
      paused: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400",
      completed: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",
      cancelled: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400",
    };
    return (
      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${colors[status as keyof typeof colors] || colors.active}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getFrequencyLabel = (frequency: string, interval: number) => {
    const labels: Record<string, string> = {
      daily: interval === 1 ? "Daily" : `Every ${interval} days`,
      weekly: interval === 1 ? "Weekly" : `Every ${interval} weeks`,
      biweekly: interval === 1 ? "Bi-weekly" : `Every ${interval} weeks`,
      monthly: interval === 1 ? "Monthly" : `Every ${interval} months`,
      quarterly: interval === 1 ? "Quarterly" : `Every ${interval} quarters`,
      biannual: interval === 1 ? "Biannual" : `Every ${interval} half-years`,
      yearly: interval === 1 ? "Yearly" : `Every ${interval} years`,
    };
    return labels[frequency] || frequency;
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Recurring Invoices</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {recurring.length} recurring invoices found
          </p>
        </div>
        <button
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          <Plus size={16} />
          Create Recurring
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
            placeholder="Search recurring invoices..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Search
        </button>
        <button
          type="button"
          onClick={fetchRecurring}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
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

      {/* Cards */}
      {recurring.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-12 dark:border-gray-800 dark:bg-gray-900">
          <Repeat className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No recurring invoices</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Create your first recurring invoice
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {recurring.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-gray-200 bg-white p-6 transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {item.customer_name}
                    </h3>
                    {getStatusBadge(item.status)}
                  </div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {getFrequencyLabel(item.frequency, item.interval_value)}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
                    <Eye size={16} />
                  </button>
                  <button className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
                    <Edit size={16} />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Next Issue</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {new Date(item.next_issue_date).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Generated</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {item.total_generated || 0} invoices
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Total Amount</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {item.currency || "KES"} {(item.total_amount_generated || 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Start Date</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {new Date(item.start_date).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {item.notes && (
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                  {item.notes}
                </p>
              )}

              <div className="mt-4 flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
                {item.status === "active" && (
                  <button className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-yellow-600 hover:bg-yellow-50 dark:text-yellow-400 dark:hover:bg-yellow-500/10">
                    <Pause size={14} />
                    Pause
                  </button>
                )}
                {item.status === "paused" && (
                  <button className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10">
                    <Play size={14} />
                    Resume
                  </button>
                )}
                {item.status !== "cancelled" && (
                  <button className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">
                    <Trash2 size={14} />
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}