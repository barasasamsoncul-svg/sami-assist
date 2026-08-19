"use client";

import {
  ArrowLeft,
  Box,
  Check,
  Loader2,
  Save,
  Wrench,
} from "lucide-react";
import { FormEvent, useState } from "react";

export default function NewProductPage() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    sku: "",
    description: "",
    category: "",
    unit: "piece",
    unit_price: "",
    tax_rate: "0",
    is_active: true,
  });

  const updateField = (
    field: keyof typeof form,
    value: string | boolean
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Product or service name is required.");
      return;
    }

    if (!form.unit_price || Number(form.unit_price) < 0) {
      setError("Enter a valid unit price.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const response = await fetch("/api/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name.trim(),
          sku: form.sku.trim() || null,
          description: form.description.trim() || null,
          category: form.category.trim() || null,
          unit: form.unit || "piece",
          unit_price: Number(form.unit_price),
          tax_rate: Number(form.tax_rate || 0),
          is_active: form.is_active,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Failed to create product."
        );
      }

      window.location.href = "/invoices/products";
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create product."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f9fc] text-slate-900">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-6 lg:px-8">
          <a
            href="/invoices/products"
            className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft size={16} />
            Back to Products & Services
          </a>

          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <Box size={23} />
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Add Product or Service
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Add an item that can be used on your invoices.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8 lg:px-8">
        <form onSubmit={submit} className="space-y-6">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* BASIC INFORMATION */}

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="font-semibold">Basic Information</h2>
              <p className="mt-1 text-sm text-slate-500">
                Information that identifies the item.
              </p>
            </div>

            <div className="grid gap-5 p-6 md:grid-cols-2">
              <Field
                label="Name"
                required
                value={form.name}
                onChange={(value) =>
                  updateField("name", value)
                }
                placeholder="e.g. Website Design"
              />

              <Field
                label="SKU"
                value={form.sku}
                onChange={(value) =>
                  updateField("sku", value)
                }
                placeholder="e.g. WEB-001"
              />

              <Field
                label="Category"
                value={form.category}
                onChange={(value) =>
                  updateField("category", value)
                }
                placeholder="e.g. Design"
              />

              <SelectField
                label="Unit"
                value={form.unit}
                onChange={(value) =>
                  updateField("unit", value)
                }
                options={[
                  ["piece", "Piece"],
                  ["hour", "Hour"],
                  ["day", "Day"],
                  ["month", "Month"],
                  ["kg", "Kilogram"],
                  ["litre", "Litre"],
                  ["service", "Service"],
                ]}
              />

              <div className="md:col-span-2">
                <TextAreaField
                  label="Description"
                  value={form.description}
                  onChange={(value) =>
                    updateField("description", value)
                  }
                  placeholder="Describe this product or service..."
                />
              </div>
            </div>
          </section>

          {/* PRICING */}

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="font-semibold">Pricing & Tax</h2>
              <p className="mt-1 text-sm text-slate-500">
                Set the default price and tax rate used on invoices.
              </p>
            </div>

            <div className="grid gap-5 p-6 md:grid-cols-2">
              <Field
                label="Unit Price"
                required
                type="number"
                min="0"
                step="0.01"
                value={form.unit_price}
                onChange={(value) =>
                  updateField("unit_price", value)
                }
                placeholder="0.00"
                prefix="KES"
              />

              <Field
                label="Tax Rate"
                type="number"
                min="0"
                step="0.01"
                value={form.tax_rate}
                onChange={(value) =>
                  updateField("tax_rate", value)
                }
                placeholder="0"
                suffix="%"
              />
            </div>
          </section>

          {/* STATUS */}

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-5 p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                  <Check size={18} />
                </div>

                <div>
                  <h2 className="font-semibold">
                    Active item
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Active items can be selected when creating invoices.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  updateField(
                    "is_active",
                    !form.is_active
                  )
                }
                aria-pressed={form.is_active}
                className={`relative h-7 w-12 rounded-full transition ${
                  form.is_active
                    ? "bg-blue-600"
                    : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                    form.is_active
                      ? "left-6"
                      : "left-1"
                  }`}
                />
              </button>
            </div>
          </section>

          {/* ACTIONS */}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <a
              href="/invoices/products"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </a>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={17} />
                  Save Product
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  type = "text",
  min,
  step,
  prefix,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  min?: string;
  step?: string;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">
        {label}
        {required && (
          <span className="ml-1 text-red-500">*</span>
        )}
      </span>

      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
            {prefix}
          </span>
        )}

        <input
          type={type}
          value={value}
          min={min}
          step={step}
          required={required}
          onChange={(event) =>
            onChange(event.target.value)
          }
          placeholder={placeholder}
          className={`h-11 w-full rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 ${
            prefix ? "pl-12" : "px-3.5"
          } ${suffix ? "pr-10" : "pr-3.5"}`}
        />

        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </span>

      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </span>

      <textarea
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        placeholder={placeholder}
        rows={4}
        className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
      />
    </label>
  );
}