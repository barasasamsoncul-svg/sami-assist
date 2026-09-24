'use client';

import {
  useMemo,
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


type DraftLine = {
  key: string;
  catalogItemId: string;
  description: string;
  sku: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  discountType:
    'percent' |
    'fixed';
  discountValue: string;
  taxName: string;
  taxRate: string;
};


function newKey() {
  return (
    globalThis.crypto
      ?.randomUUID?.() ||
    Math.random()
      .toString(36)
      .slice(2)
  );
}


function blankLine():
  DraftLine {
  return {
    key:
      newKey(),
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
    discountType:
      'percent',
    discountValue:
      '0',
    taxName:
      '',
    taxRate:
      '0',
  };
}


function formatMoney(
  value:
    number,
  currency:
    string,
) {
  try {
    return new Intl
      .NumberFormat(
        'en-KE',
        {
          style:
            'currency',
          currency,
          maximumFractionDigits:
            2,
        },
      )
      .format(
        value,
      );
  } catch {
    return (
      currency +
      ' ' +
      value.toLocaleString()
    );
  }
}


export default function SalesQuoteComposer({
  data,
  initialQuote =
    null,
  busy,
  onSave,
  onCancel,
}: {
  data:
    SalesWorkspaceData;
  initialQuote?:
    SalesQuoteDetail |
    null;
  busy:
    boolean;
  onSave:
    (
      payload:
        Record<
          string,
          unknown
        >,
    ) =>
      Promise<boolean>;
  onCancel:
    () => void;
}) {
  const [
    customerId,
    setCustomerId,
  ] =
    useState(
      initialQuote
        ?.billingCustomerId ||
      '',
    );

  const [
    customerName,
    setCustomerName,
  ] =
    useState(
      initialQuote
        ?.customerName ||
      '',
    );

  const [
    customerEmail,
    setCustomerEmail,
  ] =
    useState(
      initialQuote
        ?.customerEmail ||
      '',
    );

  const [
    customerPhone,
    setCustomerPhone,
  ] =
    useState(
      initialQuote
        ?.customerPhone ||
      '',
    );

  const [
    billingAddress,
    setBillingAddress,
  ] =
    useState(
      initialQuote
        ?.billingAddress ||
      '',
    );

  const [
    shippingAddress,
    setShippingAddress,
  ] =
    useState(
      initialQuote
        ?.shippingAddress ||
      '',
    );

  const [
    reference,
    setReference,
  ] =
    useState(
      initialQuote
        ?.reference ||
      '',
    );

  const [
    currency,
    setCurrency,
  ] =
    useState(
      initialQuote
        ?.currency ||
      data.settings
        .defaultCurrency ||
      data.company
        .currency,
    );

  const [
    quoteDate,
    setQuoteDate,
  ] =
    useState(
      initialQuote
        ?.quoteDate ||
      new Date()
        .toISOString()
        .slice(
          0,
          10,
        ),
    );

  const [
    validUntil,
    setValidUntil,
  ] =
    useState(
      initialQuote
        ?.validUntil ||
      new Date(
        Date.now() +
        data.settings
          .defaultValidityDays *
        86400000,
      )
        .toISOString()
        .slice(
          0,
          10,
        ),
    );

  const [
    shippingTotal,
    setShippingTotal,
  ] =
    useState(
      String(
        initialQuote
          ?.shippingTotal ||
        0,
      ),
    );

  const [
    notes,
    setNotes,
  ] =
    useState(
      initialQuote
        ?.notes ||
      data.settings
        .defaultNotes ||
      '',
    );

  const [
    terms,
    setTerms,
  ] =
    useState(
      initialQuote
        ?.terms ||
      data.settings
        .termsAndConditions ||
      '',
    );

  const [
    internalNotes,
    setInternalNotes,
  ] =
    useState(
      initialQuote
        ?.internalNotes ||
      '',
    );

  const [
    templateId,
    setTemplateId,
  ] =
    useState(
      data.templates
        .find(
          item =>
            item.isDefault,
        )
        ?.id ||
      data.templates[0]
        ?.id ||
      '',
    );

  const [
    lines,
    setLines,
  ] =
    useState<
      DraftLine[]
    >(
      initialQuote
        ?.lines
        .map(
          line => ({
            key:
              line.id,
            catalogItemId:
              line.catalogItemId ||
              '',
            description:
              line.description,
            sku:
              line.sku ||
              '',
            unit:
              line.unit,
            quantity:
              String(
                line.quantity,
              ),
            unitPrice:
              String(
                line.unitPrice,
              ),
            discountType:
              line.discountType,
            discountValue:
              String(
                line.discountValue,
              ),
            taxName:
              line.taxName ||
              '',
            taxRate:
              String(
                line.taxRate,
              ),
          }),
        ) ||
      [
        blankLine(),
      ],
    );

  const totals =
    useMemo(
      () => {
        let subtotal =
          0;

        let discount =
          0;

        let tax =
          0;

        for (
          const line
          of lines
        ) {
          const qty =
            Math.max(
              0,
              Number(
                line.quantity,
              ) ||
              0,
            );

          const price =
            Math.max(
              0,
              Number(
                line.unitPrice,
              ) ||
              0,
            );

          const base =
            qty *
            price;

          const discountValue =
            Math.max(
              0,
              Number(
                line.discountValue,
              ) ||
              0,
            );

          const discountAmount =
            line.discountType ===
              'fixed'
              ? Math.min(
                  base,
                  discountValue,
                )
              : base *
                Math.min(
                  100,
                  discountValue,
                ) /
                100;

          const taxable =
            Math.max(
              0,
              base -
              discountAmount,
            );

          subtotal +=
            base;

          discount +=
            discountAmount;

          tax +=
            taxable *
            Math.min(
              100,
              Math.max(
                0,
                Number(
                  line.taxRate,
                ) ||
                0,
              ),
            ) /
            100;
        }

        const shipping =
          Math.max(
            0,
            Number(
              shippingTotal,
            ) ||
            0,
          );

        return {
          subtotal,
          discount,
          tax,
          shipping,
          total:
            subtotal -
            discount +
            tax +
            shipping,
        };
      },
      [
        lines,
        shippingTotal,
      ],
    );

  function patchLine(
    index:
      number,
    patch:
      Partial<DraftLine>,
  ) {
    setLines(
      current =>
        current.map(
          (
            line,
            currentIndex,
          ) =>
            currentIndex ===
              index
              ? {
                  ...line,
                  ...patch,
                }
              : line,
        ),
    );
  }

  function selectCatalog(
    index:
      number,
    value:
      string,
  ) {
    const item =
      data.catalogItems
        .find(
          candidate =>
            candidate.id ===
            value,
        );

    if (
      !item
    ) {
      patchLine(
        index,
        {
          catalogItemId:
            '',
        },
      );

      return;
    }

    patchLine(
      index,
      {
        catalogItemId:
          item.id,
        description:
          item.description ||
          item.name,
        sku:
          item.sku ||
          '',
        unit:
          item.unit ||
          'unit',
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

    await onSave({
      action:
        initialQuote
          ? 'update_quote'
          : 'create_quote',
      quoteId:
        initialQuote
          ?.id,
      billingCustomerId:
        customerId ||
        undefined,
      templateId:
        templateId ||
        undefined,
      quoteDate,
      validUntil,
      currency,
      reference,
      customerName:
        customerId
          ? undefined
          : customerName,
      customerEmail:
        customerId
          ? undefined
          : customerEmail,
      customerPhone:
        customerId
          ? undefined
          : customerPhone,
      billingAddress:
        customerId
          ? undefined
          : billingAddress,
      shippingAddress:
        customerId
          ? undefined
          : shippingAddress,
      shippingTotal:
        Number(
          shippingTotal,
        ),
      notes,
      terms,
      internalNotes,
      lines:
        lines.map(
          line => ({
            catalogItemId:
              line.catalogItemId ||
              undefined,
            description:
              line.description,
            sku:
              line.sku ||
              undefined,
            unit:
              line.unit,
            quantity:
              Number(
                line.quantity,
              ),
            unitPrice:
              Number(
                line.unitPrice,
              ),
            discountType:
              line.discountType,
            discountValue:
              Number(
                line.discountValue,
              ),
            taxName:
              line.taxName ||
              undefined,
            taxRate:
              Number(
                line.taxRate,
              ),
          }),
        ),
    });
  }

  return (
    <form
      onSubmit={
        submit
      }
      className="space-y-5"
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-[22px] border border-[var(--sami-border)] p-4">
          <p className="text-sm font-black">
            Customer
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {
              data.capabilities
                .canUseBillingCustomers &&
              data.billingCustomers
                .length >
                0 &&
              (
                <label className="sm:col-span-2">
                  <Label>
                    Billing customer
                  </Label>
                  <select
                    value={
                      customerId
                    }
                    onChange={
                      event =>
                        setCustomerId(
                          event.target
                            .value,
                        )
                    }
                    className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                  >
                    <option value="">
                      Manual customer
                    </option>
                    {
                      data.billingCustomers.map(
                        item => (
                          <option
                            key={
                              item.id
                            }
                            value={
                              item.id
                            }
                          >
                            {
                              item.name
                            }
                          </option>
                        ),
                      )
                    }
                  </select>
                </label>
              )
            }

            {
              !customerId &&
              <>
                <Input
                  label="Customer name"
                  value={
                    customerName
                  }
                  onChange={
                    setCustomerName
                  }
                  required
                />
                <Input
                  label="Email"
                  value={
                    customerEmail
                  }
                  onChange={
                    setCustomerEmail
                  }
                  type="email"
                />
                <Input
                  label="Phone"
                  value={
                    customerPhone
                  }
                  onChange={
                    setCustomerPhone
                  }
                />
                <Input
                  label="Billing address"
                  value={
                    billingAddress
                  }
                  onChange={
                    setBillingAddress
                  }
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Shipping address"
                    value={
                      shippingAddress
                    }
                    onChange={
                      setShippingAddress
                    }
                  />
                </div>
              </>
            }
          </div>
        </section>

        <section className="rounded-[22px] border border-[var(--sami-border)] p-4">
          <p className="text-sm font-black">
            Quotation details
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input
              label="Quote date"
              type="date"
              value={
                quoteDate
              }
              onChange={
                setQuoteDate
              }
              required
            />
            <Input
              label="Valid until"
              type="date"
              value={
                validUntil
              }
              onChange={
                setValidUntil
              }
              required
            />
            <Input
              label="Currency"
              value={
                currency
              }
              onChange={
                value =>
                  setCurrency(
                    value
                      .toUpperCase()
                      .slice(
                        0,
                        3,
                      ),
                  )
              }
              required
            />
            <Input
              label="Reference"
              value={
                reference
              }
              onChange={
                setReference
              }
            />

            {
              data.templates
                .length >
                0 &&
              (
                <label className="sm:col-span-2">
                  <Label>
                    Template
                  </Label>
                  <select
                    value={
                      templateId
                    }
                    onChange={
                      event =>
                        setTemplateId(
                          event.target
                            .value,
                        )
                    }
                    className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                  >
                    {
                      data.templates.map(
                        template => (
                          <option
                            key={
                              template.id
                            }
                            value={
                              template.id
                            }
                          >
                            {
                              template.name
                            }
                            {
                              template.isDefault
                                ? ' · Default'
                                : ''
                            }
                          </option>
                        ),
                      )
                    }
                  </select>
                </label>
              )
            }
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-[22px] border border-[var(--sami-border)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--sami-border)] p-4">
          <div>
            <p className="text-sm font-black">
              Products & services
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Catalog-linked or custom commercial lines.
            </p>
          </div>

          <button
            type="button"
            onClick={
              () =>
                setLines(
                  current => [
                    ...current,
                    blankLine(),
                  ],
                )
            }
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
          >
            <Plus className="h-4 w-4" />
            Line
          </button>
        </div>

        <div className="space-y-3 p-4">
          {
            lines.map(
              (
                line,
                index,
              ) => (
                <div
                  key={
                    line.key
                  }
                  className="rounded-2xl border border-[var(--sami-border)] p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black">
                      Line {
                        index +
                        1
                      }
                    </p>

                    {
                      lines.length >
                        1 &&
                      (
                        <button
                          type="button"
                          onClick={
                            () =>
                              setLines(
                                current =>
                                  current.filter(
                                    (
                                      _item,
                                      i,
                                    ) =>
                                      i !==
                                      index,
                                  ),
                              )
                          }
                          className="rounded-lg p-2 text-red-600 hover:bg-red-500/10"
                          aria-label="Remove line"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )
                    }
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {
                      data.capabilities
                        .canUseCatalog &&
                      data.catalogItems
                        .length >
                        0 &&
                      (
                        <label className="md:col-span-2">
                          <Label>
                            Catalog item
                          </Label>
                          <select
                            value={
                              line.catalogItemId
                            }
                            onChange={
                              event =>
                                selectCatalog(
                                  index,
                                  event.target
                                    .value,
                                )
                            }
                            className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                          >
                            <option value="">
                              Custom line
                            </option>
                            {
                              data.catalogItems.map(
                                item => (
                                  <option
                                    key={
                                      item.id
                                    }
                                    value={
                                      item.id
                                    }
                                  >
                                    {
                                      item.name
                                    }
                                  </option>
                                ),
                              )
                            }
                          </select>
                        </label>
                      )
                    }

                    <div className="md:col-span-2">
                      <Input
                        label="Description"
                        value={
                          line.description
                        }
                        onChange={
                          value =>
                            patchLine(
                              index,
                              {
                                description:
                                  value,
                              },
                            )
                        }
                        required
                      />
                    </div>

                    <Input
                      label="Quantity"
                      type="number"
                      value={
                        line.quantity
                      }
                      onChange={
                        value =>
                          patchLine(
                            index,
                            {
                              quantity:
                                value,
                            },
                          )
                      }
                    />

                    <Input
                      label="Unit"
                      value={
                        line.unit
                      }
                      onChange={
                        value =>
                          patchLine(
                            index,
                            {
                              unit:
                                value,
                            },
                          )
                      }
                    />

                    <Input
                      label="Unit price"
                      type="number"
                      value={
                        line.unitPrice
                      }
                      onChange={
                        value =>
                          patchLine(
                            index,
                            {
                              unitPrice:
                                value,
                            },
                          )
                      }
                    />

                    <Input
                      label="Tax %"
                      type="number"
                      value={
                        line.taxRate
                      }
                      onChange={
                        value =>
                          patchLine(
                            index,
                            {
                              taxRate:
                                value,
                            },
                          )
                      }
                    />

                    <label>
                      <Label>
                        Discount
                      </Label>
                      <div className="mt-1 flex">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={
                            line.discountValue
                          }
                          onChange={
                            event =>
                              patchLine(
                                index,
                                {
                                  discountValue:
                                    event.target
                                      .value,
                                },
                              )
                          }
                          className="h-11 min-w-0 flex-1 rounded-l-xl border border-r-0 border-[var(--sami-border)] bg-transparent px-3 text-sm"
                        />
                        <select
                          value={
                            line.discountType
                          }
                          onChange={
                            event =>
                              patchLine(
                                index,
                                {
                                  discountType:
                                    event.target
                                      .value ===
                                      'fixed'
                                      ? 'fixed'
                                      : 'percent',
                                },
                              )
                          }
                          className="h-11 rounded-r-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs font-black"
                        >
                          <option value="percent">
                            %
                          </option>
                          <option value="fixed">
                            Fixed
                          </option>
                        </select>
                      </div>
                    </label>

                    <Input
                      label="SKU"
                      value={
                        line.sku
                      }
                      onChange={
                        value =>
                          patchLine(
                            index,
                            {
                              sku:
                                value,
                            },
                          )
                      }
                    />

                    <Input
                      label="Tax name"
                      value={
                        line.taxName
                      }
                      onChange={
                        value =>
                          patchLine(
                            index,
                            {
                              taxName:
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
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <section className="rounded-[22px] border border-[var(--sami-border)] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Area
              label="Customer notes"
              value={
                notes
              }
              onChange={
                setNotes
              }
            />
            <Area
              label="Terms & conditions"
              value={
                terms
              }
              onChange={
                setTerms
              }
            />
            <div className="sm:col-span-2">
              <Area
                label="Internal notes"
                value={
                  internalNotes
                }
                onChange={
                  setInternalNotes
                }
              />
            </div>
          </div>
        </section>

        <section className="rounded-[22px] border border-[var(--sami-border)] p-4">
          <p className="text-sm font-black">
            Commercial summary
          </p>

          <div className="mt-4 space-y-2 text-sm">
            <Row
              label="Subtotal"
              value={
                formatMoney(
                  totals.subtotal,
                  currency,
                )
              }
            />
            <Row
              label="Discount"
              value={
                '− ' +
                formatMoney(
                  totals.discount,
                  currency,
                )
              }
            />
            <Row
              label="Tax"
              value={
                formatMoney(
                  totals.tax,
                  currency,
                )
              }
            />

            <label className="flex items-center justify-between gap-3">
              <span className="text-slate-500">
                Shipping
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  shippingTotal
                }
                onChange={
                  event =>
                    setShippingTotal(
                      event.target
                        .value,
                    )
                }
                className="h-9 w-32 rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-right"
              />
            </label>

            <div className="flex items-center justify-between border-t border-[var(--sami-border)] pt-3">
              <span className="font-black">
                Total
              </span>
              <span className="text-lg font-black text-blue-700 dark:text-blue-300">
                {
                  formatMoney(
                    totals.total,
                    currency,
                  )
                }
              </span>
            </div>
          </div>
        </section>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={
            onCancel
          }
          className="h-11 rounded-xl border border-[var(--sami-border)] px-5 text-sm font-black"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={
            busy
          }
          className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white disabled:opacity-60"
        >
          {
            initialQuote
              ? 'Save quotation'
              : 'Create quotation'
          }
        </button>
      </div>
    </form>
  );
}


function Label({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
      {
        children
      }
    </span>
  );
}


function Input({
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
      <Label>
        {
          label
        }
      </Label>
      <input
        type={
          type
        }
        value={
          value
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
        onChange={
          event =>
            onChange(
              event.target
                .value,
            )
        }
        className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
      />
    </label>
  );
}


function Area({
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
      <Label>
        {
          label
        }
      </Label>
      <textarea
        rows={
          4
        }
        value={
          value
        }
        onChange={
          event =>
            onChange(
              event.target
                .value,
            )
        }
        className="mt-1 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
      />
    </label>
  );
}


function Row({
  label,
  value,
}: {
  label:
    string;
  value:
    string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">
        {
          label
        }
      </span>
      <span className="font-bold">
        {
          value
        }
      </span>
    </div>
  );
}
