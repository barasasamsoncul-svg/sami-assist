"use client";

import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  Filter,
  MoreHorizontal,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Product = {
  id: string;
  name: string;
  sku?: string | null;
  description?: string | null;
  category?: string | null;
  type?: "product" | "service" | string | null;
  unit?: string | null;
  unit_price: number;
  tax_rate?: number | null;
  tax_id?: string | null;
  currency?: string | null;
  status?: "active" | "inactive" | string | null;
  created_at?: string;
  updated_at?: string;
};

type ProductsResponse = {
  products?: Product[];
  data?: Product[];
  total?: number;
  totalCount?: number;
  count?: number;
};

const PAGE_SIZE = 20;

const TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "product", label: "Products" },
  { value: "service", label: "Services" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

function formatCurrency(
  amount: number,
  currency = "KES"
) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number(amount || 0));
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getTypeLabel(type?: string | null) {
  if (type === "service") return "Service";
  return "Product";
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");

  const [page, setPage] = useState(1);
  const [selectedProduct, setSelectedProduct] =
    useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadProducts = useCallback(
    async (showRefresh = false) => {
      try {
        if (showRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const response = await fetch(
          "/api/products",
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          }
        );

        const data: ProductsResponse & {
          error?: string;
        } = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "Failed to load products."
          );
        }

        const rows = data.products ?? data.data ?? [];

        setProducts(Array.isArray(rows) ? rows : []);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load products."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    setPage(1);
  }, [search, type, status]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesSearch =
        !query ||
        product.name?.toLowerCase().includes(query) ||
        product.sku?.toLowerCase().includes(query) ||
        product.description
          ?.toLowerCase()
          .includes(query) ||
        product.category
          ?.toLowerCase()
          .includes(query);

      const matchesType =
        type === "all" ||
        product.type?.toLowerCase() === type;

      const matchesStatus =
        status === "all" ||
        product.status?.toLowerCase() === status;

      return (
        matchesSearch &&
        matchesType &&
        matchesStatus
      );
    });
  }, [products, search, type, status]);

  const currentProducts = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;

    return filteredProducts.slice(
      start,
      start + PAGE_SIZE
    );
  }, [filteredProducts, page]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / PAGE_SIZE)
  );

  const activeCount = useMemo(
    () =>
      products.filter(
        (product) =>
          !product.status ||
          product.status === "active"
      ).length,
    [products]
  );

  const serviceCount = useMemo(
    () =>
      products.filter(
        (product) =>
          product.type?.toLowerCase() === "service"
      ).length,
    [products]
  );

  const productCount = products.length - serviceCount;

  const clearFilters = () => {
    setSearch("");
    setType("all");
    setStatus("all");
    setPage(1);
  };

  const hasFilters =
    search || type !== "all" || status !== "all";

  const deleteProduct = async () => {
    if (!deleteTarget) return;

    try {
      setDeleting(true);

      const response = await fetch(
        `/api/products/${deleteTarget.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to delete product."
        );
      }

      setProducts((current) =>
        current.filter(
          (product) =>
            product.id !== deleteTarget.id
        )
      );

      setDeleteTarget(null);
      setSelectedProduct(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to delete product."
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-full bg-[#f8fafc] text-slate-900">
      {/* HEADER */}

      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1600px] px-6 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
                <Package size={16} />
                <span>Invoicing</span>
                <ChevronRight size={14} />
                <span>Products & Services</span>
              </div>

              <h1 className="text-2xl font-bold tracking-tight">
                Products & Services
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Manage the products and services you use
                on your invoices.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadProducts(true)}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  size={16}
                  className={
                    refreshing
                      ? "animate-spin"
                      : ""
                  }
                />
                Refresh
              </button>

              <button
                type="button"
                onClick={() =>
                  (window.location.href =
                    "/invoices/products/new")
                }
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                <Plus size={17} />
                Add Product
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1600px] px-6 py-6">
        {/* ERROR */}

        {error && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <div className="flex items-center gap-2">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>

            <button
              type="button"
              onClick={() => loadProducts()}
              className="font-semibold underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* SUMMARY */}

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            title="Total Items"
            value={
              loading
                ? "—"
                : String(products.length)
            }
            icon={<Package size={20} />}
          />

          <SummaryCard
            title="Products"
            value={
              loading
                ? "—"
                : String(productCount)
            }
            icon={<Package size={20} />}
          />

          <SummaryCard
            title="Services"
            value={
              loading
                ? "—"
                : String(serviceCount)
            }
            icon={<Wrench size={20} />}
          />

          <SummaryCard
            title="Active"
            value={
              loading
                ? "—"
                : String(activeCount)
            }
            icon={<Eye size={20} />}
          />
        </div>

        {/* FILTERS */}

        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search products, services, SKU..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="relative">
              <Filter
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <select
                value={type}
                onChange={(event) =>
                  setType(event.target.value)
                }
                className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-9 text-sm outline-none focus:border-blue-500 focus:bg-white sm:w-44"
              >
                {TYPE_OPTIONS.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value)
              }
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:bg-white sm:w-40"
            >
              {STATUS_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>

            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <X size={15} />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* TABLE */}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Item
                  </th>

                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    SKU
                  </th>

                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Type
                  </th>

                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Category
                  </th>

                  <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Unit Price
                  </th>

                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tax
                  </th>

                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>

                  <th className="w-16 px-5 py-4" />
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <LoadingRows />
                ) : currentProducts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-6 py-16 text-center"
                    >
                      <div className="mx-auto flex max-w-sm flex-col items-center">
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                          <Package
                            size={26}
                            className="text-slate-400"
                          />
                        </div>

                        <h3 className="font-semibold text-slate-900">
                          No products or services found
                        </h3>

                        <p className="mt-1 text-sm text-slate-500">
                          {hasFilters
                            ? "Try changing your filters or search."
                            : "Add your first product or service to use it on invoices."}
                        </p>

                        {hasFilters ? (
                          <button
                            type="button"
                            onClick={clearFilters}
                            className="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700"
                          >
                            Clear filters
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              (window.location.href =
                                "/invoices/products/new")
                            }
                            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                          >
                            <Plus size={16} />
                            Add Item
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  currentProducts.map((product) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      onView={() =>
                        setSelectedProduct(product)
                      }
                      onEdit={() =>
                        (window.location.href = `/invoices/products/${product.id}`)
                      }
                      onDelete={() =>
                        setDeleteTarget(product)
                      }
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINATION */}

          {!loading &&
            filteredProducts.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  Showing{" "}
                  <span className="font-medium text-slate-700">
                    {(page - 1) * PAGE_SIZE + 1}
                  </span>{" "}
                  to{" "}
                  <span className="font-medium text-slate-700">
                    {Math.min(
                      page * PAGE_SIZE,
                      filteredProducts.length
                    )}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium text-slate-700">
                    {filteredProducts.length}
                  </span>{" "}
                  items
                </p>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() =>
                      setPage((current) =>
                        Math.max(1, current - 1)
                      )
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft size={17} />
                  </button>

                  {Array.from(
                    { length: totalPages },
                    (_, index) => index + 1
                  )
                    .slice(
                      Math.max(0, page - 3),
                      Math.min(totalPages, page + 2)
                    )
                    .map((pageNumber) => (
                      <button
                        key={pageNumber}
                        type="button"
                        onClick={() =>
                          setPage(pageNumber)
                        }
                        className={`h-9 min-w-9 rounded-lg px-2 text-sm font-medium ${
                          pageNumber === page
                            ? "bg-blue-600 text-white"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {pageNumber}
                      </button>
                    ))}

                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() =>
                      setPage((current) =>
                        Math.min(
                          totalPages,
                          current + 1
                        )
                      )
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
            )}
        </div>
      </main>

      {/* VIEW MODAL */}

      {selectedProduct && (
        <ProductDetailsModal
          product={selectedProduct}
          onClose={() =>
            setSelectedProduct(null)
          }
          onEdit={() =>
            (window.location.href = `/invoices/products/${selectedProduct.id}`)
          }
          onDelete={() => {
            setDeleteTarget(selectedProduct);
            setSelectedProduct(null);
          }}
        />
      )}

      {/* DELETE MODAL */}

      {deleteTarget && (
        <DeleteModal
          product={deleteTarget}
          deleting={deleting}
          onClose={() =>
            deleting ? undefined : setDeleteTarget(null)
          }
          onConfirm={deleteProduct}
        />
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">
          {title}
        </p>

        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          {icon}
        </div>
      </div>

      <p className="text-xl font-bold tracking-tight text-slate-900">
        {value}
      </p>
    </div>
  );
}

function ProductRow({
  product,
  onView,
  onEdit,
  onDelete,
}: {
  product: Product;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isService =
    product.type?.toLowerCase() === "service";

  const isActive =
    !product.status ||
    product.status.toLowerCase() === "active";

  return (
    <tr className="group transition hover:bg-slate-50/70">
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              isService
                ? "bg-purple-50 text-purple-600"
                : "bg-blue-50 text-blue-600"
            }`}
          >
            {isService ? (
              <Wrench size={18} />
            ) : (
              <Package size={18} />
            )}
          </div>

          <div className="min-w-0 max-w-[260px]">
            <button
              type="button"
              onClick={onView}
              className="block truncate text-left text-sm font-semibold text-slate-900 hover:text-blue-600"
            >
              {product.name}
            </button>

            {product.description && (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {product.description}
              </p>
            )}
          </div>
        </div>
      </td>

      <td className="px-5 py-4">
        <span className="font-mono text-xs text-slate-500">
          {product.sku || "—"}
        </span>
      </td>

      <td className="px-5 py-4">
        <span
          className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-medium ${
            isService
              ? "bg-purple-50 text-purple-700"
              : "bg-blue-50 text-blue-700"
          }`}
        >
          {getTypeLabel(product.type)}
        </span>
      </td>

      <td className="px-5 py-4">
        <span className="text-sm text-slate-600">
          {product.category || "—"}
        </span>
      </td>

      <td className="px-5 py-4 text-right">
        <span className="text-sm font-semibold text-slate-900">
          {formatCurrency(
            Number(product.unit_price || 0),
            product.currency || "KES"
          )}
        </span>

        {product.unit && (
          <span className="ml-1 text-xs text-slate-400">
            / {product.unit}
          </span>
        )}
      </td>

      <td className="px-5 py-4">
        <span className="text-sm text-slate-600">
          {product.tax_rate !== null &&
          product.tax_rate !== undefined
            ? `${Number(product.tax_rate).toFixed(2)}%`
            : "—"}
        </span>
      </td>

      <td className="px-5 py-4">
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium ${
            isActive
              ? "text-emerald-600"
              : "text-slate-400"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isActive
                ? "bg-emerald-500"
                : "bg-slate-400"
            }`}
          />
          {isActive ? "Active" : "Inactive"}
        </span>
      </td>

      <td className="px-5 py-4 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={onView}
            title="View"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <Eye size={16} />
          </button>

          <button
            type="button"
            onClick={onEdit}
            title="Edit"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-blue-600"
          >
            <Edit3 size={16} />
          </button>

          <button
            type="button"
            onClick={onDelete}
            title="Delete"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 7 }).map((_, row) => (
        <tr key={row}>
          {Array.from({ length: 8 }).map(
            (_, cell) => (
              <td
                key={cell}
                className="px-5 py-5"
              >
                <div className="h-4 animate-pulse rounded bg-slate-100" />
              </td>
            )
          )}
        </tr>
      ))}
    </>
  );
}

function ProductDetailsModal({
  product,
  onClose,
  onEdit,
  onDelete,
}: {
  product: Product;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              {product.type?.toLowerCase() ===
              "service" ? (
                <Wrench size={19} />
              ) : (
                <Package size={19} />
              )}
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {product.name}
              </h2>

              <p className="text-sm text-slate-500">
                {getTypeLabel(product.type)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div className="rounded-2xl bg-slate-50 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Unit price
            </p>

            <p className="mt-1 text-3xl font-bold text-slate-900">
              {formatCurrency(
                Number(product.unit_price || 0),
                product.currency || "KES"
              )}
            </p>
          </div>

          <DetailRow
            label="SKU"
            value={product.sku || "—"}
          />

          <DetailRow
            label="Category"
            value={product.category || "—"}
          />

          <DetailRow
            label="Unit"
            value={product.unit || "—"}
          />

          <DetailRow
            label="Tax rate"
            value={
              product.tax_rate !== null &&
              product.tax_rate !== undefined
                ? `${Number(product.tax_rate).toFixed(2)}%`
                : "—"
            }
          />

          <DetailRow
            label="Status"
            value={
              !product.status ||
              product.status === "active"
                ? "Active"
                : "Inactive"
            }
          />

          <DetailRow
            label="Created"
            value={formatDate(product.created_at)}
          />

          {product.description && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                Description
              </p>

              <p className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                {product.description}
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            <Trash2 size={16} />
            Delete
          </button>

          <div className="flex-1" />

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Close
          </button>

          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Edit3 size={16} />
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteModal({
  product,
  deleting,
  onClose,
  onConfirm,
}: {
  product: Product;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
          <Trash2 size={21} />
        </div>

        <h2 className="text-lg font-bold text-slate-900">
          Delete item?
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          You are about to delete{" "}
          <span className="font-semibold text-slate-700">
            {product.name}
          </span>
          . This action may affect future invoice
          selections.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting && (
              <RefreshCw
                size={16}
                className="animate-spin"
              />
            )}

            {deleting
              ? "Deleting..."
              : "Delete Item"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-slate-100 pb-4">
      <span className="text-sm text-slate-500">
        {label}
      </span>

      <span className="text-right text-sm font-medium text-slate-900">
        {value}
      </span>
    </div>
  );
}