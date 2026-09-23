'use client';

import {
  useMemo,
  useState,
} from 'react';

import {
  PackageSearch,
  Plus,
  Receipt,
  Save,
  Trash2,
  UserRound,
} from 'lucide-react';

import type {
  InvoicingInvoiceDetail,
  InvoicingWorkspaceData,
} from '@/lib/apps/invoicing/types';


type ComposerLine = {
  catalogItemId: string;
  description: string;
  sku: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  taxRateId: string;
  taxRate: number;
};

type Submitter = (
  payload: Record<string, unknown>,
  message: string,
) => Promise<void>;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(
  date: string,
  days: number,
) {
  const parsed = new Date(date + 'T00:00:00Z');

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  parsed.setUTCDate(
    parsed.getUTCDate() + days,
  );

  return parsed.toISOString().slice(0, 10);
}

function formatMoney(
  value: number,
  currency: string,
) {
  try {
    return new Intl.NumberFormat(
      'en-KE',
      {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      },
    ).format(value);
  } catch {
    return currency + ' ' + value.toLocaleString();
  }
}

function emptyLine(
  data: InvoicingWorkspaceData,
): ComposerLine {
  const tax =
    data.taxRates.find(
      item => item.isDefault,
    );

  return {
    catalogItemId: '',
    description: '',
    sku: '',
    unit: 'unit',
    quantity: 1,
    unitPrice: 0,
    discountType: 'percent',
    discountValue: 0,
    taxRateId: tax?.id || '',
    taxRate: tax?.rate || 0,
  };
}

function detailLines(
  invoice: InvoicingInvoiceDetail,
): ComposerLine[] {
  return invoice.lines.map(
    line => ({
      catalogItemId:
        line.catalogItemId || '',
      description:
        line.description,
      sku:
        line.sku || '',
      unit:
        line.unit,
      quantity:
        line.quantity,
      unitPrice:
        line.unitPrice,
      discountType:
        line.discountType,
      discountValue:
        line.discountValue,
      taxRateId:
        line.taxRateId || '',
      taxRate:
        line.taxRate,
    }),
  );
}

export default function InvoiceComposer({
  data,
  run,
  invoice = null,
}: {
  data: InvoicingWorkspaceData;
  run: Submitter;
  invoice?: InvoicingInvoiceDetail | null;
}) {
  const editing = Boolean(invoice);

  const initialCustomer =
    invoice
      ? data.customers.find(
          customer =>
            customer.id ===
            invoice.customer.id,
        )
      : null;

  const [
    customerId,
    setCustomerId,
  ] = useState(
    invoice?.customer.id || '',
  );

  const [
    invoiceDate,
    setInvoiceDate,
  ] = useState(
    invoice?.invoiceDate || today(),
  );

  const [
    dueDate,
    setDueDate,
  ] = useState(
    invoice?.dueDate ||
    plusDays(
      today(),
      initialCustomer?.dueDays ??
        data.settings.defaultDueDays,
    ),
  );

  const [
    currency,
    setCurrency,
  ] = useState(
    invoice?.currency ||
      initialCustomer?.currency ||
      data.settings.defaultCurrency ||
      data.company.currency,
  );

  const [
    reference,
    setReference,
  ] = useState(
    invoice?.reference || '',
  );

  const [
    purchaseOrderNumber,
    setPurchaseOrderNumber,
  ] = useState(
    invoice?.purchaseOrderNumber || '',
  );

  const [
    shippingTotal,
    setShippingTotal,
  ] = useState(
    invoice?.shippingTotal || 0,
  );

  const [
    roundingAdjustment,
    setRoundingAdjustment,
  ] = useState(
    invoice?.roundingAdjustment || 0,
  );

  const [
    notes,
    setNotes,
  ] = useState(
    invoice?.notes || '',
  );

  const [
    terms,
    setTerms,
  ] = useState(
    invoice?.terms ||
      data.settings.termsAndConditions ||
      '',
  );

  const [
    lines,
    setLines,
  ] = useState<ComposerLine[]>(
    invoice
      ? detailLines(invoice)
      : [emptyLine(data)],
  );

  const selectedCustomer =
    data.customers.find(
      customer =>
        customer.id ===
        customerId,
    ) || null;

  const taxCalculation =
    invoice?.taxCalculation ||
    (
      data.settings.taxCalculation ===
        'inclusive'
        ? 'inclusive'
        : 'exclusive'
    );

  const lineTotals =
    useMemo(
      () =>
        lines.map(
          line => {
            const gross =
              Math.max(
                0,
                Number(line.quantity || 0) *
                  Number(line.unitPrice || 0),
              );

            const discount =
              line.discountType === 'fixed'
                ? Math.min(
                    gross,
                    Math.max(
                      0,
                      Number(
                        line.discountValue || 0,
                      ),
                    ),
                  )
                : gross *
                  Math.min(
                    100,
                    Math.max(
                      0,
                      Number(
                        line.discountValue || 0,
                      ),
                    ),
                  ) /
                  100;

            const discounted =
              Math.max(
                0,
                gross - discount,
              );

            const rate =
              Math.min(
                100,
                Math.max(
                  0,
                  Number(line.taxRate || 0),
                ),
              );

            const tax =
              taxCalculation ===
                'inclusive' &&
              rate > 0
                ? discounted *
                  rate /
                  (100 + rate)
                : discounted *
                  rate /
                  100;

            return {
              gross,
              discount,
              tax,
              total:
                taxCalculation ===
                  'inclusive'
                  ? discounted
                  : discounted + tax,
            };
          },
        ),
      [
        lines,
        taxCalculation,
      ],
    );

  const totals =
    useMemo(
      () => {
        const subtotal =
          lineTotals.reduce(
            (sum, line) =>
              sum + line.gross,
            0,
          );

        const discount =
          lineTotals.reduce(
            (sum, line) =>
              sum + line.discount,
            0,
          );

        const tax =
          lineTotals.reduce(
            (sum, line) =>
              sum + line.tax,
            0,
          );

        const total =
          subtotal -
          discount +
          (
            taxCalculation ===
              'exclusive'
              ? tax
              : 0
          ) +
          Math.max(
            0,
            Number(shippingTotal || 0),
          ) +
          Number(
            roundingAdjustment || 0,
          );

        return {
          subtotal,
          discount,
          tax,
          total:
            Math.max(0, total),
        };
      },
      [
        lineTotals,
        roundingAdjustment,
        shippingTotal,
        taxCalculation,
      ],
    );

  function updateLine(
    index: number,
    patch: Partial<ComposerLine>,
  ) {
    setLines(
      current =>
        current.map(
          (line, lineIndex) =>
            lineIndex === index
              ? {
                  ...line,
                  ...patch,
                }
              : line,
        ),
    );
  }

  function chooseCatalogItem(
    index: number,
    itemId: string,
  ) {
    if (!itemId) {
      updateLine(
        index,
        {
          catalogItemId: '',
        },
      );

      return;
    }

    const item =
      data.catalogItems.find(
        candidate =>
          candidate.id === itemId,
      );

    if (!item) {
      return;
    }

    updateLine(
      index,
      {
        catalogItemId: item.id,
        description:
          item.description ||
          item.name,
        sku:
          item.sku || '',
        unit:
          item.unit,
        unitPrice:
          item.unitPrice,
        taxRateId:
          item.taxRateId || '',
        taxRate:
          item.taxRate,
      },
    );
  }

  function chooseCustomer(
    value: string,
  ) {
    setCustomerId(value);

    const customer =
      data.customers.find(
        candidate =>
          candidate.id === value,
      );

    if (!customer) {
      return;
    }

    setCurrency(
      customer.currency ||
        data.settings.defaultCurrency,
    );

    setDueDate(
      plusDays(
        invoiceDate,
        customer.dueDays ??
          data.settings.defaultDueDays,
      ),
    );
  }

  function changeInvoiceDate(
    value: string,
  ) {
    setInvoiceDate(value);

    setDueDate(
      plusDays(
        value,
        selectedCustomer?.dueDays ??
          data.settings.defaultDueDays,
      ),
    );
  }

  async function submit(
    confirm: boolean,
  ) {
    if (!customerId) {
      return;
    }

    const payload = {
      action:
        editing
          ? 'update_invoice'
          : 'create_invoice',
      invoiceId:
        invoice?.id,
      customerId,
      invoiceDate,
      dueDate,
      currency,
      reference,
      purchaseOrderNumber,
      shippingTotal,
      roundingAdjustment,
      notes,
      terms,
      confirm,
      lines:
        lines.map(
          line => ({
            catalogItemId:
              line.catalogItemId ||
              undefined,
            description:
              line.description,
            sku:
              line.sku,
            unit:
              line.unit,
            quantity:
              line.quantity,
            unitPrice:
              line.unitPrice,
            discountType:
              line.discountType,
            discountValue:
              line.discountValue,
            taxRateId:
              line.taxRateId ||
              undefined,
            taxRate:
              line.taxRate,
          }),
        ),
    };

    await run(
      payload,
      editing
        ? 'Invoice draft updated.'
        : confirm
          ? 'Invoice created and confirmed.'
          : 'Invoice draft created.',
    );
  }

  const invalid =
    !customerId ||
    lines.length === 0 ||
    lines.some(
      line =>
        !line.description.trim() ||
        line.quantity <= 0 ||
        line.unitPrice < 0,
    );

  return (
    <div className="space-y-5 pb-24 sm:pb-0">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <section className="rounded-[22px] border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-blue-600" />

              <p className="text-sm font-black">
                Customer & terms
              </p>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="block space-y-1 md:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                  Customer
                </span>

                <select
                  value={customerId}
                  onChange={
                    event =>
                      chooseCustomer(
                        event.target.value,
                      )
                  }
                  className="h-12 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                >
                  <option value="">
                    Choose customer
                  </option>

                  {
                    data.customers
                      .filter(
                        customer =>
                          customer.status ===
                          'active',
                      )
                      .map(
                        customer => (
                          <option
                            key={customer.id}
                            value={customer.id}
                          >
                            {customer.name}
                            {
                              customer.email
                                ? ' · ' +
                                  customer.email
                                : ''
                            }
                          </option>
                        ),
                      )
                  }
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                  Invoice date
                </span>

                <input
                  type="date"
                  value={invoiceDate}
                  onChange={
                    event =>
                      changeInvoiceDate(
                        event.target.value,
                      )
                  }
                  className="h-12 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                  Due date
                </span>

                <input
                  type="date"
                  value={dueDate}
                  min={invoiceDate}
                  onChange={
                    event =>
                      setDueDate(
                        event.target.value,
                      )
                  }
                  className="h-12 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                  Currency
                </span>

                <input
                  value={currency}
                  maxLength={3}
                  onChange={
                    event =>
                      setCurrency(
                        event.target.value
                          .toUpperCase(),
                      )
                  }
                  className="h-12 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm uppercase"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                  Reference
                </span>

                <input
                  value={reference}
                  onChange={
                    event =>
                      setReference(
                        event.target.value,
                      )
                  }
                  placeholder="Project, contract, job..."
                  className="h-12 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                  PO number
                </span>

                <input
                  value={purchaseOrderNumber}
                  onChange={
                    event =>
                      setPurchaseOrderNumber(
                        event.target.value,
                      )
                  }
                  className="h-12 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                />
              </label>
            </div>

            {
              selectedCustomer &&
              (
                <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-3 text-xs dark:bg-white/[0.03] sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="font-black text-slate-400">
                      Billing contact
                    </p>
                    <p className="mt-1 font-bold">
                      {
                        selectedCustomer.contactName ||
                        selectedCustomer.name
                      }
                    </p>
                    <p className="mt-1 text-slate-500">
                      {
                        selectedCustomer.email ||
                        selectedCustomer.phone ||
                        'No delivery contact'
                      }
                    </p>
                  </div>

                  <div>
                    <p className="font-black text-slate-400">
                      Payment terms
                    </p>
                    <p className="mt-1 font-bold">
                      {
                        selectedCustomer.paymentTermsName ||
                        (
                          (
                            selectedCustomer.dueDays ??
                            data.settings.defaultDueDays
                          ) +
                          ' days'
                        )
                      }
                    </p>
                  </div>

                  <div>
                    <p className="font-black text-slate-400">
                      Tax / PIN
                    </p>
                    <p className="mt-1 font-bold">
                      {
                        selectedCustomer.taxId ||
                        'Not set'
                      }
                    </p>
                  </div>

                  <div>
                    <p className="font-black text-slate-400">
                      Outstanding
                    </p>
                    <p className="mt-1 font-bold">
                      {
                        formatMoney(
                          selectedCustomer
                            .outstandingTotal,
                          selectedCustomer
                            .currency,
                        )
                      }
                    </p>
                  </div>

                  {
                    selectedCustomer.billingAddress &&
                    (
                      <div className="sm:col-span-2 lg:col-span-4">
                        <p className="font-black text-slate-400">
                          Billing address
                        </p>
                        <p className="mt-1 whitespace-pre-line leading-5 text-slate-600 dark:text-slate-300">
                          {
                            selectedCustomer
                              .billingAddress
                          }
                        </p>
                      </div>
                    )
                  }
                </div>
              )
            }
          </section>

          <section className="overflow-hidden rounded-[22px] border border-[var(--sami-border)] bg-[var(--sami-surface)]">
            <div className="flex flex-col gap-3 border-b border-[var(--sami-border)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <PackageSearch className="h-4 w-4 text-blue-600" />
                  <p className="text-sm font-black">
                    Products & services
                  </p>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Choose catalog items or enter a custom line. Price, discount and tax remain editable per invoice.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  () =>
                    setLines(
                      current => [
                        ...current,
                        emptyLine(data),
                      ],
                    )
                }
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black text-blue-600"
              >
                <Plus className="h-4 w-4" />
                Add line
              </button>
            </div>

            <div className="space-y-3 p-3 sm:p-4">
              {
                lines.map(
                  (line, index) => {
                    const calculated =
                      lineTotals[index];

                    return (
                      <div
                        key={index}
                        className="rounded-2xl border border-[var(--sami-border)] p-3"
                      >
                        <div className="grid gap-2 lg:grid-cols-[minmax(210px,1.1fr)_minmax(240px,1.5fr)_90px_130px]">
                          <label className="space-y-1">
                            <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                              Product / service
                            </span>
                            <select
                              value={line.catalogItemId}
                              onChange={
                                event =>
                                  chooseCatalogItem(
                                    index,
                                    event.target.value,
                                  )
                              }
                              className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-2.5 text-xs"
                            >
                              <option value="">
                                Custom line
                              </option>
                              {
                                data.catalogItems.map(
                                  item => (
                                    <option
                                      key={item.id}
                                      value={item.id}
                                    >
                                      {item.name}
                                      {
                                        item.sku
                                          ? ' · ' +
                                            item.sku
                                          : ''
                                      }
                                    </option>
                                  ),
                                )
                              }
                            </select>
                          </label>

                          <label className="space-y-1">
                            <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                              Description
                            </span>
                            <input
                              value={line.description}
                              onChange={
                                event =>
                                  updateLine(
                                    index,
                                    {
                                      description:
                                        event.target.value,
                                    },
                                  )
                              }
                              placeholder="What are you billing for?"
                              className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-2.5 text-xs"
                            />
                          </label>

                          <label className="space-y-1">
                            <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                              Qty
                            </span>
                            <input
                              value={line.quantity}
                              onChange={
                                event =>
                                  updateLine(
                                    index,
                                    {
                                      quantity:
                                        Number(
                                          event.target.value,
                                        ),
                                    },
                                  )
                              }
                              type="number"
                              min="0.0001"
                              step="0.0001"
                              className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-2.5 text-xs"
                            />
                          </label>

                          <label className="space-y-1">
                            <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                              Unit price
                            </span>
                            <input
                              value={line.unitPrice}
                              onChange={
                                event =>
                                  updateLine(
                                    index,
                                    {
                                      unitPrice:
                                        Number(
                                          event.target.value,
                                        ),
                                    },
                                  )
                              }
                              type="number"
                              min="0"
                              step="0.01"
                              className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-2.5 text-xs"
                            />
                          </label>
                        </div>

                        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-[110px_120px_130px_120px_minmax(120px,1fr)_44px] lg:items-end">
                          <label className="space-y-1">
                            <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                              Unit
                            </span>
                            <input
                              value={line.unit}
                              onChange={
                                event =>
                                  updateLine(
                                    index,
                                    {
                                      unit:
                                        event.target.value,
                                    },
                                  )
                              }
                              className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-2.5 text-xs"
                            />
                          </label>

                          <label className="space-y-1">
                            <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                              Discount
                            </span>
                            <select
                              value={line.discountType}
                              onChange={
                                event =>
                                  updateLine(
                                    index,
                                    {
                                      discountType:
                                        event.target.value ===
                                          'fixed'
                                          ? 'fixed'
                                          : 'percent',
                                    },
                                  )
                              }
                              className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                            >
                              <option value="percent">
                                Percent
                              </option>
                              <option value="fixed">
                                Fixed
                              </option>
                            </select>
                          </label>

                          <label className="space-y-1">
                            <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                              Discount value
                            </span>
                            <input
                              value={line.discountValue}
                              onChange={
                                event =>
                                  updateLine(
                                    index,
                                    {
                                      discountValue:
                                        Number(
                                          event.target.value,
                                        ),
                                    },
                                  )
                              }
                              type="number"
                              min="0"
                              max={
                                line.discountType ===
                                  'percent'
                                  ? 100
                                  : undefined
                              }
                              step="0.01"
                              className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-2.5 text-xs"
                            />
                          </label>

                          <label className="space-y-1">
                            <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                              Tax
                            </span>
                            <select
                              value={line.taxRateId}
                              onChange={
                                event => {
                                  const id =
                                    event.target.value;

                                  const tax =
                                    data.taxRates.find(
                                      candidate =>
                                        candidate.id === id,
                                    );

                                  updateLine(
                                    index,
                                    {
                                      taxRateId: id,
                                      taxRate:
                                        tax?.rate || 0,
                                    },
                                  );
                                }
                              }
                              className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                            >
                              <option value="">
                                No tax
                              </option>
                              {
                                data.taxRates.map(
                                  tax => (
                                    <option
                                      key={tax.id}
                                      value={tax.id}
                                    >
                                      {tax.name}
                                    </option>
                                  ),
                                )
                              }
                            </select>
                          </label>

                          <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.03]">
                            <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                              Line total
                            </p>
                            <p className="mt-1 text-sm font-black">
                              {
                                formatMoney(
                                  calculated.total,
                                  currency,
                                )
                              }
                            </p>
                          </div>

                          <button
                            type="button"
                            aria-label="Remove line"
                            disabled={
                              lines.length === 1
                            }
                            onClick={
                              () =>
                                setLines(
                                  current =>
                                    current.filter(
                                      (
                                        _item,
                                        itemIndex,
                                      ) =>
                                        itemIndex !== index,
                                    ),
                                )
                            }
                            className="flex h-10 w-full items-center justify-center rounded-xl text-red-600 disabled:opacity-30"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {
                          line.sku &&
                          (
                            <p className="mt-2 text-[10px] font-semibold text-slate-400">
                              SKU {line.sku}
                            </p>
                          )
                        }
                      </div>
                    );
                  },
                )
              }
            </div>
          </section>

          <section className="grid gap-4 rounded-[22px] border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                Customer-facing notes
              </span>
              <textarea
                value={notes}
                onChange={
                  event =>
                    setNotes(
                      event.target.value,
                    )
                }
                rows={5}
                className="w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                Terms & conditions
              </span>
              <textarea
                value={terms}
                onChange={
                  event =>
                    setTerms(
                      event.target.value,
                    )
                }
                rows={5}
                className="w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
              />
            </label>
          </section>
        </div>

        <aside className="h-fit space-y-4 xl:sticky xl:top-4">
          <section className="rounded-[22px] border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-blue-600" />
              <p className="text-sm font-black">
                Invoice summary
              </p>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <SummaryRow
                label="Subtotal"
                value={
                  formatMoney(
                    totals.subtotal,
                    currency,
                  )
                }
              />

              <SummaryRow
                label="Discount"
                value={
                  '− ' +
                  formatMoney(
                    totals.discount,
                    currency,
                  )
                }
              />

              <SummaryRow
                label={
                  taxCalculation ===
                    'inclusive'
                    ? 'Tax included'
                    : 'Tax'
                }
                value={
                  formatMoney(
                    totals.tax,
                    currency,
                  )
                }
              />

              <label className="flex items-center justify-between gap-3 py-1">
                <span className="text-slate-500">
                  Shipping
                </span>
                <input
                  value={shippingTotal}
                  onChange={
                    event =>
                      setShippingTotal(
                        Number(
                          event.target.value,
                        ),
                      )
                  }
                  type="number"
                  min="0"
                  step="0.01"
                  className="h-9 w-28 rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-right text-xs font-bold"
                />
              </label>

              <label className="flex items-center justify-between gap-3 py-1">
                <span className="text-slate-500">
                  Rounding
                </span>
                <input
                  value={roundingAdjustment}
                  onChange={
                    event =>
                      setRoundingAdjustment(
                        Number(
                          event.target.value,
                        ),
                      )
                  }
                  type="number"
                  step="0.01"
                  className="h-9 w-28 rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-right text-xs font-bold"
                />
              </label>
            </div>

            <div className="mt-4 border-t border-[var(--sami-border)] pt-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Total
                  </p>
                  <p className="mt-1 text-2xl font-black tracking-[-0.04em]">
                    {
                      formatMoney(
                        totals.total,
                        currency,
                      )
                    }
                  </p>
                </div>

                <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-500 dark:bg-white/5">
                  {taxCalculation} tax
                </span>
              </div>
            </div>
          </section>

          <section className="hidden rounded-[22px] border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 sm:block">
            <p className="text-xs font-black">
              Document controls
            </p>

            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Drafts remain editable. Confirming locks the commercial document for normal editing and moves changes into auditable actions such as payments and credit notes.
            </p>

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                disabled={invalid}
                onClick={
                  () =>
                    submit(false)
                }
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] text-xs font-black disabled:opacity-40"
              >
                <Save className="h-4 w-4" />
                {
                  editing
                    ? 'Save draft changes'
                    : 'Save as draft'
                }
              </button>

              {
                data.capabilities.canConfirm &&
                !editing &&
                (
                  <button
                    type="button"
                    disabled={invalid}
                    onClick={
                      () =>
                        submit(true)
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 text-xs font-black text-white disabled:opacity-40"
                  >
                    <Receipt className="h-4 w-4" />
                    Save & confirm
                  </button>
                )
              }
            </div>
          </section>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--sami-border)] bg-[var(--sami-surface)]/95 p-3 shadow-2xl backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-lg gap-2">
          <button
            type="button"
            disabled={invalid}
            onClick={
              () =>
                submit(false)
            }
            className="inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] text-xs font-black disabled:opacity-40"
          >
            <Save className="h-4 w-4" />
            Draft
          </button>

          {
            data.capabilities.canConfirm &&
            !editing &&
            (
              <button
                type="button"
                disabled={invalid}
                onClick={
                  () =>
                    submit(true)
                }
                className="inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 text-xs font-black text-white disabled:opacity-40"
              >
                <Receipt className="h-4 w-4" />
                Confirm
              </button>
            )
          }
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-slate-500">
        {label}
      </span>

      <span className="font-black">
        {value}
      </span>
    </div>
  );
}
