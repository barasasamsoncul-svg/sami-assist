"use client";

import { useState, useEffect } from "react";
import {
  Percent,
  Plus,
  Search,
  RefreshCw,
  AlertCircle,
  Edit,
  Trash2,
  X,
  CheckCircle,
  Globe,
  MapPin,
  Star,
} from "lucide-react";

interface TaxRate {
  id: string;
  name: string;
  rate: number;
  tax_type: string;
  country: string | null;
  region: string | null;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export default function InvoiceTaxRates() {
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingTax, setEditingTax] = useState<TaxRate | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    rate: "",
    tax_type: "vat",
    country: "",
    region: "",
    is_default: false,
    is_active: true,
    sort_order: 0,
  });

  useEffect(() => {
    fetchTaxRates();
  }, []);

  const fetchTaxRates = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/invoices/tax-rates?limit=100");
      if (!response.ok) throw new Error("Failed to fetch tax rates");
      const data = await response.json();
      setTaxRates(data.tax_rates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tax rates");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTaxRates();
  };

  const openCreateModal = () => {
    setEditingTax(null);
    setFormData({
      name: "",
      rate: "",
      tax_type: "vat",
      country: "",
      region: "",
      is_default: false,
      is_active: true,
      sort_order: 0,
    });
    setShowModal(true);
  };

  const openEditModal = (tax: TaxRate) => {
    setEditingTax(tax);
    setFormData({
      name: tax.name,
      rate: tax.rate.toString(),
      tax_type: tax.tax_type,
      country: tax.country || "",
      region: tax.region || "",
      is_default: tax.is_default,
      is_active: tax.is_active,
      sort_order: tax.sort_order,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        rate: parseFloat(formData.rate) || 0,
        sort_order: parseInt(formData.sort_order as any) || 0,
      };

      const url = editingTax
        ? `/api/invoices/tax-rates/${editingTax.id}`
        : "/api/invoices/tax-rates";
      const method = editingTax ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save tax rate");
      }

      setShowModal(false);
      fetchTaxRates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save tax rate");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this tax rate?")) return;

    try {
      const response = await fetch(`/api/invoices/tax-rates?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete tax rate");
      fetchTaxRates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tax rate");
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const response = await fetch(`/api/invoices/tax-rates/${id}/default`, {
        method: "POST",
      });

      if (!response.ok) throw new Error("Failed to set default tax rate");
      fetchTaxRates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set default tax rate");
    }
  };

  const getTaxTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      vat: "VAT",
      gst: "GST",
      sales_tax: "Sales Tax",
      withholding: "Withholding",
      none: "No Tax",
      other: "Other",
    };
    return labels[type] || type;
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Tax Rates</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {taxRates.length} tax rates found
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          <Plus size={16} />
          Add Tax Rate
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
            placeholder="Search tax rates..."
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
          onClick={fetchTaxRates}
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
      {taxRates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-12 dark:border-gray-800 dark:bg-gray-900">
          <Percent className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No tax rates found</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Add your first tax rate
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Name
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Rate
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Country
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Default
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {taxRates.map((tax) => (
                <tr key={tax.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                    {tax.name}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-900 dark:text-white">
                    {tax.rate}%
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/20 dark:text-blue-400">
                      {getTaxTypeLabel(tax.tax_type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {tax.country || "-"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {tax.is_default ? (
                      <Star className="mx-auto h-4 w-4 text-yellow-500" />
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      tax.is_active
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                        : "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400"
                    }`}>
                      {tax.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!tax.is_default && tax.is_active && (
                        <button
                          onClick={() => handleSetDefault(tax.id)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-yellow-50 hover:text-yellow-600 dark:hover:bg-yellow-500/10"
                          title="Set as default"
                        >
                          <Star size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => openEditModal(tax)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      {!tax.is_default && (
                        <button
                          onClick={() => handleDelete(tax.id)}
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-800">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {editingTax ? "Edit Tax Rate" : "Add Tax Rate"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Rate (%) *
                  </label>
                  <input
                    type="number"
                    value={formData.rate}
                    onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                    required
                    min="0"
                    max="100"
                    step="0.01"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Tax Type
                  </label>
                  <select
                    value={formData.tax_type}
                    onChange={(e) => setFormData({ ...formData, tax_type: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="vat">VAT</option>
                    <option value="gst">GST</option>
                    <option value="sales_tax">Sales Tax</option>
                    <option value="withholding">Withholding</option>
                    <option value="none">No Tax</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Country
                  </label>
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Region
                  </label>
                  <input
                    type="text"
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                    min="0"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={formData.is_default}
                        onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      Set as default
                    </label>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      Active
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-6 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingTax ? "Update Tax Rate" : "Create Tax Rate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}