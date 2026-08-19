"use client";

import { useState, useEffect } from "react";
import {
  FileText,
  Plus,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  X,
  Calendar,
  DollarSign,
  User,
  Eye,
  Edit,
  Trash2,
} from "lucide-react";

interface CreditNote {
  id: string;
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  credit_note_number: string;
  issue_date: string;
  amount: number;
  tax_amount: number;
  currency: string;
  status: "issued" | "applied" | "void";
  reason: string;
  notes: string | null;
  created_at: string;
}

export default function InvoiceCreditNotes() {
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchCreditNotes();
  }, []);

  const fetchCreditNotes = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/invoices/credit-notes?limit=100");
      if (!response.ok) throw new Error("Failed to fetch credit notes");
      const data = await response.json();
      setCreditNotes(data.creditNotes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load credit notes");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCreditNotes();
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      issued: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400",
      applied: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
      void: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400",
    };
    return (
      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${colors[status as keyof typeof colors] || colors.issued}`}>
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Credit Notes</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {creditNotes.length} credit notes found
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          <Plus size={16} />
          Create Credit Note
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
            placeholder="Search credit notes..."
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
          onClick={fetchCreditNotes}
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

      {/* Table */}
      {creditNotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-12 dark:border-gray-800 dark:bg-gray-900">
          <FileText className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No credit notes found</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Create your first credit note
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Credit Note
                </th>
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
                  Reason
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {creditNotes.map((cn) => (
                <tr key={cn.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
                    {cn.credit_note_number}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {cn.invoice_number}
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">
                    {cn.customer_name}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {new Date(cn.issue_date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                    {cn.currency || "KES"} {cn.amount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(cn.status)}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[150px] truncate">
                    {cn.reason}
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