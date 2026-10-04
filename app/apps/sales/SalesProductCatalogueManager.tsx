'use client';

import {
  Box,
  Pencil,
  Plus,
  Search,
} from 'lucide-react';

import {
  useMemo,
  useState,
} from 'react';

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

function blank(): Draft {
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
      '',
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
  const [
    items,
    setItems,
  ] =
    useState(
      data.catalogItems,
    );

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
      blank(),
    );

  const editing =
    Boolean(
      draft.itemId,
    );

  const visible =
    useMemo(
      () => {
        const value =
          query
            .trim()
            .toLowerCase();

        if (
          !value
        ) {
          return items;
        }

        return items.filter(
          item =>
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
          previous?.taxName ||
          null,
        taxRate:
          previous?.taxRate ||
          0,
        unitCost:
          previous?.unitCost ??
          null,
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

      setDraft(
        blank(),
      );

      showSuccess(
        editing
          ? 'Catalogue item updated'
          : 'Catalogue item created',
        'The shared product master is ready for Sales quotations and Invoicing.',
      );
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
                        onClick={
                          () =>
                            setDraft(
                              fromItem(
                                item,
                              ),
                            )
                        }
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
                  onClick={
                    () =>
                      setDraft(
                        blank(),
                      )
                  }
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
                    <div className="rounded-xl border border-[var(--sami-border)] p-3 text-xs text-slate-500">
                      Tax remains linked to the authoritative tax record. Existing item tax: {
                        draft.itemId
                          ? (
                              items.find(
                                item =>
                                  item.id ===
                                  draft.itemId,
                              )?.taxName ||
                              'None'
                            )
                          : 'None'
                      }.
                    </div>
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
                        onClick={
                          () =>
                            setDraft(
                              blank(),
                            )
                        }
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
