"use client";

import {
  ArrowLeft,
  Archive,
  CheckCircle2,
  Edit3,
  Package,
  Trash2,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  unit: string | null;
  unit_price: number;
  tax_rate: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ProductResponse = {
  product?: Product;
  data?: Product;
  error?: string;
};

const money = (value: number) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
  }).format(value || 0);

const date = (value: string) =>
  new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export default function ProductDetailsPage() {
  const params = useParams();
  const router = useRouter();

  const id = Array.isArray(params.id)
    ? params.id[0]
    : params.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [updating, setUpdating] = useState(false);

  const loadProduct = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `/api/products?id=${encodeURIComponent(id)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const result: ProductResponse =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Failed to load product."
        );
      }

      setProduct(result.product || result.data || null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load product."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProduct();
  }, [id]);

  const toggleStatus = async () => {
    if (!product) return;

    try {
      setUpdating(true);
      setError("");

      const response = await fetch("/api/products", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: product.id,
          is_active: !product.is_active,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Failed to update product."
        );
      }

      setProduct((current) =>
        current
          ? {
              ...current,
              is_active: !current.is_active,
            }
          : current
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update product."
      );
    } finally {
      setUpdating(false);
    }
  };

  const deleteProduct = async () => {
    if (!product) return;

    const confirmed = window.confirm(
      `Delete "${product.name}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setDeleting(true);
      setError("");

      const response = await fetch(
        `/api/products?id=${encodeURIComponent(product.id)}`,
        {
          method: "DELETE",
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Failed to delete product."
        );
      }

      router.push("/invoices/products");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to delete product."
      );
      setDeleting(false);
    }
  };

  if (loading) {
    return <LoadingState />;
  }

  if (error || !product) {
    return (
      <main className="min-h-screen bg-[#f7f9fc] px-6 py-10">
        <div className="mx-auto max-w-4xl">
          <button
            type="button"
            onClick={() => router.push("/invoices/products")}
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft size={16} />
            Back to Products & Services
          </button>

          <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <h1 className="font-semibold text-red-900">
              Product not found
            </h1>

            <p className="mt-1 text-sm text-red-700">
              {error || "This product or service could not be found."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const isService =
    product.category?.toLowerCase() === "service" ||
    product.unit?.toLowerCase() === "service";

  return (
    <main className="min-h-screen bg-[#f7f9fc] text-slate-900">
      {/* HEADER */}

      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-6 lg:px-8">
          <button
            type="button"
            onClick={() => router.push("/invoices/products")}
            className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft size={16} />
            Products & Services
          </button>

          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                {isService ? (
                  <Wrench size={25} />
                ) : (
                  <Package size={25} />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-bold tracking-tight">
                    {product.name}
                  </h1>

                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      product.is_active
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {product.is_active
                      ? "Active"
                      : "Inactive"}
                  </span>
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  {isService ? "Service" : "Product"}
                  {product.sku
                    ? ` · SKU ${product.sku}`
                    : ""}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/invoices/products/${product.id}/edit`
                  )
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Edit3 size={16} />
                Edit
              </button>

              <button
                type="button"
                onClick={deleteProduct}
                disabled={deleting}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 size={16} />
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8 lg:px-8">
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* MAIN */}

          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-5">
                <h2 className="font-semibold">
                  Item Information
                </h2>
              </div>

              <div className="grid gap-x-8 gap-y-6 p-6 sm:grid-cols-2">
                <Detail
                  label="Name"
                  value={product.name}
                />

                <Detail
                  label="SKU"
                  value={product.sku || "—"}
                />

                <Detail
                  label="Category"
                  value={product.category || "—"}
                />

                <Detail
                  label="Unit"
                  value={product.unit || "—"}
                />

                <div className="sm:col-span-2">
                  <Detail
                    label="Description"
                    value={
                      product.description ||
                      "No description provided."
                    }
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-5">
                <h2 className="font-semibold">
                  Pricing
                </h2>
              </div>

              <div className="grid gap-6 p-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Unit Price
                  </p>

                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {money(product.unit_price)}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Tax Rate
                  </p>

                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {product.tax_rate || 0}%
                  </p>
                </div>
              </div>
            </section>
          </div>

          {/* SIDE PANEL */}

          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="font-semibold">
                  Status
                </h2>
              </div>

              <div className="p-5">
                <div className="flex items-center gap-3">
                  {product.is_active ? (
                    <CheckCircle2
                      size={20}
                      className="text-emerald-600"
                    />
                  ) : (
                    <Archive
                      size={20}
                      className="text-slate-400"
                    />
                  )}

                  <div>
                    <p className="text-sm font-semibold">
                      {product.is_active
                        ? "Active"
                        : "Inactive"}
                    </p>

                    <p className="text-xs text-slate-500">
                      {product.is_active
                        ? "Available when creating invoices."
                        : "Hidden from normal invoice selection."}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={toggleStatus}
                  disabled={updating}
                  className="mt-5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {updating
                    ? "Updating..."
                    : product.is_active
                      ? "Deactivate"
                      : "Activate"}
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="font-semibold">
                  Record Information
                </h2>
              </div>

              <div className="space-y-5 p-5">
                <Detail
                  label="Created"
                  value={date(product.created_at)}
                />

                <Detail
                  label="Last Updated"
                  value={date(product.updated_at)}
                />

                <Detail
                  label="Item Type"
                  value={isService ? "Service" : "Product"}
                />
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1.5 whitespace-pre-wrap text-sm font-medium text-slate-800">
        {value}
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <main className="min-h-screen bg-[#f7f9fc] px-6 py-10">
      <div className="mx-auto max-w-5xl animate-pulse space-y-6">
        <div className="h-5 w-40 rounded bg-slate-200" />
        <div className="h-20 rounded-2xl bg-white" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="h-72 rounded-2xl bg-white lg:col-span-2" />
          <div className="h-60 rounded-2xl bg-white" />
        </div>
      </div>
    </main>
  );
}