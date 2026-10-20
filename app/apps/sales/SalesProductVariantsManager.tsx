'use client';

import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Info,
  Layers3,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { SalesWorkspaceData } from '@/lib/apps/sales/types';

type CatalogItem = SalesWorkspaceData['catalogItems'][number];
type Attribute = { name: string; value: string };
type Draft = {
  variantId: string;
  baseCatalogItemId: string;
  sku: string;
  unitPrice: string;
  unitCost: string;
  attributesText: string;
};

type DraftError = Partial<Record<'baseCatalogItemId' | 'sku' | 'unitPrice' | 'unitCost' | 'attributes', string>>;

const emptyDraft = (baseCatalogItemId = ''): Draft => ({
  variantId: '',
  baseCatalogItemId,
  sku: '',
  unitPrice: '',
  unitCost: '',
  attributesText: 'Color=\nSize=',
});

function attributesFromText(value: string): Attribute[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf('=');
      if (index <= 0 || index === line.length - 1) {
        throw new Error('Enter each option as Name=Value, for example Color=Blue.');
      }
      return { name: line.slice(0, index).trim(), value: line.slice(index + 1).trim() };
    });
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: currency || 'KES',
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return (currency || 'KES') + ' ' + Number(value || 0).toLocaleString();
  }
}

function draftFromItem(item: CatalogItem, fallbackProductId: string): Draft {
  return {
    variantId: item.variantId || '',
    baseCatalogItemId: item.baseCatalogItemId || fallbackProductId,
    sku: item.sku || '',
    unitPrice: String(item.unitPrice),
    unitCost: String(item.unitCost ?? ''),
    attributesText: (item.variantAttributes || [])
      .map((row) => row.name + '=' + row.value)
      .join('\n'),
  };
}

export default function SalesProductVariantsManager({
  data,
  busy,
  request,
  showSuccess,
  showError,
}: {
  data: SalesWorkspaceData;
  busy: boolean;
  request: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
}) {
  const router = useRouter();

  const products = useMemo(
    () => data.catalogItems.filter((item) => !item.isVariant && item.itemType === 'product'),
    [data.catalogItems],
  );
  const variants = useMemo(
    () => data.catalogItems.filter((item) => item.isVariant),
    [data.catalogItems],
  );

  const [draft, setDraft] = useState<Draft>(() => emptyDraft(products[0]?.id || ''));
  const [draftErrors, setDraftErrors] = useState<DraftError>({});
  const [saving, setSaving] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const editing = Boolean(draft.variantId);
  const canManage = data.capabilities.canManageCatalog;
  const selectedProduct = products.find((item) => item.id === draft.baseCatalogItemId);
  const selectedVariant = variants.find((item) => item.variantId === draft.variantId);

  const visibleVariants = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return variants;
    return variants.filter((item) => {
      const haystack = [
        item.baseProductName || '',
        item.name,
        item.variantLabel || '',
        item.sku || '',
        (item.variantAttributes || [])
          .map((attr) => attr.name + ':' + attr.value)
          .join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(value);
    });
  }, [variants, query]);

  function clearDraft() {
    setDraft(emptyDraft(products[0]?.id || ''));
    setDraftErrors({});
  }

  function editVariant(item: CatalogItem) {
    setDraft(draftFromItem(item, products[0]?.id || ''));
    setDraftErrors({});
  }

  function validate(): DraftError {
    const next: DraftError = {};
    if (!draft.baseCatalogItemId && !editing)
      next.baseCatalogItemId = 'Choose a base product.';
    if (!draft.sku.trim()) next.sku = 'Variant SKU is required.';
    if (!draft.unitPrice.trim()) next.unitPrice = 'Selling price is required.';
    else if (!Number.isFinite(Number(draft.unitPrice)) || Number(draft.unitPrice) < 0)
      next.unitPrice = 'Enter a non-negative number.';
    if (draft.unitCost.trim() && (!Number.isFinite(Number(draft.unitCost)) || Number(draft.unitCost) < 0))
      next.unitCost = 'Enter a non-negative number.';

    try {
      const attributes = attributesFromText(draft.attributesText);
      if (!attributes.length)
        throw new Error('Add at least one variant attribute, such as Color=Blue.');
      if (new Set(attributes.map((item) => item.name.toLowerCase())).size !== attributes.length)
        throw new Error('Attribute names must be unique within a variant.');
    } catch (error) {
      next.attributes =
        error instanceof Error ? error.message : 'Check the variant attributes.';
    }
    return next;
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;

    const errors = validate();
    setDraftErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Check the variant form', 'Please correct the highlighted fields.');
      return;
    }

    const attributes = attributesFromText(draft.attributesText);
    setSaving(true);
    try {
      await request(
        editing
          ? {
              action: 'update_product_variant',
              variantId: draft.variantId,
              sku: draft.sku.trim(),
              unitPrice: Number(draft.unitPrice),
              ...(data.capabilities.canViewMargin ? { unitCost: Number(draft.unitCost || 0) } : {}),
              attributes,
            }
          : {
              action: 'create_product_variant',
              baseCatalogItemId: draft.baseCatalogItemId,
              sku: draft.sku.trim(),
              unitPrice: Number(draft.unitPrice || selectedProduct?.unitPrice || 0),
              ...(data.capabilities.canViewMargin ? { unitCost: Number(draft.unitCost || 0) } : {}),
              attributes,
            },
      );
      showSuccess(
        editing ? 'Variant updated' : 'Variant created',
        'The sellable SKU is saved in the shared catalogue and is available to quotations.',
      );
      clearDraft();
      router.refresh();
    } catch (error) {
      showError(
        'Variant could not be saved',
        error instanceof Error ? error.message : 'SaMi could not save this product variant.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function archiveVariant(item: CatalogItem) {
    if (!item.variantId) return;
    try {
      await request({ action: 'archive_product_variant', variantId: item.variantId });
      showSuccess(
        'Variant archived',
        'The SKU is no longer available for new quotations. Historical documents remain unchanged.',
      );
      setArchiveId(null);
      if (draft.variantId === item.variantId) clearDraft();
      router.refresh();
    } catch (error) {
      showError(
        'Variant could not be archived',
        error instanceof Error ? error.message : 'SaMi could not archive this SKU.',
      );
    }
  }

  return (
    <section className="space-y-4">
      {/* ---------- Header ---------- */}
      <div className="sami-surface rounded-[24px] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-300">
              <Layers3 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                Sellable product SKUs
              </p>
              <h2 className="mt-1 text-xl font-black">Product variants</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
                Define options such as size, colour, capacity or packaging. Each
                combination is its own shared catalogue item with its own SKU and price,
                so quotations and subsequent invoices keep the exact variant sold.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Base products" value={products.length} />
            <Stat label="Variant SKUs" value={variants.length} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        {/* ---------- Editor ---------- */}
        <div className="sami-surface rounded-[24px] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black">
                {editing ? 'Edit product variant' : 'Add variant'}
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {editing
                  ? 'Editing an existing sellable SKU.'
                  : 'Each variant is a new catalogue item.'}
              </p>
            </div>
            {editing ? (
              <button
                type="button"
                onClick={clearDraft}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--sami-border)] px-2.5 text-xs font-bold"
              >
                <X className="h-3.5 w-3.5" /> Cancel edit
              </button>
            ) : null}
          </div>

          {!canManage ? (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-dashed border-[var(--sami-border)] p-4 text-sm text-slate-500 dark:text-slate-400">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Catalogue-management permission is required to create or edit product
                variants.
              </span>
            </div>
          ) : products.length === 0 && !editing ? (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-dashed border-[var(--sami-border)] p-4 text-sm text-slate-500 dark:text-slate-400">
              <Package className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Create a base product first, then add its variant SKUs here.</span>
            </div>
          ) : (
            <form className="mt-4 space-y-4" onSubmit={save} noValidate>
              <label className="block">
                <span className="text-xs font-black">
                  Base product <span className="text-red-500">*</span>
                </span>
                <select
                  value={draft.baseCatalogItemId}
                  disabled={editing || saving || busy}
                  onChange={(event) => {
                    const product = products.find((item) => item.id === event.target.value);
                    setDraft((current) => ({
                      ...current,
                      baseCatalogItemId: event.target.value,
                      unitPrice: product ? String(product.unitPrice) : current.unitPrice,
                    }));
                    if (draftErrors.baseCatalogItemId)
                      setDraftErrors((current) => {
                        const next = { ...current };
                        delete next.baseCatalogItemId;
                        return next;
                      });
                  }}
                  aria-invalid={Boolean(draftErrors.baseCatalogItemId)}
                  className={`mt-1 h-10 w-full rounded-xl border bg-transparent px-3 text-sm ${
                    draftErrors.baseCatalogItemId
                      ? 'border-red-400 ring-1 ring-red-400/40'
                      : 'border-[var(--sami-border)]'
                  }`}
                >
                  {products.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.sku ? ' · ' + item.sku : ''}
                    </option>
                  ))}
                </select>
                {draftErrors.baseCatalogItemId ? (
                  <ErrorText>{draftErrors.baseCatalogItemId}</ErrorText>
                ) : null}
              </label>

              {selectedVariant ? (
                <p className="inline-flex items-start gap-1.5 rounded-lg bg-[var(--sami-surface-soft)] p-2 text-xs text-slate-500 dark:text-slate-400">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Base product:{' '}
                  {selectedVariant.baseProductName || selectedProduct?.name || 'Product'}
                </p>
              ) : null}

              <label className="block">
                <span className="text-xs font-black">
                  Variant attributes <span className="text-red-500">*</span>{' '}
                  <span className="font-normal text-slate-500 dark:text-slate-400">
                    one Name=Value pair per line
                  </span>
                </span>
                <textarea
                  value={draft.attributesText}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, attributesText: event.target.value }));
                    if (draftErrors.attributes)
                      setDraftErrors((current) => {
                        const next = { ...current };
                        delete next.attributes;
                        return next;
                      });
                  }}
                  required
                  rows={4}
                  placeholder={'Color=Blue\nSize=Large'}
                  aria-invalid={Boolean(draftErrors.attributes)}
                  className={`mt-1 w-full rounded-xl border bg-transparent p-3 text-sm ${
                    draftErrors.attributes
                      ? 'border-red-400 ring-1 ring-red-400/40'
                      : 'border-[var(--sami-border)]'
                  }`}
                />
                {draftErrors.attributes ? (
                  <ErrorText>{draftErrors.attributes}</ErrorText>
                ) : (
                  <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">
                    Attribute names must be unique within a variant.
                  </span>
                )}
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-black">
                    Unique SKU <span className="text-red-500">*</span>
                  </span>
                  <input
                    value={draft.sku}
                    onChange={(event) => {
                      setDraft((current) => ({ ...current, sku: event.target.value }));
                      if (draftErrors.sku)
                        setDraftErrors((current) => {
                          const next = { ...current };
                          delete next.sku;
                          return next;
                        });
                    }}
                    required
                    maxLength={120}
                    placeholder="e.g. TSHIRT-BLU-L"
                    aria-invalid={Boolean(draftErrors.sku)}
                    className={`mt-1 h-10 w-full rounded-xl border bg-transparent px-3 text-sm ${
                      draftErrors.sku
                        ? 'border-red-400 ring-1 ring-red-400/40'
                        : 'border-[var(--sami-border)]'
                    }`}
                  />
                  {draftErrors.sku ? <ErrorText>{draftErrors.sku}</ErrorText> : null}
                </label>

                <label className="block">
                  <span className="text-xs font-black">
                    Selling price <span className="text-red-500">*</span>
                  </span>
                  <input
                    type="number"
                    value={draft.unitPrice}
                    onChange={(event) => {
                      setDraft((current) => ({ ...current, unitPrice: event.target.value }));
                      if (draftErrors.unitPrice)
                        setDraftErrors((current) => {
                          const next = { ...current };
                          delete next.unitPrice;
                          return next;
                        });
                    }}
                    min={0}
                    step="0.01"
                    required
                    aria-invalid={Boolean(draftErrors.unitPrice)}
                    className={`mt-1 h-10 w-full rounded-xl border bg-transparent px-3 text-sm ${
                      draftErrors.unitPrice
                        ? 'border-red-400 ring-1 ring-red-400/40'
                        : 'border-[var(--sami-border)]'
                    }`}
                  />
                  {draftErrors.unitPrice ? (
                    <ErrorText>{draftErrors.unitPrice}</ErrorText>
                  ) : null}
                </label>

                {data.capabilities.canViewMargin ? (
                  <label className="block">
                    <span className="text-xs font-black">Unit cost</span>
                    <input
                      type="number"
                      value={draft.unitCost}
                      onChange={(event) => {
                        setDraft((current) => ({ ...current, unitCost: event.target.value }));
                        if (draftErrors.unitCost)
                          setDraftErrors((current) => {
                            const next = { ...current };
                            delete next.unitCost;
                            return next;
                          });
                      }}
                      min={0}
                      step="0.01"
                      aria-invalid={Boolean(draftErrors.unitCost)}
                      className={`mt-1 h-10 w-full rounded-xl border bg-transparent px-3 text-sm ${
                        draftErrors.unitCost
                          ? 'border-red-400 ring-1 ring-red-400/40'
                          : 'border-[var(--sami-border)]'
                      }`}
                    />
                    {draftErrors.unitCost ? (
                      <ErrorText>{draftErrors.unitCost}</ErrorText>
                    ) : (
                      <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">
                        Hidden from quotations and invoices.
                      </span>
                    )}
                  </label>
                ) : null}
              </div>

              {Object.keys(draftErrors).length > 0 ? (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700 ring-1 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-500/30">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Please fix the highlighted fields.</span>
                </div>
              ) : (
                <p className="inline-flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
                  Variants must have distinct SKUs. The system blocks duplicate SKUs within
                  the company and records variant changes in the activity history.
                </p>
              )}

              <button
                type="submit"
                disabled={busy || saving}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
              >
                <Save className="h-4 w-4" />{' '}
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create variant'}
              </button>
            </form>
          )}
        </div>

        {/* ---------- List ---------- */}
        <div className="sami-surface rounded-[24px] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-black">Active variants</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {variants.length} sellable SKU{variants.length === 1 ? '' : 's'} in the
                loaded catalogue
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search SKU, product…"
                  aria-label="Search variants"
                  className="h-9 w-52 rounded-xl border border-[var(--sami-border)] bg-transparent pl-8 pr-3 text-xs"
                />
              </label>
              <button
                type="button"
                onClick={() => router.refresh()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--sami-border)] px-2.5 text-xs font-bold"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {variants.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--sami-border)] p-6 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                  <Layers3 className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-bold">No variants yet</p>
                <p className="mx-auto mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">
                  Add colour, size or other sellable options to a product.
                </p>
              </div>
            ) : visibleVariants.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--sami-border)] p-6 text-center">
                <p className="text-sm font-bold">No variants match your search</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Try a different SKU or product name.
                </p>
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                >
                  Clear search
                </button>
              </div>
            ) : (
              visibleVariants.map((item) => {
                const isEditingThis = draft.variantId === item.variantId;
                const confirmingArchive = archiveId === item.variantId;
                const attributes = item.variantAttributes || [];

                return (
                  <article
                    key={item.variantId || item.id}
                    className={`rounded-xl border p-3 transition ${
                      isEditingThis
                        ? 'border-blue-500/60 bg-blue-500/[0.06] ring-1 ring-blue-500/30'
                        : 'border-[var(--sami-border)]'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black">
                          {item.baseProductName || item.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {item.variantLabel || item.name}
                        </p>
                        <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          <Tag className="h-3 w-3" /> SKU {item.sku || '—'}
                        </p>
                        {attributes.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {attributes.map((attr) => (
                              <span
                                key={attr.name}
                                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                              >
                                {attr.name}: {attr.value}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-sm font-black tabular-nums">
                        {money(item.unitPrice, data.company.currency)}
                      </p>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!canManage || busy || saving}
                        onClick={() => editVariant(item)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--sami-border)] px-2.5 text-xs font-bold disabled:opacity-50"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>

                      {confirmingArchive ? (
                        <>
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 dark:text-red-300">
                            <AlertTriangle className="h-3 w-3" /> Archive this SKU?
                          </span>
                          <button
                            type="button"
                            disabled={busy || saving}
                            onClick={() => void archiveVariant(item)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-rose-700 px-2.5 text-xs font-black text-white disabled:opacity-50"
                          >
                            <Archive className="h-3.5 w-3.5" /> Confirm archive
                          </button>
                          <button
                            type="button"
                            onClick={() => setArchiveId(null)}
                            className="h-8 rounded-lg border border-[var(--sami-border)] px-2.5 text-xs font-bold"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={!canManage || busy || saving}
                          onClick={() => setArchiveId(item.variantId)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/30 px-2.5 text-xs font-bold text-rose-700 disabled:opacity-50 dark:text-rose-300"
                        >
                          <Archive className="h-3.5 w-3.5" /> Archive
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>

          {variants.length > 0 ? (
            <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <CheckCircle2 className="h-3 w-3" /> Archived SKUs remain on historical
              documents. Only future quotations are affected.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--sami-border)] px-3 py-1.5 text-center">
      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="text-sm font-black tabular-nums">{value}</p>
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-1 block text-[10px] font-bold text-red-600 dark:text-red-400">
      {children}
    </span>
  );
}