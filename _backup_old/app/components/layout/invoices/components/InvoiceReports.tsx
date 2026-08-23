"use client";

import { useState, useEffect } from "react";
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  FileJson,
  Image,
  RefreshCw,
  AlertCircle,
  Calendar,
  Filter,
  X,
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
  Users,
  CheckCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";

interface ReportStats {
  total_invoices: number;
  total_amount: number;
  average_amount: number;
  paid_count: number;
  paid_amount: number;
  overdue_count: number;
  overdue_amount: number;
  partially_paid_count: number;
  partially_paid_amount: number;
}

export default function InvoiceReports() {
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [format, setFormat] = useState("csv");
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

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

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    setExportSuccess(null);

    try {
      const params = new URLSearchParams({
        format,
        ...(fromDate && { from_date: fromDate }),
        ...(toDate && { to_date: toDate }),
      });

      const response = await fetch(`/api/invoices/export?${params}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to export");
      }

      // Handle file download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const extension = format === "csv" ? "csv" : format === "json" ? "json" : "xlsx";
      a.download = `invoices_${new Date().toISOString().slice(0, 10)}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setExportSuccess(`Exported ${stats?.total_invoices || 0} invoices as ${format.toUpperCase()}`);
      setTimeout(() => setExportSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const formatOptions = [
    { value: "csv", label: "CSV", icon: FileSpreadsheet },
    { value: "json", label: "JSON", icon: FileJson },
    { value: "xlsx", label: "Excel", icon: FileSpreadsheet },
    { value: "image", label: "Image", icon: Image },
  ];

  const statsCards = [
    {
      label: "Total Invoices",
      value: stats?.total_invoices || 0,
      icon: FileText,
      color: "text-blue-600",
      bg: "bg-blue-50 dark:bg-blue-500/10",
    },
    {
      label: "Total Amount",
      value: `KES ${(stats?.total_amount || 0).toLocaleString()}`,
      icon: DollarSign,
      color: "text-emerald-600",
      bg: "bg-emerald-50 dark:bg-emerald-500/10",
    },
    {
      label: "Average Invoice",
      value: `KES ${(stats?.average_amount || 0).toLocaleString()}`,
      icon: BarChart3,
      color: "text-purple-600",
      bg: "bg-purple-50 dark:bg-purple-500/10",
    },
    {
      label: "Paid",
      value: `${stats?.paid_count || 0} (KES ${(stats?.paid_amount || 0).toLocaleString()})`,
      icon: CheckCircle,
      color: "text-emerald-600",
      bg: "bg-emerald-50 dark:bg-emerald-500/10",
    },
    {
      label: "Overdue",
      value: `${stats?.overdue_count || 0} (KES ${(stats?.overdue_amount || 0).toLocaleString()})`,
      icon: AlertTriangle,
      color: "text-red-600",
      bg: "bg-red-50 dark:bg-red-500/10",
    },
    {
      label: "Partially Paid",
      value: `${stats?.partially_paid_count || 0} (KES ${(stats?.partially_paid_amount || 0).toLocaleString()})`,
      icon: Clock,
      color: "text-yellow-600",
      bg: "bg-yellow-50 dark:bg-yellow-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Reports & Export</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Analyze your invoicing data and export reports
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

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            ×
          </button>
        </div>
      )}

      {exportSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">
          <CheckCircle size={16} />
          <span>{exportSuccess}</span>
          <button onClick={() => setExportSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-600">
            ×
          </button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statsCards.map((stat, index) => {
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
                  <p className="mt-2 text-lg font-bold text-gray-900 dark:text-white">
                    {stat.value}
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

      {/* Export Section */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Export Invoices
        </h3>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Date Range
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">From</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">To</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Export Format
              </label>
              <div className="flex flex-wrap gap-3">
                {formatOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFormat(option.value)}
                      className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition ${
                        format === option.value
                          ? "border-blue-600 bg-blue-50 text-blue-600 dark:border-blue-500 dark:bg-blue-500/10 dark:text-blue-400"
                          : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      }`}
                    >
                      <Icon size={16} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-end gap-4">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              <Download size={18} />
              {exporting ? "Exporting..." : `Export as ${format.toUpperCase()}`}
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {stats?.total_invoices || 0} invoices will be exported
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h4 className="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">Status Distribution</h4>
          <div className="space-y-2">
            {[
              { label: "Paid", value: stats?.paid_count || 0, color: "bg-emerald-500" },
              { label: "Overdue", value: stats?.overdue_count || 0, color: "bg-red-500" },
              { label: "Partially Paid", value: stats?.partially_paid_count || 0, color: "bg-yellow-500" },
            ].map((item) => {
              const total = (stats?.paid_count || 0) + (stats?.overdue_count || 0) + (stats?.partially_paid_count || 0) || 1;
              const percentage = (item.value / total) * 100;
              return (
                <div key={item.label}>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">{item.label}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{item.value}</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className={`h-full rounded-full ${item.color}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h4 className="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">Financial Summary</h4>
          <div className="space-y-2">
            <div className="flex justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
              <span className="text-sm text-gray-600 dark:text-gray-400">Total Invoiced</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                KES {(stats?.total_amount || 0).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
              <span className="text-sm text-gray-600 dark:text-gray-400">Total Paid</span>
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                KES {(stats?.paid_amount || 0).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
              <span className="text-sm text-gray-600 dark:text-gray-400">Total Overdue</span>
              <span className="text-sm font-medium text-red-600 dark:text-red-400">
                KES {(stats?.overdue_amount || 0).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Average Invoice</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                KES {(stats?.average_amount || 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}