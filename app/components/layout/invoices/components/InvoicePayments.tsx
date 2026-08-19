"use client";

import { useState, useEffect } from "react";
import {
  CreditCard,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Banknote,
  Wallet,
  Phone,
  Building2,
  Plus,
  Eye,
  Filter,
  FileText, // Added missing import
} from "lucide-react";

interface Payment {
  id: string;
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  amount: number;
  currency: string;
  payment_method: string;
  transaction_reference: string | null;
  payment_date: string;
  status: string;
  reconciled: boolean;
  notes: string | null;
}

const PAYMENT_METHOD_ICONS: Record<string, any> = {
  cash: Banknote,
  bank_transfer: Building2,
  credit_card: CreditCard,
  debit_card: CreditCard,
  mobile_money: Phone,
  cheque: FileText,
  paypal: Wallet,
  stripe: CreditCard,
  mpesa: Phone,
  other: CreditCard,
};

export default function InvoicePayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reconciledFilter, setReconciledFilter] = useState("all");

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/invoices/payments?limit=100");
      if (!response.ok) throw new Error("Failed to fetch payments");
      const data = await response.json();
      setPayments(data.payments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPayments();
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400",
      completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
      failed: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
      refunded: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400",
      disputed: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400",
    };
    return (
      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${colors[status as keyof typeof colors] || colors.pending}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getMethodIcon = (method: string) => {
    const Icon = PAYMENT_METHOD_ICONS[method] || CreditCard;
    return <Icon size={16} className="text-gray-400" />;
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Payments</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {payments.length} payments found
          </p>
        </div>
        <button
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          <Plus size={16} />
          Record Payment
        </button>
      </div>

      {/* Search & Filters */}
      <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search payments..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
          <option value="disputed">Disputed</option>
        </select>
        <select
          value={reconciledFilter}
          onChange={(e) => setReconciledFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        >
          <option value="all">All Reconciliation</option>
          <option value="true">Reconciled</option>
          <option value="false">Unreconciled</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Search
        </button>
        <button
          type="button"
          onClick={fetchPayments}
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

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Total Payments", value: payments.length, color: "text-blue-600" },
          { label: "Completed", value: payments.filter(p => p.status === "completed").length, color: "text-emerald-600" },
          { label: "Pending", value: payments.filter(p => p.status === "pending").length, color: "text-yellow-600" },
          { label: "Reconciled", value: payments.filter(p => p.reconciled).length, color: "text-purple-600" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Payments Table */}
      {payments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-12 dark:border-gray-800 dark:bg-gray-900">
          <CreditCard className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No payments found</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Record your first payment
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
                  Method
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
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Reconciled
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {payments.map((payment) => (
                <tr key={payment.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
                    <a href={`#invoice-detail?id=${payment.invoice_id}`}>
                      {payment.invoice_number}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">
                    {payment.customer_name}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {getMethodIcon(payment.payment_method)}
                      <span className="text-gray-600 dark:text-gray-400">
                        {payment.payment_method.replace("_", " ").toUpperCase()}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {new Date(payment.payment_date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                    {payment.currency} {payment.amount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(payment.status)}</td>
                  <td className="px-4 py-3 text-center">
                    {payment.reconciled ? (
                      <CheckCircle size={16} className="mx-auto text-emerald-500" />
                    ) : (
                      <XCircle size={16} className="mx-auto text-gray-300" />
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