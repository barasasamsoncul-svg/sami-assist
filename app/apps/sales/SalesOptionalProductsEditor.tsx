'use client';

import {
  useState,
} from 'react';

import {
  Plus,
  Trash2,
} from 'lucide-react';

import type {
  SalesQuoteDetail,
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';

type OptionalDraft = {
  key: string;
  catalogItemId: string;
  description: string;
  sku: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  taxName: string;
  taxRate: string;
};

function key() {
  return globalThis.crypto
    ?.randomUUID?.() ||
    Math.random()
      .toString(36)
      .slice(2);
}

function blank():
  OptionalDraft {
  return {
    key:
      key(),
    catalogItemId:
      '',
    description:
      '',
    sku:
      '',
    unit:
      'unit',
    quantity:
      '1',
    unitPrice:
      '0',
    taxName:
      '',
    taxRate:
      '0',
  };
}

export default function SalesOptionalProductsEditor({
  quote,
  workspace,
  busy,
  onSave,
}: {
  quote:
    SalesQuoteDetail;
  workspace:
    SalesWorkspaceData;
  busy:
    boolean;
  onSave:
    (
      items:
        Array<
          Record<
            string,
            unknown
          >
        >,
    ) =>
      Promise<boolean>;
}) {
  const [
    items,
    setItems,
  ] =
    useState<
      OptionalDraft[]
    >(
      quote.optionalItems
        .map(
          item => ({
            key:
              item.id,
            catalogItemId:
              item.catalogItemId ||
              '',
            description:
              item.description,
            sku:
              item.sku ||
              '',
            unit:
              item.unit,
            quantity:
              String(
                item.quantity,
              ),
            unitPrice:
              String(
                item.unitPrice,
              ),
            taxName:
              item.taxName ||
              '',
            taxRate:
              String(
                item.taxRate,
              ),
          }),
        ),
    );

  function patch(
    index:
      number,
    next:
      Partial<
        OptionalDraft
      >,
  ) {
    setItems(
      current =>
        current.map(
          (
            item,
            position,
          ) =>
            position ===
              index
              ? {
                  ...item,
                  ...next,
                }
              : item,
        ),
    );
  }

  function chooseCatalog(
    index:
      number,
    id:
      string,
  ) {
    const product =
      workspace
        .catalogItems
        .find(
          item =>
            item.id ===
            id,
        );

    if (
      !product
    ) {
      patch(
        index,
        {
          catalogItemId:
            '',
        },
      );

      return;
    }

    patch(
      index,
      {
        catalogItemId:
          product.id,
        description:
          product.description ||
          product.name,
        sku:
          product.sku ||
          '',
        unit:
          product.unit ||
          'unit',
        unitPrice:
          String(
            product.unitPrice,
          ),
        taxName:
          product.taxName ||
          '',
        taxRate:
          String(
            product.taxRate,
          ),
      },
    );
  }

  async function submit(
    event:
      React.FormEvent<
        HTMLFormElement
      >,
  ) {
    event.preventDefault();

    await onSave(
      items.map(
        item => ({
          catalogItemId:
            item.catalogItemId ||
            undefined,
          description:
            item.description,
          sku:
            item.sku ||
            undefined,
          unit:
            item.unit,
          quantity:
            Number(
              item.quantity,
            ),
          unitPrice:
            Number(
              item.unitPrice,
            ),
          taxName:
            item.taxName ||
            undefined,
          taxRate:
            Number(
              item.taxRate,
            ),
        }),
      ),
    );
  }

  return (
    <form
      onSubmit={
        submit
      }
      className="sami-surface rounded-[24px] p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
            Upsell
          </p>
          <h2 className="mt-1 text-sm font-black">
            Optional products
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Add accessories, upgrades or services without changing the quotation total until the customer selects them.
          </p>
        </div>

        <button
          type="button"
          onClick={
            () =>
              setItems(
                current => [
                  ...current,
                  blank(),
                ],
              )
          }
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {
          items.length ===
            0
            ? (
                <div className="rounded-xl border border-dashed border-[var(--sami-border)] p-4 text-xs text-slate-500">
                  No optional products yet.
                </div>
              )
            : items.map(
                (
                  item,
                  index,
                ) => (
                  <div
                    key={
                      item.key
                    }
                    className="rounded-2xl border border-[var(--sami-border)] p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black">
                        Option {
                          index +
                          1
                        }
                      </p>
                      <button
                        type="button"
                        onClick={
                          () =>
                            setItems(
                              current =>
                                current.filter(
                                  (
                                    _item,
                                    position,
                                  ) =>
                                    position !==
                                      index,
                                ),
                            )
                        }
                        className="rounded-lg p-2 text-red-600 hover:bg-red-500/10"
                        aria-label="Remove optional product"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {
                        workspace
                          .capabilities
                          .canUseCatalog &&
                        workspace
                          .catalogItems
                          .length >
                          0 &&
                        (
                          <label className="sm:col-span-2 xl:col-span-4">
                            <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                              Catalog item
                            </span>
                            <select
                              value={
                                item.catalogItemId
                              }
                              onChange={
                                event =>
                                  chooseCatalog(
                                    index,
                                    event.target.value,
                                  )
                              }
                              className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                            >
                              <option value="">
                                Custom optional product
                              </option>
                              {
                                workspace
                                  .catalogItems
                                  .map(
                                    product => (
                                      <option
                                        key={
                                          product.id
                                        }
                                        value={
                                          product.id
                                        }
                                      >
                                        {
                                          product.name
                                        }
                                      </option>
                                    ),
                                  )
                              }
                            </select>
                          </label>
                        )
                      }

                      <Field
                        label="Description"
                        value={
                          item.description
                        }
                        onChange={
                          value =>
                            patch(
                              index,
                              {
                                description:
                                  value,
                              },
                            )
                        }
                        required
                      />
                      <Field
                        label="Quantity"
                        type="number"
                        value={
                          item.quantity
                        }
                        onChange={
                          value =>
                            patch(
                              index,
                              {
                                quantity:
                                  value,
                              },
                            )
                        }
                      />
                      <Field
                        label="Unit"
                        value={
                          item.unit
                        }
                        onChange={
                          value =>
                            patch(
                              index,
                              {
                                unit:
                                  value,
                              },
                            )
                        }
                      />
                      <Field
                        label="Unit price"
                        type="number"
                        value={
                          item.unitPrice
                        }
                        onChange={
                          value =>
                            patch(
                              index,
                              {
                                unitPrice:
                                  value,
                              },
                            )
                        }
                      />
                      <Field
                        label="Tax %"
                        type="number"
                        value={
                          item.taxRate
                        }
                        onChange={
                          value =>
                            patch(
                              index,
                              {
                                taxRate:
                                  value,
                              },
                            )
                        }
                      />
                    </div>
                  </div>
                ),
              )
        }
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={
            busy
          }
          className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
        >
          Save optional products
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type =
    'text',
  required =
    false,
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
  required?:
    boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
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
        required={
          required
        }
        min={
          type ===
            'number'
            ? '0'
            : undefined
        }
        step={
          type ===
            'number'
            ? '0.01'
            : undefined
        }
        className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
      />
    </label>
  );
}
