"use client";

import { useState, useEffect } from "react";
import {
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
  Eye,
  Edit,
  Copy,
  Send,
  Trash2,
  FileText,
  AlertCircle,
  RefreshCw,
  X,
  Filter,
} from "lucide-react";

interface Invoice {
  id: string;
  invoice_number: string;
  customer: { company_name: string; contact_name: string | null };
  issue_date: string;
  due_date: string;
  status: string;
  total_amount: number;
  amount_due: number;
  currency: string;
  created_at: string;
}

type Tab = "all" | "draft" | "sent" | "overdue" | "paid";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "sent", label: "Sent" },
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400",
  pending_approval: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",
  viewed: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400",
  partially_paid: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400",
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
  overdue: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400",
  void: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400",
};

export default function InvoiceList() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [sortField, setSortField] = useState<string>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchInvoices();
  }, [activeTab, sortField, sortOrder]);

  const fetchInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        sort: sortField,
        order: sortOrder,
        limit: "50",
        ...(search && { search }),
        ...(activeTab !== "all" && { status: activeTab }),
      });

      const response = await fetch(`/api/invoices?${params}`);
      if (!response.ok) throw new Error("Failed to fetch invoices");
      const data = await response.json();
      setInvoices(data.invoices || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchInvoices();
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const clearFilters = () => {
    setSearch("");
    setActiveTab("all");
    fetchInvoices();
  };

  const getStatusBadge = (status: string) => (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[status] || STATUS_COLORS.draft}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );

  if (loading && invoices.length === 0) {
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Invoices</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {invoices.length} invoices found
          </p>
        </div>
        <a
          href="#create-invoice"
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          <Plus size={16} />
          New Invoice
        </a>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-800">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? "border-b-2 border-blue-600 text-blue-600 dark:text-blue-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={fetchInvoices}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
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
            placeholder="Search invoices..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Search
        </button>
        {(search || activeTab !== "all") && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
          >
            <X size={16} />
          </button>
        )}
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
          <FileText className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            No invoices found
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {activeTab === "all" ? "Create your first invoice" : `No ${activeTab} invoices`}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
                <th
                  className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  onClick={() => handleSort("invoice_number")}
                >
                  <div className="flex items-center gap-1">
                    Invoice
                    {sortField === "invoice_number" && (sortOrder === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                  </div>
                </th>
                <th
                  className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  onClick={() => handleSort("customer")}
                >
                  Customer
                </th>
                <th
                  className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  onClick={() => handleSort("issue_date")}
                >
                  <div className="flex items-center gap-1">
                    Date
                    {sortField === "issue_date" && (sortOrder === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                  </div>
                </th>
                <th
                  className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  onClick={() => handleSort("due_date")}
                >
                  <div className="flex items-center gap-1">
                    Due
                    {sortField === "due_date" && (sortOrder === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                  </div>
                </th>
                <th
                  className="cursor-pointer px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  onClick={() => handleSort("total_amount")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Amount
                    {sortField === "total_amount" && (sortOrder === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                  </div>
                </th>
                <th
                  className="cursor-pointer px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  onClick={() => handleSort("amount_due")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Due
                    {sortField === "amount_due" && (sortOrder === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Status
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
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {new Date(invoice.issue_date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {new Date(invoice.due_date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                    {invoice.currency || "KES"} {invoice.total_amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                    {invoice.currency || "KES"} {invoice.amount_due.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(invoice.status)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={`#invoice-detail?id=${invoice.id}`}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                        title="View"
                      >
                        <Eye size={16} />
                      </a>
                      {invoice.status === "draft" && (
                        <>
                          <a
                            href={`#create-invoice?edit=${invoice.id}`}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </a>
                          <button
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                            title="Duplicate"
                          >
                            <Copy size={16} />
                          </button>
                        </>
                      )}
                      {invoice.status === "sent" && (
                        <button
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                          title="Send"
                        >
                          <Send size={16} />
                        </button>
                      )}
                      {invoice.status !== "paid" && invoice.status !== "cancelled" && invoice.status !== "void" && (
                        <button
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
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