'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, Layers3, Pencil, Plus, RotateCcw, Save, X } from 'lucide-react';
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
const emptyDraft = (baseCatalogItemId = ''): Draft => ({
  variantId: '',
  baseCatalogItemId,
  sku: '',
  unitPrice: '',
  unitCost: '',
  attributesText: 'Color=\nSize=',
});
function attributesFromText(value: string): Attribute[] {
  return value.split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const index = line.indexOf('=');
      if (index <= 0 || index === line.length - 1) {
        throw new Error('Enter each option as Name=Value, for example Color=Blue.');
      }
      return { name: line.slice(0, index).trim(), value: line.slice(index + 1).trim() };
    });
}
function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: currency || 'KES', maximumFractionDigits: 2 }).format(value);
  } catch {
    return (currency || 'KES') + ' ' + Number(value || 0).toLocaleString();
  }
}

export default function SalesProductVariantsManager({
  data, busy, request, showSuccess, showError,
}: {
  data: SalesWorkspaceData;
  busy: boolean;
  request: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
}) {
  const router = useRouter();
  const products = useMemo(
    () => data.catalogItems.filter(item => !item.isVariant && item.itemType === 'product'),
    [data.catalogItems],
  );
  const variants = useMemo(
    () => data.catalogItems.filter(item => item.isVariant),
    [data.catalogItems],
  );
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(products[0]?.id || ''));
  const [saving, setSaving] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [attributeError, setAttributeError] = useState('');

  const editing = Boolean(draft.variantId);
  const canManage = data.capabilities.canManageCatalog;
  const selectedProduct = products.find(item => item.id === draft.baseCatalogItemId);
  const selectedVariant = variants.find(item => item.variantId === draft.variantId);

  function editVariant(item: CatalogItem) {
    setDraft({
      variantId: item.variantId || '',
      baseCatalogItemId: item.baseCatalogItemId || products[0]?.id || '',
      sku: item.sku || '',
      unitPrice: String(item.unitPrice),
      unitCost: String(item.unitCost ?? ''),
      attributesText: (item.variantAttributes || []).map(row => row.name + '=' + row.value).join('\n'),
    });
    setAttributeError('');
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    if (!draft.baseCatalogItemId && !editing) {
      showError('Choose a product', 'Create a base product in the catalogue before adding variants.');
      return;
    }
    if (!draft.sku.trim()) {
      showError('SKU required', 'Every sellable variant needs its own unique SKU.');
      return;
    }
    let attributes: Attribute[];
    try {
      attributes = attributesFromText(draft.attributesText);
      if (!attributes.length) throw new Error('Add at least one variant attribute, such as Color=Blue.');
      if (new Set(attributes.map(item => item.name.toLowerCase())).size !== attributes.length) {
        throw new Error('Attribute names must be unique within a variant.');
      }
    } catch (error) {
      setAttributeError(error instanceof Error ? error.message : 'Check the variant attributes.');
      return;
    }
    setAttributeError('');
    setSaving(true);
    try {
      await request(editing ? {
        action: 'update_product_variant',
        variantId: draft.variantId,
        sku: draft.sku.trim(),
        unitPrice: Number(draft.unitPrice),
        ...(data.capabilities.canViewMargin ? { unitCost: Number(draft.unitCost || 0) } : {}),
        attributes,
      } : {
        action: 'create_product_variant',
        baseCatalogItemId: draft.baseCatalogItemId,
        sku: draft.sku.trim(),
        unitPrice: Number(draft.unitPrice || selectedProduct?.unitPrice || 0),
        ...(data.capabilities.canViewMargin ? { unitCost: Number(draft.unitCost || 0) } : {}),
        attributes,
      });
      showSuccess(editing ? 'Variant updated' : 'Variant created',
        'The sellable SKU is saved in the shared catalogue and is available to quotations.');
      setDraft(emptyDraft(products[0]?.id || ''));
      router.refresh();
    } catch (error) {
      showError('Variant could not be saved', error instanceof Error ? error.message : 'SaMi could not save this product variant.');
    } finally {
      setSaving(false);
    }
  }

  async function archiveVariant(item: CatalogItem) {
    if (!item.variantId) return;
    try {
      await request({ action: 'archive_product_variant', variantId: item.variantId });
      showSuccess('Variant archived', 'The SKU is no longer available for new quotations. Historical documents remain unchanged.');
      setArchiveId(null);
      if (draft.variantId === item.variantId) setDraft(emptyDraft(products[0]?.id || ''));
      router.refresh();
    } catch (error) {
      showError('Variant could not be archived', error instanceof Error ? error.message : 'SaMi could not archive this SKU.');
    }
  }

  return (
    <section className="space-y-4">
      <div className="sami-surface rounded-[24px] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600"><Layers3 className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Sellable product SKUs</p>
            <h2 className="mt-1 text-xl font-black">Product variants</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">Define options such as size, colour, capacity or packaging. Each combination is its own shared catalogue item with its own SKU and price, so quotations and subsequent invoices keep the exact variant sold.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="sami-surface rounded-[24px] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-black">{editing ? 'Edit product variant' : 'Add variant'}</h3>
            {editing ? <button type="button" onClick={() => { setDraft(emptyDraft(products[0]?.id || '')); setAttributeError(''); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--sami-border)] px-2.5 text-xs font-bold"><X className="h-3.5 w-3.5" /> Cancel edit</button> : null}
          </div>
          {!canManage ? (
            <p className="mt-3 rounded-xl border border-dashed border-[var(--sami-border)] p-4 text-sm text-slate-500">Catalogue-management permission is required to create or edit product variants.</p>
          ) : products.length === 0 && !editing ? (
            <p className="mt-3 rounded-xl border border-dashed border-[var(--sami-border)] p-4 text-sm text-slate-500">Create a base product first, then add its variant SKUs here.</p>
          ) : (
            <form className="mt-4 space-y-4" onSubmit={save}>
              <label className="block text-xs font-bold">Base product
                <select value={draft.baseCatalogItemId} disabled={editing || saving || busy} onChange={event => {
                  const product = products.find(item => item.id === event.target.value);
                  setDraft(current => ({ ...current, baseCatalogItemId: event.target.value, unitPrice: product ? String(product.unitPrice) : current.unitPrice }));
                }} className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm">
                  {products.map(item => <option key={item.id} value={item.id}>{item.name}{item.sku ? ' · ' + item.sku : ''}</option>)}
                </select>
              </label>
              {selectedVariant ? <p className="rounded-lg bg-[var(--sami-surface-soft)] p-2 text-xs text-slate-500">Base product: {selectedVariant.baseProductName || selectedProduct?.name || 'Product'}</p> : null}
              <label className="block text-xs font-bold">Variant attributes * <span className="font-normal text-slate-500">one Name=Value pair per line</span>
                <textarea value={draft.attributesText} onChange={event => { setDraft(current => ({ ...current, attributesText: event.target.value })); setAttributeError(''); }} required rows={4} placeholder={'Color=Blue\nSize=Large'} className="mt-1 w-full rounded-xl border border-[var(--sami-border)] bg-transparent p-3 text-sm" />
              </label>
              {attributeError ? <p role="alert" className="text-xs font-semibold text-rose-600">{attributeError}</p> : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-bold">Unique SKU *
                  <input value={draft.sku} onChange={event => setDraft(current => ({ ...current, sku: event.target.value }))} required maxLength={120} placeholder="e.g. TSHIRT-BLU-L" className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm" />
                </label>
                <label className="block text-xs font-bold">Selling price *
                  <input type="number" value={draft.unitPrice} onChange={event => setDraft(current => ({ ...current, unitPrice: event.target.value }))} min={0} step="0.01" required className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm" />
                </label>
                {data.capabilities.canViewMargin ? <label className="block text-xs font-bold">Unit cost
                  <input type="number" value={draft.unitCost} onChange={event => setDraft(current => ({ ...current, unitCost: event.target.value }))} min={0} step="0.01" className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm" />
                </label> : null}
              </div>
              <p className="text-xs leading-5 text-slate-500">Variants must have distinct SKUs. The system blocks duplicate SKUs within the company and records variant changes in the activity history.</p>
              <button type="submit" disabled={busy || saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"><Save className="h-4 w-4" /> {saving ? 'Saving…' : editing ? 'Save changes' : 'Create variant'}</button>
            </form>
          )}
        </div>

        <div className="sami-surface rounded-[24px] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black">Active variants</h3><p className="mt-1 text-xs text-slate-500">{variants.length} sellable SKU(s) in the loaded catalogue</p></div><button type="button" onClick={() => router.refresh()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--sami-border)] px-2.5 text-xs font-bold"><RotateCcw className="h-3.5 w-3.5" /> Refresh</button></div>
          <div className="mt-4 space-y-2">
            {variants.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--sami-border)] p-6 text-center"><p className="text-sm font-bold">No variants yet</p><p className="mt-1 text-xs text-slate-500">Add colour, size or other sellable options to a product.</p></div> : variants.map(item => (
              <article key={item.variantId || item.id} className="rounded-xl border border-[var(--sami-border)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0"><p className="text-sm font-black">{item.baseProductName || item.name}</p><p className="mt-1 text-xs text-slate-500">{item.variantLabel || item.name}</p><p className="mt-1 text-[11px] font-semibold text-slate-500">SKU {item.sku || '—'}</p></div>
                  <p className="shrink-0 text-sm font-black tabular-nums">{money(item.unitPrice, data.company.currency)}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={!canManage || busy || saving} onClick={() => editVariant(item)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--sami-border)] px-2.5 text-xs font-bold disabled:opacity-50"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                  {archiveId === item.variantId ? <><button type="button" disabled={busy || saving} onClick={() => void archiveVariant(item)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-rose-700 px-2.5 text-xs font-black text-white disabled:opacity-50"><Archive className="h-3.5 w-3.5" /> Confirm archive</button><button type="button" onClick={() => setArchiveId(null)} className="h-8 rounded-lg border border-[var(--sami-border)] px-2.5 text-xs font-bold">Cancel</button></> : <button type="button" disabled={!canManage || busy || saving} onClick={() => setArchiveId(item.variantId)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/30 px-2.5 text-xs font-bold text-rose-700 disabled:opacity-50 dark:text-rose-300"><Archive className="h-3.5 w-3.5" /> Archive</button>}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
