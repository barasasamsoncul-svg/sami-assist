"use client";

import { useState, useEffect } from "react";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Users,
  RefreshCw,
} from "lucide-react";

interface StatsData {
  total_invoices: number;
  draft_invoices: number;
  sent_invoices: number;
  viewed_invoices: number;
  partially_paid_invoices: number;
  paid_invoices: number;
  overdue_invoices: number;
  cancelled_invoices: number;
  void_invoices: number;
  total_invoiced: number;
  total_collected: number;
  total_outstanding: number;
  collection_rate: number;
  average_invoice_amount: number;
  unique_customers: number;
  overdue_count: number;
  overdue_amount: number;
  // Add missing properties with defaults
  pending_approval_invoices?: number;
  aging_0_30?: number;
  aging_31_60?: number;
  aging_61_90?: number;
  aging_91_plus?: number;
}

export default function InvoiceStats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/invoices/stats");
      if (!response.ok) throw new Error("Failed to fetch stats");
      const data = await response.json();
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
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

  if (error || !stats) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 p-12 text-center">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <h3 className="mt-4 text-lg font-medium text-red-600 dark:text-red-400">
          {error || "No data available"}
        </h3>
        <button
          onClick={fetchStats}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Invoiced",
      value: `KES ${(stats.total_invoiced || 0).toLocaleString()}`,
      change: `${stats.collection_rate || 0}% collected`,
      icon: DollarSign,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-500/10",
    },
    {
      label: "Outstanding",
      value: `KES ${(stats.total_outstanding || 0).toLocaleString()}`,
      change: `${stats.overdue_count || 0} overdue`,
      icon: Clock,
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-50 dark:bg-orange-500/10",
    },
    {
      label: "Total Invoices",
      value: stats.total_invoices || 0,
      change: `${stats.paid_invoices || 0} paid`,
      icon: FileText,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-500/10",
    },
    {
      label: "Active Customers",
      value: stats.unique_customers || 0,
      change: "with outstanding balances",
      icon: Users,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-50 dark:bg-purple-500/10",
    },
  ];

  const statusDistribution = [
    { label: "Draft", count: stats.draft_invoices || 0, color: "bg-gray-500" },
    { label: "Pending Approval", count: stats.pending_approval_invoices || 0, color: "bg-purple-500" },
    { label: "Sent", count: stats.sent_invoices || 0, color: "bg-blue-500" },
    { label: "Viewed", count: stats.viewed_invoices || 0, color: "bg-cyan-500" },
    { label: "Partially Paid", count: stats.partially_paid_invoices || 0, color: "bg-yellow-500" },
    { label: "Paid", count: stats.paid_invoices || 0, color: "bg-emerald-500" },
    { label: "Overdue", count: stats.overdue_invoices || 0, color: "bg-red-500" },
    { label: "Cancelled", count: stats.cancelled_invoices || 0, color: "bg-gray-500" },
    { label: "Void", count: stats.void_invoices || 0, color: "bg-gray-400" },
  ];

  const total = statusDistribution.reduce((sum, s) => sum + s.count, 0);

  const agingBuckets = [
    { label: "Current", value: stats.total_outstanding - (stats.overdue_amount || 0) || 0, color: "text-emerald-600 dark:text-emerald-400" },
    { label: "0-30 Days", value: stats.aging_0_30 || 0, color: "text-yellow-600 dark:text-yellow-400" },
    { label: "31-60 Days", value: stats.aging_31_60 || 0, color: "text-orange-600 dark:text-orange-400" },
    { label: "61-90 Days", value: stats.aging_61_90 || 0, color: "text-red-600 dark:text-red-400" },
    { label: "91+ Days", value: stats.aging_91_plus || 0, color: "text-red-700 dark:text-red-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Invoice Statistics</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Detailed breakdown of your invoicing data
          </p>
        </div>
        <button
          onClick={fetchStats}
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {stat.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {stat.change}
                  </p>
                </div>
                <div className={`rounded-xl p-3 ${stat.bg}`}>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Status Distribution */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Status Distribution
        </h3>
        <div className="space-y-3">
          {statusDistribution.map((status) => {
            const percentage = total > 0 ? (status.count / total) * 100 : 0;
            return (
              <div key={status.label}>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">{status.label}</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {status.count} ({percentage.toFixed(1)}%)
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className={`h-full rounded-full ${status.color}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Financial Summary */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Financial Summary
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
              <span className="text-sm text-gray-600 dark:text-gray-400">Total Invoiced</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                KES {(stats.total_invoiced || 0).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
              <span className="text-sm text-gray-600 dark:text-gray-400">Total Collected</span>
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                KES {(stats.total_collected || 0).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
              <span className="text-sm text-gray-600 dark:text-gray-400">Outstanding</span>
              <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
                KES {(stats.total_outstanding || 0).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
              <span className="text-sm text-gray-600 dark:text-gray-400">Overdue</span>
              <span className="text-sm font-medium text-red-600 dark:text-red-400">
                KES {(stats.overdue_amount || 0).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Average Invoice</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                KES {(stats.average_invoice_amount || 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Aging Summary
          </h3>
          <div className="space-y-3">
            {agingBuckets.map((item) => (
              <div key={item.label} className="flex justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {item.label}
                </span>
                <span className={`text-sm font-medium ${item.color}`}>
                  KES {(item.value || 0).toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex flex-col items-center justify-center">
              <div className="relative h-32 w-32">
                <svg className="h-32 w-32 -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r="16"
                    fill="none"
                    className="stroke-gray-200 dark:stroke-gray-700"
                    strokeWidth="3"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="16"
                    fill="none"
                    className="stroke-emerald-500"
                    strokeWidth="3"
                    strokeDasharray={`${(stats.collection_rate || 0) * 0.5026} 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {(stats.collection_rate || 0).toFixed(1)}%
                  </span>
                </div>
              </div>
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                Collection Rate
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {stats.collection_rate >= 80
                  ? "Excellent! 🎉"
                  : stats.collection_rate >= 50
                  ? "Good"
                  : "Needs improvement"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}