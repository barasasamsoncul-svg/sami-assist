'use client';

import {
  ChevronDown,
  Package,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';

import {
  useState,
} from 'react';

import type {
  SalesQuoteDetail,
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';

/* -------------------------------------------------------------------------- */
/*  Types & helpers                                                           */
/* -------------------------------------------------------------------------- */

type OptionalDraft = {
  key: string;
  catalogItemId: string;
  description: string;
  sku: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  unitCost: string;
  taxName: string;
  taxRate: string;
};

function draftKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ||
    Math.random().toString(36).slice(2)
  );
}

function blankDraft(): OptionalDraft {
  return {
    key: draftKey(),
    catalogItemId: '',
    description: '',
    sku: '',
    unit: 'unit',
    quantity: '1',
    unitPrice: '0',
    unitCost: '0',
    taxName: '',
    taxRate: '0',
  };
}

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return currency + ' ' + value.toLocaleString();
  }
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function SalesOptionalProductsEditor({
  quote,
  workspace,
  busy,
  onSave,
}: {
  quote: SalesQuoteDetail;
  workspace: SalesWorkspaceData;
  busy: boolean;
  onSave: (items: Array<Record<string, unknown>>) => Promise<boolean>;
}) {
  const [items, setItems] = useState<OptionalDraft[]>(
    quote.optionalItems.map((item) => ({
      key: item.id,
      catalogItemId: item.catalogItemId || '',
      description: item.description,
      sku: item.sku || '',
      unit: item.unit,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      unitCost: String(item.unitCost || 0),
      taxName: item.taxName || '',
      taxRate: String(item.taxRate),
    })),
  );

  function patch(index: number, next: Partial<OptionalDraft>) {
    setItems((current) =>
      current.map((item, position) =>
        position === index ? { ...item, ...next } : item,
      ),
    );
  }

  function chooseCatalog(index: number, id: string) {
    const product = workspace.catalogItems.find((item) => item.id === id);
    if (!product) {
      patch(index, { catalogItemId: '' });
      return;
    }

    patch(index, {
      catalogItemId: product.id,
      description: product.isVariant
        ? product.name
        : product.description || product.name,
      sku: product.sku || '',
      unit: product.unit || 'unit',
      unitPrice: String(product.unitPrice),
      unitCost: String(product.unitCost || 0),
      taxName: product.taxName || '',
      taxRate: String(product.taxRate),
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await onSave(
      items.map((item) => ({
        catalogItemId: item.catalogItemId || undefined,
        description: item.description,
        sku: item.sku || undefined,
        unit: item.unit,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        unitCost: workspace.capabilities.canManageMargin
          ? Number(item.unitCost)
          : undefined,
        taxName: item.taxName || undefined,
        taxRate: Number(item.taxRate),
      })),
    );
  }

  const currency = quote.currency || workspace.company.currency || 'KES';
  const totalOptionalValue = items.reduce(
    (total, item) =>
      total + Number(item.quantity || 0) * Number(item.unitPrice || 0),
    0,
  );

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-black">Optional products</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Add accessories, upgrades or services. These stay outside the
              quotation total until the customer selects them.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setItems((current) => [...current, blankDraft()])}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add option
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* List                                                               */}
      {/* ------------------------------------------------------------------ */}
      {items.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <div
            aria-hidden="true"
            className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
          >
            <Package className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-black">No optional products yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
            Add an accessory, upgrade, or service to offer the customer an
            optional add-on alongside this quotation.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {items.map((item, index) => {
            const lineTotal =
              Number(item.quantity || 0) * Number(item.unitPrice || 0);
            return (
              <li key={item.key} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-white dark:bg-white dark:text-slate-950">
                      {index + 1}
                    </span>
                    <span className="text-xs font-black">Option {index + 1}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setItems((current) =>
                        current.filter((_, position) => position !== index),
                      )
                    }
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                    aria-label={`Remove optional product ${index + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {workspace.capabilities.canUseCatalog &&
                  workspace.catalogItems.length > 0 ? (
                    <label className="block sm:col-span-2 xl:col-span-4">
                      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        Catalogue item
                      </span>
                      <div className="relative mt-1">
                        <select
                          value={item.catalogItemId}
                          onChange={(event) =>
                            chooseCatalog(index, event.target.value)
                          }
                          className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white pr-9 pl-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
                        >
                          <option value="">Custom optional product</option>
                          {workspace.catalogItems.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                              {product.sku ? ` · ${product.sku}` : ''}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          aria-hidden="true"
                          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                        />
                      </div>
                    </label>
                  ) : null}

                  <FieldInput
                    label="Description"
                    value={item.description}
                    onChange={(value) => patch(index, { description: value })}
                    required
                    className="sm:col-span-2 xl:col-span-4"
                  />
                  <FieldInput
                    label="SKU"
                    value={item.sku}
                    onChange={(value) => patch(index, { sku: value })}
                  />
                  <FieldInput
                    label="Unit"
                    value={item.unit}
                    onChange={(value) => patch(index, { unit: value })}
                  />
                  <FieldInput
                    label="Quantity"
                    type="number"
                    step="0.01"
                    value={item.quantity}
                    onChange={(value) => patch(index, { quantity: value })}
                  />
                  <FieldInput
                    label="Unit price"
                    type="number"
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(value) => patch(index, { unitPrice: value })}
                    suffix={currency}
                  />

                  {workspace.capabilities.canManageMargin ? (
                    <FieldInput
                      label="Unit cost"
                      type="number"
                      step="0.01"
                      value={item.unitCost}
                      onChange={(value) => patch(index, { unitCost: value })}
                      suffix={currency}
                    />
                  ) : null}

                  <FieldInput
                    label="Tax name"
                    value={item.taxName}
                    onChange={(value) => patch(index, { taxName: value })}
                  />
                  <FieldInput
                    label="Tax rate"
                    type="number"
                    step="0.01"
                    value={item.taxRate}
                    onChange={(value) => patch(index, { taxRate: value })}
                    suffix="%"
                  />
                </div>

                <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-black text-slate-700 dark:text-slate-200">
                  <Sparkles className="h-3 w-3 text-indigo-500" aria-hidden="true" />
                  Line preview · {formatMoney(lineTotal, currency)}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Footer                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {items.length > 0
            ? `Potential upsell value · ${formatMoney(totalOptionalValue, currency)}`
            : 'No optional value yet.'}
        </p>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          Save optional products
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Field                                                                     */
/* -------------------------------------------------------------------------- */

function FieldInput({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  step,
  suffix,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  step?: string;
  suffix?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <div className="relative mt-1">
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          min={type === 'number' ? '0' : undefined}
          step={type === 'number' ? step ?? '0.01' : undefined}
          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 pr-12 text-sm tabular-nums focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">
            {suffix}
          </span>
        ) : null}
      </div>
    </label>
  );
}