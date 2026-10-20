'use client';

import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Download,
  Info,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useRouter } from 'next/navigation';

import type {
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';

type Item = SalesWorkspaceData['catalogItems'][number];

type Draft = {
  itemId: string;
  itemType: string;
  name: string;
  sku: string;
  description: string;
  unit: string;
  unitPrice: string;
  unitCost: string;
  taxRateId: string;
};

type VariantDraft = {
  variantId: string;
  sku: string;
  attributes: string;
  unitPrice: string;
  unitCost: string;
};

type DraftError = Partial<Record<'name' | 'unitPrice' | 'unitCost' | 'sku', string>>;
type VariantError = Partial<Record<'sku' | 'attributes' | 'unitPrice' | 'unitCost', string>>;

type ImportSummary = {
  total: number;
  created: number;
  failed: number;
  failures: Array<{ row?: number; error?: string; name?: string }>;
};

function blankVariant(unitPrice = ''): VariantDraft {
  return { variantId: '', sku: '', attributes: '', unitPrice, unitCost: '' };
}

function variantFromItem(item: Item): VariantDraft {
  return {
    variantId: item.variantId || '',
    sku: item.sku || '',
    attributes: item.variantAttributes
      .map((attribute) => attribute.name + '=' + attribute.value)
      .join('\n'),
    unitPrice: String(item.unitPrice),
    unitCost: item.unitCost === null ? '' : String(item.unitCost),
  };
}

function parseVariantAttributes(
  value: string,
): Array<{ name: string; value: string }> {
  const attributes = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const split = line.indexOf('=');
      if (split < 1 || !line.slice(0, split).trim() || !line.slice(split + 1).trim()) {
        throw new Error(
          'Enter each variant attribute on its own line as Name=Value, for example Color=Blue.',
        );
      }
      return { name: line.slice(0, split).trim(), value: line.slice(split + 1).trim() };
    });
  if (!attributes.length)
    throw new Error('Add at least one variant attribute, such as Color=Blue.');
  if (attributes.length > 12) throw new Error('A variant can have at most 12 attributes.');
  return attributes;
}

function blank(defaultTaxRateId = ''): Draft {
  return {
    itemId: '',
    itemType: 'product',
    name: '',
    sku: '',
    description: '',
    unit: 'unit',
    unitPrice: '',
    unitCost: '',
    taxRateId: defaultTaxRateId,
  };
}

function fromItem(item: Item): Draft {
  return {
    itemId: item.id,
    itemType: item.itemType,
    name: item.name,
    sku: item.sku || '',
    description: item.description || '',
    unit: item.unit,
    unitPrice: String(item.unitPrice),
    unitCost: item.unitCost === null ? '' : String(item.unitCost),
    taxRateId: item.taxRateId || '',
  };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.length === 0) {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell.replace(/\r$/, ''));
  if (row.some((value) => value.trim())) rows.push(row);
  if (quoted) throw new Error('The CSV file has an unclosed quoted field.');
  return rows;
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function priceFormatter(currency: string) {
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    });
  } catch {
    return new Intl.NumberFormat('en-KE', { maximumFractionDigits: 2 });
  }
}

export default function SalesProductCatalogueManager({
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
  const defaultTaxRateId = data.taxRates.find((rate) => rate.isDefault)?.id || '';
  const formatPrice = useMemo(() => priceFormatter(data.company.currency), [data.company.currency]);

  const [items, setItems] = useState(data.catalogItems);
  useEffect(() => {
    setItems(data.catalogItems);
  }, [data.catalogItems]);

  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'product' | 'service'>('all');
  const [draft, setDraft] = useState<Draft>(blank(defaultTaxRateId));
  const [draftErrors, setDraftErrors] = useState<DraftError>({});
  const [variantDraft, setVariantDraft] = useState<VariantDraft>(blankVariant());
  const [variantErrors, setVariantErrors] = useState<VariantError>({});
  const [variantToArchive, setVariantToArchive] = useState<Item | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const editing = Boolean(draft.itemId);

  const selectedBaseItem = draft.itemId
    ? items.find((item) => item.id === draft.itemId && !item.isVariant)
    : undefined;

  const variantsForSelected = selectedBaseItem?.itemType === 'product'
    ? items.filter((item) => item.isVariant && item.baseCatalogItemId === selectedBaseItem.id)
    : [];

  const baseItems = useMemo(() => items.filter((item) => !item.isVariant), [items]);

  const visible = useMemo(() => {
    const value = query.trim().toLowerCase();
    return baseItems.filter((item) => {
      if (typeFilter !== 'all' && item.itemType !== typeFilter) return false;
      if (!value) return true;
      return [item.name, item.sku, item.description, item.itemType]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(value);
    });
  }, [baseItems, query, typeFilter]);

  const counts = useMemo(() => {
    const products = baseItems.filter((item) => item.itemType === 'product').length;
    const services = baseItems.filter((item) => item.itemType === 'service').length;
    const variants = items.filter((item) => item.isVariant).length;
    return { products, services, variants, total: baseItems.length };
  }, [baseItems, items]);

  function set<K extends keyof Draft>(key: K, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    if (draftErrors[key as keyof DraftError]) {
      setDraftErrors((current) => {
        const next = { ...current };
        delete next[key as keyof DraftError];
        return next;
      });
    }
  }

  function validateDraft(): DraftError {
    const next: DraftError = {};
    if (!draft.name.trim()) next.name = 'Name is required.';
    if (draft.unitPrice.trim() && !Number.isFinite(Number(draft.unitPrice)))
      next.unitPrice = 'Enter a number.';
    else if (Number(draft.unitPrice) < 0) next.unitPrice = 'Price cannot be negative.';
    if (draft.unitCost.trim() && !Number.isFinite(Number(draft.unitCost)))
      next.unitCost = 'Enter a number.';
    else if (Number(draft.unitCost) < 0) next.unitCost = 'Cost cannot be negative.';
    return next;
  }

  async function save() {
    const errors = validateDraft();
    setDraftErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Check the form', 'Please correct the highlighted catalogue fields.');
      return;
    }

    try {
      const result = await request({
        action: editing ? 'update_catalog_item' : 'create_catalog_item',
        itemId: draft.itemId || undefined,
        itemType: draft.itemType,
        name: draft.name,
        sku: draft.sku,
        description: draft.description,
        unit: draft.unit,
        unitPrice: draft.unitPrice,
        ...(data.capabilities.canManageMargin && draft.unitCost.trim() !== ''
          ? { unitCost: draft.unitCost }
          : {}),
        taxRateId: draft.taxRateId || undefined,
      });

      const id = String(result.id || draft.itemId || '');
      if (!id) throw new Error('SaMi did not return the saved catalogue item.');

      const previous = items.find((item) => item.id === id);
      const selectedTax = data.taxRates.find((rate) => rate.id === draft.taxRateId);
      const keptExistingTax = draft.taxRateId && draft.taxRateId === previous?.taxRateId;

      const next: Item = {
        id,
        itemType: draft.itemType,
        name: draft.name.trim(),
        sku: draft.sku.trim() || null,
        description: draft.description.trim() || null,
        unit: draft.unit.trim() || 'unit',
        unitPrice: Number(draft.unitPrice || 0),
        taxRateId: draft.taxRateId || null,
        taxName: selectedTax?.name || (keptExistingTax ? previous?.taxName : null) || null,
        taxRate: selectedTax?.rate ?? (keptExistingTax ? previous?.taxRate : 0) ?? 0,
        unitCost:
          data.capabilities.canManageMargin && draft.unitCost.trim() !== ''
            ? Number(draft.unitCost)
            : previous?.unitCost ?? null,
        isVariant: false,
        variantId: null,
        baseCatalogItemId: null,
        baseProductName: null,
        variantLabel: null,
        variantAttributes: [],
      };

      setItems((current) => [next, ...current.filter((item) => item.id !== id)]);
      setDraft(blank(defaultTaxRateId));
      setVariantDraft(blankVariant());
      setDraftErrors({});

      showSuccess(
        editing ? 'Catalogue item updated' : 'Catalogue item created',
        'The shared product master is ready for Sales quotations and Invoicing.',
      );
      router.refresh();
    } catch (error) {
      showError(
        'Catalogue item could not be saved',
        error instanceof Error ? error.message : 'SaMi could not save the catalogue item.',
      );
    }
  }

  function validateVariant(): VariantError {
    const next: VariantError = {};
    if (!variantDraft.sku.trim()) next.sku = 'Variant SKU is required.';
    try {
      parseVariantAttributes(variantDraft.attributes);
    } catch (error) {
      next.attributes = error instanceof Error ? error.message : 'Check the attributes.';
    }
    if (variantDraft.unitPrice.trim() && !Number.isFinite(Number(variantDraft.unitPrice)))
      next.unitPrice = 'Enter a number.';
    if (variantDraft.unitCost.trim() && !Number.isFinite(Number(variantDraft.unitCost)))
      next.unitCost = 'Enter a number.';
    return next;
  }

  async function saveVariant() {
    if (!selectedBaseItem || selectedBaseItem.itemType !== 'product') {
      showError(
        'Select a base product',
        'Product variants can only be created from an active product.',
      );
      return;
    }

    const errors = validateVariant();
    setVariantErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Check the variant form', 'Fix the highlighted variant fields.');
      return;
    }

    const attributes = parseVariantAttributes(variantDraft.attributes);

    try {
      const result = await request({
        action: variantDraft.variantId ? 'update_product_variant' : 'create_product_variant',
        ...(variantDraft.variantId
          ? { variantId: variantDraft.variantId }
          : { baseCatalogItemId: selectedBaseItem.id }),
        sku: variantDraft.sku.trim(),
        attributes,
        ...(variantDraft.unitPrice.trim() ? { unitPrice: variantDraft.unitPrice } : {}),
        ...(data.capabilities.canManageMargin && variantDraft.unitCost.trim()
          ? { unitCost: variantDraft.unitCost }
          : {}),
      });
      if (!result.catalogItemId && !result.id) {
        throw new Error('SaMi did not return the saved variant catalogue item.');
      }
      showSuccess(
        variantDraft.variantId ? 'Product variant updated' : 'Product variant created',
        'The variant has its own SKU and catalogue identity for quotations, orders and invoices.',
      );
      setVariantDraft(blankVariant(String(selectedBaseItem.unitPrice)));
      setVariantErrors({});
      router.refresh();
    } catch (error) {
      showError(
        'Product variant could not be saved',
        error instanceof Error ? error.message : 'SaMi could not save the product variant.',
      );
    }
  }

  function requestArchiveVariant(item: Item) {
    if (!item.variantId) {
      showError('Variant could not be archived', 'The variant record identifier is missing.');
      return;
    }
    setVariantToArchive(item);
  }

  async function confirmArchiveVariant() {
    const item = variantToArchive;
    if (!item || !item.variantId) {
      setVariantToArchive(null);
      return;
    }
    try {
      await request({ action: 'archive_product_variant', variantId: item.variantId });
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      if (variantDraft.variantId === item.variantId) {
        setVariantDraft(blankVariant(String(selectedBaseItem?.unitPrice || '')));
      }
      showSuccess(
        'Product variant archived',
        'Historical quotation and order lines retain their saved snapshots.',
      );
      router.refresh();
    } catch (error) {
      showError(
        'Product variant could not be archived',
        error instanceof Error ? error.message : 'SaMi could not archive the product variant.',
      );
    } finally {
      setVariantToArchive(null);
    }
  }

  function exportCatalogue() {
    downloadCsv('sami-sales-catalogue.csv', [
      [
        'name',
        'itemType',
        'sku',
        'description',
        'unit',
        'unitPrice',
        'taxRateId',
        'baseProductSku',
        'variantAttributes',
        'unitCost',
      ],
      ...items.map((item) => {
        const base = item.isVariant
          ? items.find((candidate) => candidate.id === item.baseCatalogItemId)
          : undefined;
        return [
          item.name,
          item.itemType,
          item.sku || '',
          item.description || '',
          item.unit,
          item.unitPrice,
          item.taxRateId || '',
          base?.sku || '',
          item.isVariant ? JSON.stringify(item.variantAttributes) : '',
          item.unitCost ?? '',
        ];
      }),
    ]);
    showSuccess('Catalogue exported', `${items.length} row${items.length === 1 ? '' : 's'} written to CSV.`);
  }

  const importCatalogue = useCallback(
    async (file: File) => {
      if (!data.capabilities.canManageCatalog) {
        showError(
          'Catalogue permission required',
          'You need catalogue-management permission to import products.',
        );
        return;
      }
      setImporting(true);
      setImportSummary(null);
      try {
        const rows = parseCsv(await file.text());
        if (rows.length < 2)
          throw new Error('The CSV must include a header row and at least one product row.');
        if (rows.length - 1 > 200)
          throw new Error('Import is limited to 200 product rows per file.');
        const normalizeHeader = (value: string) =>
          value.trim().toLowerCase().replace(/[ _-]/g, '');
        const headers = rows[0].map(normalizeHeader);
        const column = (...names: string[]) =>
          headers.findIndex((header) => names.includes(header));
        const nameColumn = column('name', 'productname', 'itemname');
        if (nameColumn < 0) throw new Error('The CSV needs a name or productName column.');
        const val = (row: string[], index: number) =>
          index < 0 ? '' : row[index]?.trim() || '';
        const itemsToImport = rows.slice(1).map((row) => ({
          name: val(row, nameColumn),
          itemType: val(row, column('itemtype', 'type')).toLowerCase() || 'product',
          sku: val(row, column('sku', 'itemsku')),
          description: val(row, column('description', 'details')),
          unit: val(row, column('unit', 'uom')) || 'unit',
          unitPrice: val(row, column('unitprice', 'price', 'sellingprice')) || '0',
          taxRateId: val(row, column('taxrateid')),
          baseProductSku: val(row, column('baseproductsku', 'parentproductsku')),
          variantAttributes: val(row, column('variantattributes', 'attributes')),
          unitCost: val(row, column('unitcost', 'cost')),
        }));
        const result = (await request({
          action: 'bulk_import_catalog_items',
          items: itemsToImport,
        })) as {
          total?: number;
          created?: number;
          failed?: number;
          results?: Array<{ row?: number; success?: boolean; error?: string; name?: string }>;
        };
        const created = Number(result.created || 0);
        const failed = Number(result.failed || 0);
        const failures = (result.results || [])
          .filter((item) => item.success === false)
          .slice(0, 10);
        setImportSummary({
          total: itemsToImport.length,
          created,
          failed,
          failures,
        });

        const summary =
          created + ' created; ' + failed + ' failed.' +
          (failures.length ? ' ' + failures.slice(0, 3).map((f) => 'Row ' + (f.row || '?') + ': ' + (f.error || 'Import failed')).join(' · ') : '');

        if (created === 0 && failed > 0) showError('Catalogue import needs attention', summary);
        else showSuccess('Catalogue import finished', summary);
        router.refresh();
      } catch (error) {
        showError(
          'Catalogue import failed',
          error instanceof Error ? error.message : 'SaMi could not read that CSV file.',
        );
      } finally {
        setImporting(false);
      }
    },
    [data.capabilities.canManageCatalog, request, router, showError, showSuccess],
  );

  const canManage = data.capabilities.canManageCatalog;
  const busyAny = busy || importing;

  return (
    <section className="space-y-4">
      {/* ---------- Header ---------- */}
      <div className="sami-surface rounded-[24px] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
<h2 className="mt-1 text-xl font-black">Product catalogue</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
              Maintain the shared product and service catalogue from Sales. The same
              item identity is reused by quotations and downstream invoices.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Total" value={counts.total} />
            <Stat label="Products" value={counts.products} />
            <Stat label="Services" value={counts.services} />
            <Stat label="Variants" value={counts.variants} />
          </div>
        </div>
      </div>

      {/* ---------- Toolbar ---------- */}
      <div className="sami-surface rounded-[24px] p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search products, services or SKU"
                className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent pl-9 pr-3 text-sm"
                aria-label="Search catalogue"
              />
            </div>
            <div className="inline-flex rounded-xl border border-[var(--sami-border)] p-0.5 text-[11px] font-black">
              {(['all', 'product', 'service'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTypeFilter(option)}
                  className={`h-9 rounded-lg px-3 capitalize transition ${
                    typeFilter === option
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportCatalogue}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busyAny || !canManage}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-50"
            >
              <Upload className="h-4 w-4" /> {importing ? 'Importing…' : 'Import CSV'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              disabled={busyAny || !canManage}
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void importCatalogue(file);
              }}
            />
            <button
              type="button"
              onClick={() => {
                setDraft(blank(defaultTaxRateId));
                setDraftErrors({});
                setVariantDraft(blankVariant());
                setVariantErrors({});
              }}
              disabled={!canManage}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> New item
            </button>
          </div>
        </div>
      </div>

      {/* ---------- Import summary ---------- */}
      {importSummary ? (
        <div
          className={`flex flex-wrap items-start gap-2 rounded-2xl px-4 py-3 text-xs font-bold ring-1 ${
            importSummary.failed === 0
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/30'
              : importSummary.created === 0
                ? 'bg-red-50 text-red-700 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-500/30'
                : 'bg-amber-50 text-amber-800 ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-500/30'
          }`}
        >
          {importSummary.failed === 0 ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p>
              Import finished · {importSummary.created} created · {importSummary.failed} failed ·{' '}
              {importSummary.total} total rows
            </p>
            {importSummary.failures.length > 0 ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] font-medium">
                {importSummary.failures.map((failure, index) => (
                  <li key={index}>
                    Row {failure.row ?? '?'} {failure.name ? `(${failure.name})` : ''}:{' '}
                    {failure.error || 'Import failed'}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setImportSummary(null)}
            className="ml-auto rounded-lg border border-current/20 px-2 py-1 text-[10px] font-black uppercase tracking-[0.06em]"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* ---------- Main split ---------- */}
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        {/* List */}
        <div className="sami-surface rounded-[24px] p-3">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <p className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">
              Catalogue · {visible.length} shown
            </p>
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
              <Sparkles className="h-3 w-3" /> Click a card to edit
            </span>
          </div>

          <div className="max-h-[720px] space-y-2 overflow-y-auto pr-1">
            {visible.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--sami-border)] p-6 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                  <Package className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-black">
                  {baseItems.length === 0 ? 'No catalogue items yet' : 'No items match your filters'}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                  {baseItems.length === 0
                    ? 'Create your first product or import a CSV to get started.'
                    : 'Try clearing the search or switching back to All.'}
                </p>
                {baseItems.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setTypeFilter('all');
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            ) : (
              visible.map((item) => {
                const isSelected = draft.itemId === item.id;
                const variantCount = items.filter(
                  (candidate) =>
                    candidate.isVariant && candidate.baseCatalogItemId === item.id,
                ).length;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      setDraft(fromItem(item));
                      setDraftErrors({});
                      setVariantDraft(blankVariant(String(item.unitPrice)));
                      setVariantErrors({});
                    }}
                    className={`w-full rounded-2xl border p-3 text-left transition ${
                      isSelected
                        ? 'border-blue-500/60 bg-blue-500/[0.06] ring-1 ring-blue-500/30'
                        : 'border-[var(--sami-border)] hover:bg-slate-500/[0.04]'
                    }`}
                    aria-pressed={isSelected}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                              item.itemType === 'product'
                                ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300'
                                : 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}
                          >
                            <Box className="h-3.5 w-3.5" />
                          </span>
                          <p className="truncate text-sm font-black">{item.name}</p>
                          {variantCount > 0 ? (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              {variantCount} variant{variantCount === 1 ? '' : 's'}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {[item.itemType, item.sku, item.unit, item.taxName]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <p className="text-sm font-black tabular-nums">
                          {formatPrice.format(item.unitPrice)}
                        </p>
                        <Pencil className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="sami-surface rounded-[24px] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black">
                {editing ? 'Edit catalogue item' : 'New catalogue item'}
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {editing
                  ? 'Changes apply to future quotations. Historical documents keep their saved snapshots.'
                  : 'Create a product or service for quotations and invoices.'}
              </p>
            </div>
            {canManage ? (
              <button
                type="button"
                onClick={() => {
                  setDraft(blank(defaultTaxRateId));
                  setDraftErrors({});
                  setVariantDraft(blankVariant());
                  setVariantErrors({});
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
              >
                <Plus className="h-4 w-4" /> New
              </button>
            ) : null}
          </div>

          {canManage ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Select
                label="Type"
                value={draft.itemType}
                onChange={(value) => set('itemType', value)}
              />
              <Field
                label="Name"
                value={draft.name}
                onChange={(value) => set('name', value)}
                error={draftErrors.name}
                required
              />
              <Field
                label="SKU"
                value={draft.sku}
                onChange={(value) => set('sku', value)}
                hint="Auto-trimmed; leave blank if not tracked"
              />
              <Field
                label="Unit"
                value={draft.unit}
                onChange={(value) => set('unit', value)}
              />
              <Field
                label="Unit price"
                type="number"
                value={draft.unitPrice}
                onChange={(value) => set('unitPrice', value)}
                error={draftErrors.unitPrice}
              />
              {data.capabilities.canManageMargin ? (
                <Field
                  label="Unit cost (internal)"
                  type="number"
                  value={draft.unitCost}
                  onChange={(value) => set('unitCost', value)}
                  error={draftErrors.unitCost}
                  hint="Hidden from quotations and invoices"
                />
              ) : null}

              <label className="block sm:col-span-2">
                <span className="text-xs font-black">Tax rate</span>
                <select
                  value={draft.taxRateId}
                  onChange={(event) => set('taxRateId', event.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                >
                  <option value="">No tax</option>
                  {draft.taxRateId &&
                  !data.taxRates.some((rate) => rate.id === draft.taxRateId) ? (
                    <option value={draft.taxRateId}>
                      Existing tax:{' '}
                      {items.find((item) => item.id === draft.itemId)?.taxName ||
                        'unavailable rate'}
                    </option>
                  ) : null}
                  {data.taxRates.map((rate) => (
                    <option key={rate.id} value={rate.id}>
                      {rate.name} · {rate.rate}%
                      {rate.priceIncluded ? ' (included)' : ''}
                      {rate.isDefault ? ' · default' : ''}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                  Tax is taken from the company’s shared Invoicing tax configuration and
                  recalculated on quotations.
                </span>
              </label>

              <div className="sm:col-span-2">
                <label className="block">
                  <span className="text-xs font-black">Description</span>
                  <textarea
                    value={draft.description}
                    rows={4}
                    onChange={(event) => set('description', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
                  />
                </label>
              </div>

              {Object.keys(draftErrors).length > 0 ? (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700 ring-1 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-500/30 sm:col-span-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Please fix the highlighted fields.</span>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button
                  type="button"
                  disabled={busyAny}
                  onClick={() => void save()}
                  className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
                >
                  {busy ? 'Saving…' : editing ? 'Save item' : 'Create item'}
                </button>
                <button
                  type="button"
                  disabled={busyAny}
                  onClick={() => {
                    setDraft(blank(defaultTaxRateId));
                    setDraftErrors({});
                    setVariantDraft(blankVariant());
                    setVariantErrors({});
                  }}
                  className="h-10 rounded-xl border border-[var(--sami-border)] px-4 text-xs font-black disabled:opacity-60"
                >
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-dashed border-[var(--sami-border)] p-5 text-sm text-slate-500 dark:text-slate-400">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                You can use catalogue items in quotations, but catalogue-management
                permission is required to create or edit them.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ---------- Variants ---------- */}
      {selectedBaseItem &&
      selectedBaseItem.itemType === 'product' &&
      data.capabilities.canManageCatalog ? (
        <section className="sami-surface space-y-4 rounded-[24px] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                Product variants
              </p>
              <h3 className="mt-1 text-lg font-black">{selectedBaseItem.name}</h3>
              <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
                Create SKU-level variants such as colour, size or packaging. Each variant
                becomes a shared catalogue item so quotes, orders and invoices keep the
                selected SKU.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setVariantDraft(blankVariant(String(selectedBaseItem.unitPrice)));
                setVariantErrors({});
              }}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
            >
              <Plus className="h-4 w-4" /> New variant
            </button>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            {/* Variant editor */}
            <div className="rounded-2xl border border-[var(--sami-border)] p-3">
              <h4 className="flex items-center gap-1.5 text-sm font-black">
                <Wand2 className="h-3.5 w-3.5" />
                {variantDraft.variantId ? 'Edit variant' : 'Create variant'}
              </h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field
                  label="Variant SKU"
                  value={variantDraft.sku}
                  onChange={(value) => {
                    setVariantDraft((current) => ({ ...current, sku: value }));
                    if (variantErrors.sku)
                      setVariantErrors((current) => {
                        const next = { ...current };
                        delete next.sku;
                        return next;
                      });
                  }}
                  error={variantErrors.sku}
                  required
                />
                <Field
                  label="Unit price"
                  type="number"
                  value={variantDraft.unitPrice}
                  onChange={(value) => setVariantDraft((current) => ({ ...current, unitPrice: value }))}
                  error={variantErrors.unitPrice}
                />
                {data.capabilities.canManageMargin ? (
                  <Field
                    label="Unit cost (restricted)"
                    type="number"
                    value={variantDraft.unitCost}
                    onChange={(value) => setVariantDraft((current) => ({ ...current, unitCost: value }))}
                    error={variantErrors.unitCost}
                  />
                ) : null}
                <label className="block sm:col-span-2">
                  <span className="text-xs font-black">
                    Attributes <span className="text-red-500">*</span>
                  </span>
                  <textarea
                    value={variantDraft.attributes}
                    onChange={(event) => {
                      setVariantDraft((current) => ({ ...current, attributes: event.target.value }));
                      if (variantErrors.attributes)
                        setVariantErrors((current) => {
                          const next = { ...current };
                          delete next.attributes;
                          return next;
                        });
                    }}
                    placeholder={'Color=Blue\nSize=Large'}
                    rows={4}
                    aria-invalid={Boolean(variantErrors.attributes)}
                    className={`mt-1 w-full rounded-xl border bg-transparent px-3 py-2 text-sm ${
                      variantErrors.attributes
                        ? 'border-red-400 ring-1 ring-red-400/40'
                        : 'border-[var(--sami-border)]'
                    }`}
                  />
                  {variantErrors.attributes ? (
                    <span className="mt-1 block text-[10px] font-bold text-red-600 dark:text-red-400">
                      {variantErrors.attributes}
                    </span>
                  ) : (
                    <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">
                      One attribute per line, in Name=Value form.
                    </span>
                  )}
                </label>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <button
                    type="button"
                    disabled={busyAny}
                    onClick={() => void saveVariant()}
                    className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
                  >
                    {variantDraft.variantId ? 'Save variant' : 'Create variant'}
                  </button>
                  <button
                    type="button"
                    disabled={busyAny}
                    onClick={() => {
                      setVariantDraft(blankVariant(String(selectedBaseItem.unitPrice)));
                      setVariantErrors({});
                    }}
                    className="h-10 rounded-xl border border-[var(--sami-border)] px-4 text-xs font-black disabled:opacity-60"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            {/* Variant list */}
            <div className="space-y-2">
              <h4 className="text-sm font-black">
                Active variants ({variantsForSelected.length})
              </h4>
              {variantsForSelected.length ? (
                variantsForSelected.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--sami-border)] p-3"
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-black">
                        {item.variantLabel || item.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {[
                          item.sku,
                          item.variantAttributes
                            .map((attribute) => attribute.name + ': ' + attribute.value)
                            .join(' · '),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <p className="mt-1 text-sm font-bold tabular-nums">
                        {formatPrice.format(item.unitPrice)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyAny}
                        onClick={() => {
                          setVariantDraft(variantFromItem(item));
                          setVariantErrors({});
                        }}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--sami-border)] px-3 text-xs font-bold disabled:opacity-60"
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                      <button
                        type="button"
                        disabled={busyAny}
                        onClick={() => requestArchiveVariant(item)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-300 px-3 text-xs font-bold text-red-600 disabled:opacity-60 dark:border-red-900/40 dark:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" /> Archive
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--sami-border)] p-5 text-sm text-slate-500 dark:text-slate-400">
                  No active variants yet. Add the first SKU above.
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* ---------- Archive variant confirm ---------- */}
      {variantToArchive ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="archive-variant-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--sami-border)] bg-white p-5 shadow-xl dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <p id="archive-variant-title" className="text-sm font-black">
                  Archive variant?
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  <strong>{variantToArchive.sku || variantToArchive.name}</strong> will no
                  longer be available for new quotations. Historical documents remain
                  unchanged.
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVariantToArchive(null)}
                className="h-9 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmArchiveVariant()}
                className="h-9 rounded-xl bg-red-600 px-3 text-xs font-black text-white hover:bg-red-700"
              >
                Archive variant
              </button>
            </div>
          </div>
        </div>
      ) : null}
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

function Field({
  label,
  value,
  onChange,
  type = 'text',
  error,
  hint,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        className={`mt-1 h-10 w-full rounded-xl border bg-transparent px-3 text-sm ${
          error ? 'border-red-400 ring-1 ring-red-400/40' : 'border-[var(--sami-border)]'
        }`}
      />
      {error ? (
        <span className="mt-1 block text-[10px] font-bold text-red-600 dark:text-red-400">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
      >
        <option value="product">Product</option>
        <option value="service">Service</option>
      </select>
    </label>
  );
}