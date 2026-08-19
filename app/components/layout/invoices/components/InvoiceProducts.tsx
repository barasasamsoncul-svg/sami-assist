"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  RefreshCw,
  AlertCircle,
  X,
  Package,
  DollarSign,
  Tag,
  Percent,
  Eye,
} from "lucide-react";

interface Product {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  unit_price: number;
  tax_rate_id: string | null;
  category: string | null;
  is_active: boolean;
  usage_count: number;
  tax_rate_name?: string;
  tax_rate?: number;
}

interface TaxRate {
  id: string;
  name: string;
  rate: number;
}

export default function InvoiceProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    sku: "",
    unit_price: "",
    tax_rate_id: "",
    category: "",
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [productsRes, taxRatesRes] = await Promise.all([
        fetch("/api/invoices/products?limit=100"),
        fetch("/api/invoices/tax-rates?limit=100"),
      ]);

      if (!productsRes.ok) throw new Error("Failed to fetch products");
      const productsData = await productsRes.json();
      setProducts(productsData.products || []);

      if (taxRatesRes.ok) {
        const taxData = await taxRatesRes.json();
        setTaxRates(taxData.tax_rates || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormData({
      name: "",
      description: "",
      sku: "",
      unit_price: "",
      tax_rate_id: "",
      category: "",
      is_active: true,
    });
    setShowModal(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || "",
      sku: product.sku || "",
      unit_price: product.unit_price.toString(),
      tax_rate_id: product.tax_rate_id || "",
      category: product.category || "",
      is_active: product.is_active,
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
        unit_price: parseFloat(formData.unit_price) || 0,
        tax_rate_id: formData.tax_rate_id || null,
        is_active: formData.is_active,
      };

      const url = editingProduct
        ? `/api/invoices/products/${editingProduct.id}`
        : "/api/invoices/products";
      const method = editingProduct ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save product");
      }

      setShowModal(false);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;

    try {
      const response = await fetch(`/api/invoices/products/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete product");
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete product");
    }
  };

  const handleRestore = async (id: string) => {
    try {
      const response = await fetch(`/api/invoices/products/${id}/restore`, {
        method: "POST",
      });

      if (!response.ok) throw new Error("Failed to restore product");
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore product");
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
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Products & Services</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {products.length} products found
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          <Plus size={16} />
          Add Product
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
            placeholder="Search products..."
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
          onClick={fetchData}
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

      {/* Product Grid */}
      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-12 dark:border-gray-800 dark:bg-gray-900">
          <Package className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No products found</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Add your first product or service
          </p>
          <button
            onClick={openCreateModal}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={16} className="inline mr-2" />
            Add Product
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <div
              key={product.id}
              className={`group rounded-xl border bg-white p-6 transition hover:shadow-md dark:bg-gray-900 ${
                product.is_active ? "border-gray-200 dark:border-gray-800" : "border-gray-300 opacity-60 dark:border-gray-700"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10">
                    <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {product.name}
                    </h3>
                    {product.sku && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        SKU: {product.sku}
                      </p>
                    )}
                  </div>
                </div>
                {!product.is_active && (
                  <span className="text-xs text-gray-500">Inactive</span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Price</p>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    KES {product.unit_price.toFixed(2)}
                  </p>
                </div>
                {product.category && (
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Category</p>
                    <p className="text-gray-700 dark:text-gray-300">{product.category}</p>
                  </div>
                )}
                {product.tax_rate !== undefined && product.tax_rate > 0 && (
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Tax Rate</p>
                    <p className="text-gray-700 dark:text-gray-300">{product.tax_rate}%</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Usage</p>
                  <p className="text-gray-700 dark:text-gray-300">{product.usage_count || 0} times</p>
                </div>
              </div>

              {product.description && (
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                  {product.description}
                </p>
              )}

              <div className="mt-4 flex justify-end gap-1 border-t border-gray-100 pt-4 dark:border-gray-800">
                {!product.is_active && (
                  <button
                    onClick={() => handleRestore(product.id)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                  >
                    Restore
                  </button>
                )}
                <button
                  onClick={() => openEditModal(product)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                  title="Edit"
                >
                  <Edit size={16} />
                </button>
                <button
                  onClick={() => handleDelete(product.id)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Product Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-800">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {editingProduct ? "Edit Product" : "Add Product"}
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
                    Product Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={2}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    SKU
                  </label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Category
                  </label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Unit Price *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">KES</span>
                    <input
                      type="number"
                      value={formData.unit_price}
                      onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
                      required
                      min="0"
                      step="0.01"
                      className="w-full rounded-lg border border-gray-200 bg-white pl-14 pr-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Tax Rate
                  </label>
                  <select
                    value={formData.tax_rate_id}
                    onChange={(e) => setFormData({ ...formData, tax_rate_id: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="">No Tax</option>
                    {taxRates.map((tax) => (
                      <option key={tax.id} value={tax.id}>
                        {tax.name} ({tax.rate}%)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Active (available for use)
                  </label>
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
                  {saving ? "Saving..." : editingProduct ? "Update Product" : "Create Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}