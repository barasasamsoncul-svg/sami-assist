'use client';

import {
  useRef,
  useState,
  useTransition,
} from 'react';

import Link from 'next/link';

import {
  Receipt,
  Truck,
  X,
} from 'lucide-react';

import {
  useRouter,
} from 'next/navigation';

import SaMiOverlay from '@/app/components/SaMiOverlay';

import {
  useSaMiOverlay,
} from '@/app/components/useSaMiOverlay';

import type {
  SalesOrderDetail,
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';


function money(
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


export default function SalesOrderDetailClient({
  order,
  workspace,
}: {
  order:
    SalesOrderDetail;
  workspace:
    SalesWorkspaceData;
}) {
  const router =
    useRouter();

  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );

  const [
    pending,
    startTransition,
  ] =
    useTransition();

  const inFlight =
    useRef(
      false,
    );

  const {
    overlay,
    closeOverlay,
    showSuccess,
    showError,
    showWarning,
  } =
    useSaMiOverlay();

  const isBusy =
    busy ||
    pending;

  async function run(
    payload:
      Record<
        string,
        unknown
      >,
    message:
      string,
  ) {
    if (
      inFlight.current
    ) {
      showWarning(
        'Action already in progress',
        'Another Sales action is still being saved.',
      );
      return null;
    }

    inFlight.current =
      true;

    setBusy(
      true,
    );

    try {
      const response =
        await fetch(
          '/api/apps/sales',
          {
            method:
              'POST',
            credentials:
              'same-origin',
            cache:
              'no-store',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify(
                payload,
              ),
          },
        );

      const body =
        await response
          .json()
          .catch(
            () => ({}),
          ) as {
            success?:
              boolean;
            error?:
              string;
            result?:
              Record<
                string,
                unknown
              >;
          };

      if (
        !response.ok ||
        body.success !==
          true
      ) {
        throw new Error(
          body.error ||
          'SaMi could not complete the Sales action.',
        );
      }

      showSuccess(
        'Action completed',
        message,
      );

      startTransition(
        () => {
          router.refresh();
        },
      );

      return body.result ||
        {};
    } catch (
      error
    ) {
      showError(
        'Sales action failed',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not complete the Sales action.',
      );

      return null;
    } finally {
      inFlight.current =
        false;

      setBusy(
        false,
      );
    }
  }

  return (
    <>
      <SaMiOverlay
        {...overlay}
        onClose={
          closeOverlay
        }
      />

      <div className="space-y-4">
        <section className="sami-surface rounded-[26px] p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600 dark:text-blue-300">
                Sales order
              </p>

              <h1 className="mt-1 text-xl font-black sm:text-2xl">
                {
                  order.orderNumber
                }
              </h1>

              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {
                  order.customerName
                }
                {' · '}
                {
                  money(
                    order.totalAmount,
                    order.currency,
                  )
                }
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                <State
                  label="Order"
                  value={
                    order.status
                  }
                />
                <State
                  label="Fulfillment"
                  value={
                    order.fulfillmentStatus
                  }
                />
                <State
                  label="Invoice"
                  value={
                    order.invoiceStatus
                  }
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/apps/sales"
                className="inline-flex h-10 items-center rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
              >
                Sales
              </Link>

              {
                order.quoteId &&
                (
                  <Link
                    href={
                      '/apps/sales/quotes/' +
                      order.quoteId
                    }
                    className="inline-flex h-10 items-center rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
                  >
                    Source quotation
                  </Link>
                )
              }
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1fr_390px]">
          <div className="space-y-4">
            <form
              className="sami-surface overflow-hidden rounded-[24px]"
              onSubmit={
                async event => {
                  event.preventDefault();

                  const form =
                    new FormData(
                      event.currentTarget,
                    );

                  await run(
                    {
                      action:
                        'update_fulfillment',
                      orderId:
                        order.id,
                      lines:
                        order.lines.map(
                          line => ({
                            lineId:
                              line.id,
                            deliveredQuantity:
                              form.get(
                                'delivered-' +
                                line.id,
                              ),
                          }),
                        ),
                    },
                    'Fulfillment quantities updated.',
                  );
                }
              }
            >
              <div className="flex flex-col gap-3 border-b border-[var(--sami-border)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-black">
                    Order fulfillment
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Ordered, delivered, invoiced and invoiceable quantities remain independently traceable.
                  </p>
                </div>

                {
                  workspace
                    .capabilities
                    .canManageOrders &&
                  order.status !==
                    'cancelled' &&
                  order.status !==
                    'closed' &&
                  (
                    <button
                      type="submit"
                      disabled={
                        isBusy
                      }
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:opacity-60"
                    >
                      <Truck className="h-4 w-4" />
                      Save fulfillment
                    </button>
                  )
                }
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="border-b border-[var(--sami-border)] text-left text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    <tr>
                      <th className="px-4 py-3">
                        Item
                      </th>
                      <th className="px-4 py-3 text-right">
                        Ordered
                      </th>
                      <th className="px-4 py-3 text-right">
                        Delivered
                      </th>
                      <th className="px-4 py-3 text-right">
                        Invoiced
                      </th>
                      <th className="px-4 py-3 text-right">
                        Invoiceable
                      </th>
                      <th className="px-4 py-3 text-right">
                        Value
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[var(--sami-border)]">
                    {
                      order.lines.map(
                        line => (
                          <tr
                            key={
                              line.id
                            }
                          >
                            <td className="px-4 py-3">
                              <p className="font-bold">
                                {
                                  line.description
                                }
                              </p>
                              <p className="mt-1 text-[10px] text-slate-400">
                                {
                                  [
                                    line.sku,
                                    line.unit,
                                  ]
                                    .filter(
                                      Boolean,
                                    )
                                    .join(
                                      ' · ',
                                    )
                                }
                              </p>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {
                                line.quantity
                              }
                            </td>
                            <td className="px-4 py-3 text-right">
                              {
                                workspace
                                  .capabilities
                                  .canManageOrders &&
                                order.status !==
                                  'cancelled' &&
                                order.status !==
                                  'closed'
                                  ? (
                                      <input
                                        name={
                                          'delivered-' +
                                          line.id
                                        }
                                        type="number"
                                        min="0"
                                        max={
                                          line.quantity
                                        }
                                        step="0.0001"
                                        defaultValue={
                                          line.deliveredQuantity
                                        }
                                        className="h-9 w-24 rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-right"
                                      />
                                    )
                                  : line.deliveredQuantity
                              }
                            </td>
                            <td className="px-4 py-3 text-right">
                              {
                                line.invoicedQuantity
                              }
                            </td>
                            <td className="px-4 py-3 text-right font-black text-blue-700 dark:text-blue-300">
                              {
                                line.invoiceableQuantity
                              }
                            </td>
                            <td className="px-4 py-3 text-right font-black">
                              {
                                money(
                                  line.lineTotal,
                                  order.currency,
                                )
                              }
                            </td>
                          </tr>
                        ),
                      )
                    }
                  </tbody>
                </table>
              </div>
            </form>

            <div className="grid gap-4 lg:grid-cols-2">
              <InfoCard
                title="Billing address"
                value={
                  order.billingAddress
                }
              />
              <InfoCard
                title="Shipping address"
                value={
                  order.shippingAddress
                }
              />
              <InfoCard
                title="Notes"
                value={
                  order.notes
                }
              />
              <InfoCard
                title="Terms"
                value={
                  order.terms
                }
              />
            </div>

            <div className="sami-surface rounded-[24px] p-4">
              <h2 className="text-sm font-black">
                Order history
              </h2>

              <div className="mt-3 space-y-2">
                {
                  order.history.map(
                    item => (
                      <div
                        key={
                          item.id
                        }
                        className="border-b border-[var(--sami-border)] pb-2 last:border-0"
                      >
                        <p className="text-xs font-black">
                          {
                            item.fromStatus
                              ? item.fromStatus +
                                ' → '
                              : ''
                          }
                          {
                            item.toStatus
                          }
                        </p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          {
                            item.createdAt
                          }
                          {
                            item.reason
                              ? ' · ' +
                                item.reason
                              : ''
                          }
                        </p>
                      </div>
                    ),
                  )
                }
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="sami-surface rounded-[24px] p-4">
              <h2 className="text-sm font-black">
                Order summary
              </h2>

              <div className="mt-3 space-y-2 text-sm">
                <Summary
                  label="Subtotal"
                  value={
                    money(
                      order.subtotal,
                      order.currency,
                    )
                  }
                />
                <Summary
                  label="Discount"
                  value={
                    '− ' +
                    money(
                      order.discountTotal,
                      order.currency,
                    )
                  }
                />
                <Summary
                  label="Tax"
                  value={
                    money(
                      order.taxTotal,
                      order.currency,
                    )
                  }
                />
                <Summary
                  label="Shipping"
                  value={
                    money(
                      order.shippingTotal,
                      order.currency,
                    )
                  }
                />
                <div className="flex items-center justify-between border-t border-[var(--sami-border)] pt-3">
                  <span className="font-black">
                    Total
                  </span>
                  <span className="text-lg font-black text-blue-700 dark:text-blue-300">
                    {
                      money(
                        order.totalAmount,
                        order.currency,
                      )
                    }
                  </span>
                </div>
              </div>
            </div>

            <div className="sami-soft-surface rounded-[24px] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                Invoice policy
              </p>
              <p className="mt-2 text-sm font-black">
                {
                  workspace.settings
                    .invoicePolicy ===
                    'delivered'
                    ? 'Delivered quantities'
                    : 'Ordered quantities'
                }
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {
                  workspace.settings
                    .allowPartialInvoicing
                    ? 'Partial invoicing is allowed.'
                    : 'Partial invoicing is disabled.'
                }
              </p>
            </div>

            {
              workspace
                .capabilities
                .canManageOrders &&
              order.status !==
                'cancelled' &&
              order.lines.some(
                line =>
                  line.invoiceableQuantity >
                  0,
              ) &&
              (
                <form
                  className="sami-surface rounded-[24px] p-4"
                  onSubmit={
                    async event => {
                      event.preventDefault();

                      const form =
                        new FormData(
                          event.currentTarget,
                        );

                      const lines =
                        order.lines
                          .map(
                            line => ({
                              lineId:
                                line.id,
                              quantity:
                                Number(
                                  form.get(
                                    'invoice-' +
                                    line.id,
                                  ) ||
                                  0,
                                ),
                            }),
                          )
                          .filter(
                            line =>
                              line.quantity >
                              0,
                          );

                      await run(
                        {
                          action:
                            'create_order_invoice',
                          orderId:
                            order.id,
                          idempotencyKey:
                            globalThis
                              .crypto
                              ?.randomUUID?.(),
                          lines,
                        },
                        'Draft invoice created from the sales order.',
                      );
                    }
                  }
                >
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-blue-600" />
                    <h2 className="text-sm font-black">
                      Create invoice
                    </h2>
                  </div>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Choose remaining invoiceable quantities. SaMi prevents duplicate batches and over-invoicing.
                  </p>

                  <div className="mt-3 space-y-2">
                    {
                      order.lines
                        .filter(
                          line =>
                            line.invoiceableQuantity >
                            0,
                        )
                        .map(
                          line => (
                            <label
                              key={
                                line.id
                              }
                              className="block rounded-xl border border-[var(--sami-border)] p-3"
                            >
                              <span className="text-[10px] font-black">
                                {
                                  line.description
                                }
                              </span>
                              <input
                                name={
                                  'invoice-' +
                                  line.id
                                }
                                type="number"
                                min={
                                  workspace
                                    .settings
                                    .allowPartialInvoicing
                                    ? '0'
                                    : String(
                                        line.invoiceableQuantity,
                                      )
                                }
                                max={
                                  line.invoiceableQuantity
                                }
                                step="0.0001"
                                defaultValue={
                                  line.invoiceableQuantity
                                }
                                className="mt-2 h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                              />
                            </label>
                          ),
                        )
                    }
                  </div>

                  <button
                    type="submit"
                    disabled={
                      isBusy
                    }
                    className="mt-3 h-11 w-full rounded-xl bg-blue-600 text-xs font-black text-white disabled:opacity-60"
                  >
                    Create draft invoice
                  </button>
                </form>
              )
            }

            <div className="sami-surface rounded-[24px] p-4">
              <h2 className="text-sm font-black">
                Invoice batches
              </h2>

              <div className="mt-3 space-y-2">
                {
                  order.invoices.length ===
                    0
                    ? (
                        <p className="text-xs text-slate-500">
                          No invoices created from this order yet.
                        </p>
                      )
                    : order.invoices.map(
                        batch => (
                          <div
                            key={
                              batch.batchId
                            }
                            className="rounded-xl border border-[var(--sami-border)] p-3"
                          >
                            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                              {
                                batch.status
                              }
                            </p>
                            <p className="mt-1 text-xs font-bold">
                              {
                                batch.sourceReference
                              }
                            </p>
                            {
                              batch.invoiceId &&
                              (
                                <Link
                                  href={
                                    '/apps/invoicing/' +
                                    batch.invoiceId
                                  }
                                  className="mt-2 inline-block text-xs font-black text-blue-700 hover:underline dark:text-blue-300"
                                >
                                  Open invoice
                                </Link>
                              )
                            }
                          </div>
                        ),
                      )
                }
              </div>
            </div>

            {
              workspace
                .capabilities
                .canManageOrders &&
              order.status !==
                'cancelled' &&
              order.invoicedPercent ===
                0 &&
              (
                <form
                  className="sami-surface rounded-[24px] p-4"
                  onSubmit={
                    async event => {
                      event.preventDefault();

                      const form =
                        new FormData(
                          event.currentTarget,
                        );

                      await run(
                        {
                          action:
                            'cancel_order',
                          orderId:
                            order.id,
                          reason:
                            form.get(
                              'reason',
                            ),
                        },
                        'Sales order cancelled.',
                      );
                    }
                  }
                >
                  <h2 className="text-sm font-black text-red-700 dark:text-red-300">
                    Cancel sales order
                  </h2>

                  <textarea
                    name="reason"
                    required
                    rows={
                      3
                    }
                    placeholder="Cancellation reason"
                    className="mt-3 w-full rounded-xl border border-red-500/30 bg-transparent px-3 py-2 text-sm"
                  />

                  <button
                    type="submit"
                    disabled={
                      isBusy
                    }
                    className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 text-xs font-black text-red-700 disabled:opacity-60 dark:text-red-300"
                  >
                    <X className="h-4 w-4" />
                    Cancel order
                  </button>
                </form>
              )
            }
          </aside>
        </section>
      </div>
    </>
  );
}


function State({
  label,
  value,
}: {
  label:
    string;
  value:
    string;
}) {
  return (
    <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-black text-blue-700 ring-1 ring-inset ring-blue-500/20 dark:text-blue-300">
      {
        label
      }
      {': '}
      {
        value.replaceAll(
          '_',
          ' ',
        )
      }
    </span>
  );
}


function InfoCard({
  title,
  value,
}: {
  title:
    string;
  value:
    string |
    null;
}) {
  return (
    <div className="sami-surface rounded-[22px] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
        {
          title
        }
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">
        {
          value ||
          '—'
        }
      </p>
    </div>
  );
}


function Summary({
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
