'use client';

import {
  Box,
  Download,
  Pencil,
  Plus,
  Search,
  Upload,
} from 'lucide-react';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useRouter } from 'next/navigation';

import type {
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';


type Item =
  SalesWorkspaceData[
    'catalogItems'
  ][number];

type Draft = {
  itemId:
    string;
  itemType:
    string;
  name:
    string;
  sku:
    string;
  description:
    string;
  unit:
    string;
  unitPrice:
    string;
  taxRateId:
    string;
};

type VariantDraft = {
  variantId: string;
  sku: string;
  attributes: string;
  unitPrice: string;
  unitCost: string;
};

function blankVariant(unitPrice = ''): VariantDraft {
  return { variantId: '', sku: '', attributes: '', unitPrice, unitCost: '' };
}

function variantFromItem(item: Item): VariantDraft {
  return {
    variantId: item.variantId || '',
    sku: item.sku || '',
    attributes: item.variantAttributes.map(attribute => attribute.name + '=' + attribute.value).join('\n'),
    unitPrice: String(item.unitPrice),
    unitCost: item.unitCost === null ? '' : String(item.unitCost),
  };
}

function parseVariantAttributes(value: string): Array<{ name: string; value: string }> {
  const attributes = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const split = line.indexOf('=');
    if (split < 1 || !line.slice(0, split).trim() || !line.slice(split + 1).trim()) {
      throw new Error('Enter each variant attribute on its own line as Name=Value, for example Color=Blue.');
    }
    return { name: line.slice(0, split).trim(), value: line.slice(split + 1).trim() };
  });
  if (!attributes.length) throw new Error('Add at least one variant attribute, such as Color=Blue.');
  if (attributes.length > 12) throw new Error('A variant can have at most 12 attributes.');
  return attributes;
}

function blank(defaultTaxRateId = ''): Draft {
  return {
    itemId:
      '',
    itemType:
      'product',
    name:
      '',
    sku:
      '',
    description:
      '',
    unit:
      'unit',
    unitPrice:
      '',
    taxRateId:
      defaultTaxRateId,
  };
}

function fromItem(
  item:
    Item,
): Draft {
  return {
    itemId:
      item.id,
    itemType:
      item.itemType,
    name:
      item.name,
    sku:
      item.sku ||
      '',
    description:
      item.description ||
      '',
    unit:
      item.unit,
    unitPrice:
      String(
        item.unitPrice,
      ),
    taxRateId:
      item.taxRateId ||
      '',
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
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell.replace(/\r$/, ''));
  if (row.some(value => value.trim())) rows.push(row);
  if (quoted) throw new Error('The CSV file has an unclosed quoted field.');
  return rows;
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}


export default function SalesProductCatalogueManager({
  data,
  busy,
  request,
  showSuccess,
  showError,
}: {
  data:
    SalesWorkspaceData;
  busy:
    boolean;
  request:
    (
      payload:
        Record<
          string,
          unknown
        >,
    ) =>
      Promise<
        Record<
          string,
          unknown
        >
      >;
  showSuccess:
    (
      title:
        string,
      message:
        string,
    ) =>
      void;
  showError:
    (
      title:
        string,
      message:
        string,
    ) =>
      void;
}) {
  const router = useRouter();
  const defaultTaxRateId = data.taxRates.find(rate => rate.isDefault)?.id || '';
  const [
    items,
    setItems,
  ] =
    useState(
      data.catalogItems,
    );

  useEffect(() => {
    setItems(data.catalogItems);
  }, [data.catalogItems]);

  const [
    importing,
    setImporting,
  ] = useState(false);

  const [
    query,
    setQuery,
  ] =
    useState('');

  const [
    draft,
    setDraft,
  ] =
    useState<Draft>(
      blank(defaultTaxRateId),
    );

  const [
    variantDraft,
    setVariantDraft,
  ] = useState<VariantDraft>(blankVariant());

  const editing =
    Boolean(
      draft.itemId,
    );

  const selectedBaseItem = draft.itemId
    ? items.find(item => item.id === draft.itemId && !item.isVariant)
    : undefined;
  const variantsForSelected = selectedBaseItem?.itemType === 'product'
    ? items.filter(item => item.isVariant && item.baseCatalogItemId === selectedBaseItem.id)
    : [];

  const visible =
    useMemo(
      () => {
        const value =
          query
            .trim()
            .toLowerCase();

        if (!value) {
          return items.filter(item => !item.isVariant);
        }

        return items.filter(
          item =>
            !item.isVariant &&
            [
              item.name,
              item.sku,
              item.description,
              item.itemType,
            ]
              .filter(
                Boolean,
              )
              .join(
                ' ',
              )
              .toLowerCase()
              .includes(
                value,
              ),
        );
      },
      [
        items,
        query,
      ],
    );

  function set(
    key:
      keyof Draft,
    value:
      string,
  ) {
    setDraft(
      current => ({
        ...current,
        [key]:
          value,
      }),
    );
  }

  async function save() {
    if (
      !draft.name.trim()
    ) {
      showError(
        'Item name required',
        'Enter a product or service name.',
      );
      return;
    }

    try {
      const result =
        await request({
          action:
            editing
              ? 'update_catalog_item'
              : 'create_catalog_item',
          itemId:
            draft.itemId ||
            undefined,
          itemType:
            draft.itemType,
          name:
            draft.name,
          sku:
            draft.sku,
          description:
            draft.description,
          unit:
            draft.unit,
          unitPrice:
            draft.unitPrice,
          taxRateId:
            draft.taxRateId ||
            undefined,
        });

      const id =
        String(
          result.id ||
          draft.itemId ||
          '',
        );

      if (
        !id
      ) {
        throw new Error(
          'SaMi did not return the saved catalogue item.',
        );
      }

      const previous =
        items.find(
          item =>
            item.id ===
            id,
        );
      const selectedTax = data.taxRates.find(rate => rate.id === draft.taxRateId);
      const keptExistingTax = draft.taxRateId && draft.taxRateId === previous?.taxRateId;

      const next: Item = {
        id,
        itemType:
          draft.itemType,
        name:
          draft.name.trim(),
        sku:
          draft.sku.trim() ||
          null,
        description:
          draft.description.trim() ||
          null,
        unit:
          draft.unit.trim() ||
          'unit',
        unitPrice:
          Number(
            draft.unitPrice ||
            0,
          ),
        taxRateId:
          draft.taxRateId ||
          null,
        taxName:
          selectedTax?.name ||
          (keptExistingTax ? previous?.taxName : null) ||
          null,
        taxRate:
          selectedTax?.rate ??
          (keptExistingTax ? previous?.taxRate : 0) ??
          0,
        unitCost:
          previous?.unitCost ??
          null,
        isVariant: false,
        variantId: null,
        baseCatalogItemId: null,
        baseProductName: null,
        variantLabel: null,
        variantAttributes: [],
      };

      setItems(
        current => [
          next,
          ...current.filter(
            item =>
              item.id !==
              id,
          ),
        ],
      );

      setDraft(blank(defaultTaxRateId));
      setVariantDraft(blankVariant());

      showSuccess(
        editing
          ? 'Catalogue item updated'
          : 'Catalogue item created',
        'The shared product master is ready for Sales quotations and Invoicing.',
      );
      router.refresh();
    } catch (
      error
    ) {
      showError(
        'Catalogue item could not be saved',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not save the catalogue item.',
      );
    }
  }


  async function saveVariant() {
    if (!selectedBaseItem || selectedBaseItem.itemType !== 'product') {
      showError('Select a base product', 'Product variants can only be created from an active product.');
      return;
    }
    if (!variantDraft.sku.trim()) {
      showError('Variant SKU required', 'Enter a unique SKU for this variant.');
      return;
    }
    let attributes: Array<{ name: string; value: string }>;
    try {
      attributes = parseVariantAttributes(variantDraft.attributes);
    } catch (error) {
      showError('Variant attributes required', error instanceof Error ? error.message : 'Check the variant attributes.');
      return;
    }

    try {
      const result = await request({
        action: variantDraft.variantId ? 'update_product_variant' : 'create_product_variant',
        ...(variantDraft.variantId ? { variantId: variantDraft.variantId } : { baseCatalogItemId: selectedBaseItem.id }),
        sku: variantDraft.sku.trim(),
        attributes,
        ...(variantDraft.unitPrice.trim() ? { unitPrice: variantDraft.unitPrice } : {}),
        ...(data.capabilities.canManageMargin && variantDraft.unitCost.trim() ? { unitCost: variantDraft.unitCost } : {}),
      });
      if (!result.catalogItemId && !result.id) {
        throw new Error('SaMi did not return the saved variant catalogue item.');
      }
      showSuccess(variantDraft.variantId ? 'Product variant updated' : 'Product variant created', 'The variant has its own SKU and catalogue identity for quotations, orders and invoices.');
      setVariantDraft(blankVariant(String(selectedBaseItem.unitPrice)));
      router.refresh();
    } catch (error) {
      showError('Product variant could not be saved', error instanceof Error ? error.message : 'SaMi could not save the product variant.');
    }
  }

  async function archiveVariant(item: Item) {
    if (!item.variantId) {
      showError('Variant could not be archived', 'The variant record identifier is missing.');
      return;
    }
    if (!window.confirm('Archive variant ' + (item.sku || item.name) + '? It will no longer be available for new quotations, but historical documents remain unchanged.')) return;
    try {
      await request({ action: 'archive_product_variant', variantId: item.variantId });
      setItems(current => current.filter(candidate => candidate.id !== item.id));
      if (variantDraft.variantId === item.variantId) setVariantDraft(blankVariant(String(selectedBaseItem?.unitPrice || '')));
      showSuccess('Product variant archived', 'Historical quotation and order lines retain their saved snapshots.');
      router.refresh();
    } catch (error) {
      showError('Product variant could not be archived', error instanceof Error ? error.message : 'SaMi could not archive the product variant.');
    }
  }

  function exportCatalogue() {
    const rows = items;
    downloadCsv('sami-sales-catalogue.csv', [
      ['name', 'itemType', 'sku', 'description', 'unit', 'unitPrice', 'taxRateId', 'baseProductSku', 'variantAttributes', 'unitCost'],
      ...rows.map(item => {
        const base = item.isVariant
          ? items.find(candidate => candidate.id === item.baseCatalogItemId)
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
  }

  async function importCatalogue(file: File) {
    if (!data.capabilities.canManageCatalog) {
      showError('Catalogue permission required', 'You need catalogue-management permission to import products.');
      return;
    }
    setImporting(true);
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error('The CSV must include a header row and at least one product row.');
      if (rows.length - 1 > 200) throw new Error('Import is limited to 200 product rows per file.');
      const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[ _-]/g, '');
      const headers = rows[0].map(normalizeHeader);
      const column = (...names: string[]) => headers.findIndex(header => names.includes(header));
      const nameColumn = column('name', 'productname', 'itemname');
      if (nameColumn < 0) throw new Error('The CSV needs a name or productName column.');
      const val = (row: string[], index: number) => index < 0 ? '' : row[index]?.trim() || '';
      const itemsToImport = rows.slice(1).map(row => ({
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
      const result = await request({ action: 'bulk_import_catalog_items', items: itemsToImport }) as {
        total?: number; created?: number; failed?: number; results?: Array<{ row?: number; success?: boolean; error?: string; name?: string }>;
      };
      const created = Number(result.created || 0);
      const failed = Number(result.failed || 0);
      const failures = (result.results || []).filter(item => item.success === false).slice(0, 3);
      const details = failures.map(item => 'Row ' + String(item.row || '?') + ': ' + String(item.error || 'Import failed')).join(' · ');
      const summary = created + ' created; ' + failed + ' failed.' + (details ? ' ' + details : '');
      if (created === 0 && failed > 0) showError('Catalogue import needs attention', summary);
      else showSuccess('Catalogue import finished', summary);
      router.refresh();
    } catch (error) {
      showError('Catalogue import failed', error instanceof Error ? error.message : 'SaMi could not read that CSV file.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="sami-surface rounded-[24px] p-4 sm:p-5">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
          Roadmap Part 7
        </p>
        <h2 className="mt-1 text-xl font-black">
          Product catalogue
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Maintain the shared product and service catalogue from Sales. The same item identity is reused by quotations and downstream invoices.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="sami-surface rounded-[24px] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-500">Import or export catalogue data</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={exportCatalogue} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--sami-border)] px-2.5 text-xs font-bold"><Download className="h-3.5 w-3.5" /> Export CSV</button>
              <label className={['inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--sami-border)] px-2.5 text-xs font-bold', importing || busy || !data.capabilities.canManageCatalog ? 'pointer-events-none opacity-50' : ''].join(' ')}>
                <Upload className="h-3.5 w-3.5" /> {importing ? 'Importing…' : 'Import CSV'}
                <input type="file" accept=".csv,text/csv" disabled={importing || busy || !data.capabilities.canManageCatalog} className="sr-only" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void importCatalogue(file); }} />
              </label>
            </div>
          </div>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400"
            />
            <input
              value={
                query
              }
              onChange={
                event =>
                  setQuery(
                    event.target.value,
                  )
              }
              placeholder="Search products, services or SKU"
              className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent pl-9 pr-3 text-sm"
            />
          </div>

          <div className="mt-3 max-h-[680px] space-y-2 overflow-y-auto">
            {
              visible.length ===
                0
                ? (
                    <div className="rounded-xl border border-dashed border-[var(--sami-border)] p-5 text-sm text-slate-500">
                      No catalogue items match this view.
                    </div>
                  )
                : visible.map(
                    item => (
                      <button
                        type="button"
                        key={
                          item.id
                        }
                        onClick={() => {
                          setDraft(fromItem(item));
                          setVariantDraft(blankVariant(String(item.unitPrice)));
                        }}
                        className="w-full rounded-2xl border border-[var(--sami-border)] p-3 text-left transition hover:bg-slate-500/[0.04]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Box
                                className="h-4 w-4 shrink-0"
                              />
                              <p className="truncate text-sm font-black">
                                {
                                  item.name
                                }
                              </p>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              {
                                [
                                  item.itemType,
                                  item.sku,
                                  item.unit,
                                  item.taxName,
                                ]
                                  .filter(
                                    Boolean,
                                  )
                                  .join(
                                    ' · ',
                                  )
                              }
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <p className="text-sm font-black">
                              {
                                new Intl.NumberFormat(
                                  'en-KE',
                                  {
                                    style:
                                      'currency',
                                    currency:
                                      data.company.currency,
                                    maximumFractionDigits:
                                      2,
                                  },
                                ).format(
                                  item.unitPrice,
                                )
                              }
                            </p>
                            <Pencil
                              className="h-3.5 w-3.5 text-slate-400"
                            />
                          </div>
                        </div>
                      </button>
                    ),
                  )
            }
          </div>
        </div>

        <div className="sami-surface rounded-[24px] p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black">
              {
                editing
                  ? 'Edit catalogue item'
                  : 'New catalogue item'
              }
            </h3>
            {
              data.capabilities
                .canManageCatalog &&
              (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(blank(defaultTaxRateId));
                    setVariantDraft(blankVariant());
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
                >
                  <Plus
                    className="h-4 w-4"
                  />
                  New
                </button>
              )
            }
          </div>

          {
            data.capabilities
              .canManageCatalog
              ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Select
                      label="Type"
                      value={
                        draft.itemType
                      }
                      onChange={
                        value =>
                          set(
                            'itemType',
                            value,
                          )
                      }
                    />
                    <Field
                      label="Name"
                      value={
                        draft.name
                      }
                      onChange={
                        value =>
                          set(
                            'name',
                            value,
                          )
                      }
                    />
                    <Field
                      label="SKU"
                      value={
                        draft.sku
                      }
                      onChange={
                        value =>
                          set(
                            'sku',
                            value,
                          )
                      }
                    />
                    <Field
                      label="Unit"
                      value={
                        draft.unit
                      }
                      onChange={
                        value =>
                          set(
                            'unit',
                            value,
                          )
                      }
                    />
                    <Field
                      label="Unit price"
                      type="number"
                      value={
                        draft.unitPrice
                      }
                      onChange={
                        value =>
                          set(
                            'unitPrice',
                            value,
                          )
                      }
                    />
                    <label className="block">
                      <span className="text-xs font-black">Tax rate</span>
                      <select
                        value={draft.taxRateId}
                        onChange={event => set('taxRateId', event.target.value)}
                        className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                      >
                        <option value="">No tax</option>
                        {draft.taxRateId && !data.taxRates.some(rate => rate.id === draft.taxRateId) ? (
                          <option value={draft.taxRateId}>
                            Existing tax: {items.find(item => item.id === draft.itemId)?.taxName || 'unavailable rate'}
                          </option>
                        ) : null}
                        {data.taxRates.map(rate => (
                          <option key={rate.id} value={rate.id}>
                            {rate.name} · {rate.rate}%{rate.priceIncluded ? ' (included)' : ''}{rate.isDefault ? ' · default' : ''}
                          </option>
                        ))}
                      </select>
                      <span className="mt-1 block text-xs text-slate-500">
                        Tax is taken from the company’s shared Invoicing tax configuration and recalculated on quotations.
                      </span>
                    </label>
                    <div className="sm:col-span-2">
                      <label className="block">
                        <span className="text-xs font-black">
                          Description
                        </span>
                        <textarea
                          value={
                            draft.description
                          }
                          rows={
                            4
                          }
                          onChange={
                            event =>
                              set(
                                'description',
                                event.target.value,
                              )
                          }
                          className="mt-1 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                    <div className="flex gap-2 sm:col-span-2">
                      <button
                        type="button"
                        disabled={
                          busy
                        }
                        onClick={
                          save
                        }
                        className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
                      >
                        {
                          editing
                            ? 'Save item'
                            : 'Create item'
                        }
                      </button>
                      <button
                        type="button"
                        disabled={
                          busy
                        }
                        onClick={() => {
                          setDraft(blank(defaultTaxRateId));
                          setVariantDraft(blankVariant());
                        }}
                        className="h-10 rounded-xl border border-[var(--sami-border)] px-4 text-xs font-black disabled:opacity-60"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )
              : (
                  <div className="mt-4 rounded-xl border border-dashed border-[var(--sami-border)] p-5 text-sm text-slate-500">
                    You can use catalogue items in quotations, but catalogue-management permission is required to create or edit them.
                  </div>
                )
          }
        </div>
      </div>

      {selectedBaseItem && selectedBaseItem.itemType === 'product' && data.capabilities.canManageCatalog ? (
        <section className="sami-surface space-y-4 rounded-[24px] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Product variants</p>
              <h3 className="mt-1 text-lg font-black">{selectedBaseItem.name}</h3>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">Create SKU-level variants such as colour, size or packaging. Each variant becomes a shared catalogue item so quotes, orders and invoices keep the selected SKU.</p>
            </div>
            <button
              type="button"
              onClick={() => setVariantDraft(blankVariant(String(selectedBaseItem.unitPrice)))}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
            >
              <Plus className="h-4 w-4" /> New variant
            </button>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl border border-[var(--sami-border)] p-3">
              <h4 className="text-sm font-black">{variantDraft.variantId ? 'Edit variant' : 'Create variant'}</h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Variant SKU" value={variantDraft.sku} onChange={value => setVariantDraft(current => ({ ...current, sku: value }))} />
                <Field label="Unit price" type="number" value={variantDraft.unitPrice} onChange={value => setVariantDraft(current => ({ ...current, unitPrice: value }))} />
                {data.capabilities.canManageMargin ? (
                  <Field label="Unit cost (restricted)" type="number" value={variantDraft.unitCost} onChange={value => setVariantDraft(current => ({ ...current, unitCost: value }))} />
                ) : null}
                <label className="block sm:col-span-2">
                  <span className="text-xs font-black">Attributes (one per line)</span>
                  <textarea
                    value={variantDraft.attributes}
                    onChange={event => setVariantDraft(current => ({ ...current, attributes: event.target.value }))}
                    placeholder={'Color=Blue\nSize=Large'}
                    rows={4}
                    className="mt-1 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <button type="button" disabled={busy || importing} onClick={() => void saveVariant()} className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60">
                    {variantDraft.variantId ? 'Save variant' : 'Create variant'}
                  </button>
                  <button type="button" disabled={busy || importing} onClick={() => setVariantDraft(blankVariant(String(selectedBaseItem.unitPrice)))} className="h-10 rounded-xl border border-[var(--sami-border)] px-4 text-xs font-black disabled:opacity-60">
                    Clear
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-black">Active variants ({variantsForSelected.length})</h4>
              {variantsForSelected.length ? variantsForSelected.map(item => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--sami-border)] p-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-black">{item.variantLabel || item.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{[item.sku, item.variantAttributes.map(attribute => attribute.name + ': ' + attribute.value).join(' · ')].filter(Boolean).join(' · ')}</p>
                    <p className="mt-1 text-sm font-bold">{new Intl.NumberFormat('en-KE', { style: 'currency', currency: data.company.currency, maximumFractionDigits: 2 }).format(item.unitPrice)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy || importing} onClick={() => setVariantDraft(variantFromItem(item))} className="h-9 rounded-lg border border-[var(--sami-border)] px-3 text-xs font-bold disabled:opacity-60">Edit</button>
                    <button type="button" disabled={busy || importing} onClick={() => void archiveVariant(item)} className="h-9 rounded-lg border border-red-300 px-3 text-xs font-bold text-red-600 disabled:opacity-60">Archive</button>
                  </div>
                </div>
              )) : (
                <div className="rounded-xl border border-dashed border-[var(--sami-border)] p-5 text-sm text-slate-500">No active variants yet. Add the first SKU above.</div>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}


function Field({
  label,
  value,
  onChange,
  type =
    'text',
}: {
  label:
    string;
  value:
    string;
  onChange:
    (
      value:
        string,
    ) =>
      void;
  type?:
    string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black">
        {
          label
        }
      </span>
      <input
        type={
          type
        }
        value={
          value
        }
        onChange={
          event =>
            onChange(
              event.target.value,
            )
        }
        className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
      />
    </label>
  );
}


function Select({
  label,
  value,
  onChange,
}: {
  label:
    string;
  value:
    string;
  onChange:
    (
      value:
        string,
    ) =>
      void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black">
        {
          label
        }
      </span>
      <select
        value={
          value
        }
        onChange={
          event =>
            onChange(
              event.target.value,
            )
        }
        className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
      >
        <option value="product">
          Product
        </option>
        <option value="service">
          Service
        </option>
      </select>
    </label>
  );
}
