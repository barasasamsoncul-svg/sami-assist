"use client";

import { useState, useEffect } from "react";
import {
  DollarSign,
  FileText,
  Clock,
  Users,
  AlertCircle,
  RefreshCw,
  Plus,
  TrendingUp,
  TrendingDown,
  Eye,
  Calendar,
} from "lucide-react";

interface Stats {
  total_invoices: number;
  draft_invoices: number;
  sent_invoices: number;
  partially_paid_invoices: number;
  paid_invoices: number;
  overdue_invoices: number;
  total_invoiced: number;
  total_collected: number;
  total_outstanding: number;
  collection_rate: number;
  unique_customers: number;
  overdue_count: number;
  overdue_amount: number;
}

interface RecentInvoice {
  id: string;
  invoice_number: string;
  customer: { company_name: string };
  total_amount: number;
  status: string;
  issue_date: string;
  due_date: string;
}

export default function InvoiceOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, invoicesRes] = await Promise.all([
        fetch("/api/invoices/stats"),
        fetch("/api/invoices?limit=5&sort=created_at&order=desc"),
      ]);

      if (!statsRes.ok || !invoicesRes.ok) throw new Error("Failed to fetch data");

      const statsData = await statsRes.json();
      const invoicesData = await invoicesRes.json();

      setStats(statsData.stats);
      setRecentInvoices(invoicesData.invoices || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
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

  const statCards = [
    {
      title: "Total Invoiced",
      value: `KES ${(stats?.total_invoiced || 0).toLocaleString()}`,
      subtitle: `${stats?.collection_rate || 0}% collected`,
      icon: DollarSign,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-500/10",
    },
    {
      title: "Outstanding",
      value: `KES ${(stats?.total_outstanding || 0).toLocaleString()}`,
      subtitle: `${stats?.overdue_count || 0} overdue`,
      icon: Clock,
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-50 dark:bg-orange-500/10",
    },
    {
      title: "Total Invoices",
      value: stats?.total_invoices || 0,
      subtitle: `${stats?.paid_invoices || 0} paid`,
      icon: FileText,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-500/10",
    },
    {
      title: "Active Customers",
      value: stats?.unique_customers || 0,
      subtitle: "with outstanding balances",
      icon: Users,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-50 dark:bg-purple-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Invoice Overview
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Summary of your invoicing activity
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchData}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          <a
            href="#create-invoice"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            <Plus size={16} />
            New Invoice
          </a>
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

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {stat.title}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {stat.subtitle}
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

      {/* Recent Invoices */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Recent Invoices
          </h3>
          <a href="#invoices" className="text-sm font-medium text-blue-600 hover:text-blue-700">
            View all →
          </a>
        </div>
        {recentInvoices.length === 0 ? (
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            No recent invoices
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="pb-2 text-left font-medium text-gray-500 dark:text-gray-400">
                    Invoice
                  </th>
                  <th className="pb-2 text-left font-medium text-gray-500 dark:text-gray-400">
                    Customer
                  </th>
                  <th className="pb-2 text-left font-medium text-gray-500 dark:text-gray-400">
                    Date
                  </th>
                  <th className="pb-2 text-right font-medium text-gray-500 dark:text-gray-400">
                    Amount
                  </th>
                  <th className="pb-2 text-right font-medium text-gray-500 dark:text-gray-400">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
                  >
                    <td className="py-3 font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
                      <a href={`#invoice-detail?id=${invoice.id}`}>{invoice.invoice_number}</a>
                    </td>
                    <td className="py-3 text-gray-600 dark:text-gray-400">
                      {invoice.customer?.company_name || "N/A"}
                    </td>
                    <td className="py-3 text-gray-600 dark:text-gray-400">
                      {new Date(invoice.issue_date).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-right font-medium text-gray-900 dark:text-white">
                      KES {invoice.total_amount.toLocaleString()}
                    </td>
                    <td className="py-3 text-right">
                      <span
                        className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${
                          invoice.status === "paid"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                            : invoice.status === "overdue"
                            ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                            : invoice.status === "sent"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                            : invoice.status === "draft"
                            ? "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400"
                            : invoice.status === "partially_paid"
                            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400"
                            : "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400"
                        }`}
                      >
                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}