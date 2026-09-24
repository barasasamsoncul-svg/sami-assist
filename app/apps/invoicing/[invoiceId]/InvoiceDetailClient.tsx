'use client';

import {
  useRef,
  useState,
  useTransition,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import {
  ArrowLeft,
  BadgeCheck,
  BellRing,
  CopyPlus,
  CreditCard,
  FileText,
  History,
  Mail,
  Receipt,
  RotateCcw,
  Send,
} from 'lucide-react';

import InvoiceComposer from '@/app/apps/invoicing/InvoiceComposer';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import {
  useSaMiOverlay,
} from '@/app/components/useSaMiOverlay';

import type {
  InvoicingInvoiceDetail,
  InvoicingWorkspaceData,
} from '@/lib/apps/invoicing/types';


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
      value
        .toLocaleString()
    );
  }
}


function statusClass(
  status:
    string,
) {
  if (
    status ===
      'paid'
  ) {
    return 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300';
  }

  if (
    [
      'overdue',
      'cancelled',
      'void',
      'written_off',
      'reversed',
    ].includes(
      status,
    )
  ) {
    return 'bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-300';
  }

  if (
    [
      'sent',
      'viewed',
      'partially_paid',
      'confirmed',
    ].includes(
      status,
    )
  ) {
    return 'bg-blue-500/10 text-blue-700 ring-blue-500/20 dark:text-blue-300';
  }

  return 'bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-300';
}


function StatusPill({
  value,
}: {
  value:
    string;
}) {
  return (
    <span
      className={[
        'inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ring-1 ring-inset',
        statusClass(
          value,
        ),
      ].join(
        ' ',
      )}
    >
      {
        value.replaceAll(
          '_',
          ' ',
        )
      }
    </span>
  );
}


export default function InvoiceDetailClient({
  data,
  invoice,
}: {
  data:
    InvoicingWorkspaceData;
  invoice:
    InvoicingInvoiceDetail;
}) {
  const router =
    useRouter();

  const [
    editing,
    setEditing,
  ] =
    useState(
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

  const [
    pending,
    startTransition,
  ] =
    useTransition();

  const [
    requestBusy,
    setRequestBusy,
  ] =
    useState(
      false,
    );

  const requestInFlight =
    useRef(
      false,
    );

  const busy =
    pending ||
    requestBusy;

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
      requestInFlight
        .current
    ) {
      showWarning(
        'Action already in progress',
        'Another invoice action is still being saved. Please wait for it to finish.',
      );

      return false;
    }

    requestInFlight
      .current =
      true;

    setRequestBusy(
      true,
    );

    try {
      const response =
        await fetch(
          '/api/apps/invoicing',
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
              Accept:
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
          };

      if (
        !response.ok ||
        body.success !==
          true
      ) {
        throw new Error(
          body.error ||
          'SaMi could not complete the invoice action.',
        );
      }

      showSuccess(
        'Action completed',
        message,
      );

      setEditing(
        false,
      );

      startTransition(
        () => {
          router.refresh();
        },
      );

      return true;
    } catch (
      caught
    ) {
      showError(
        'Invoice action failed',
        caught instanceof
          Error
          ? caught.message
          : 'SaMi could not complete the invoice action.',
      );

      return false;
    } finally {
      requestInFlight
        .current =
        false;

      setRequestBusy(
        false,
      );
    }
  }

  if (
    editing &&
    invoice.status ===
      'draft'
  ) {
    return (
      <>
        <SaMiOverlay
          {...overlay}
          onClose={
            closeOverlay
          }
        />

        <div className="space-y-4">
          <button
          type="button"
          onClick={
            () =>
              setEditing(
                false,
              )
          }
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to invoice
        </button>

        <InvoiceComposer
          data={
            data
          }
          invoice={
            invoice
          }
          pending={
            busy
          }
          run={
            run
          }
        />
        </div>
      </>
    );
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
      <section className="sami-surface rounded-[24px] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Receipt className="h-5 w-5 text-blue-600" />

              <h1 className="text-xl font-black tracking-[-0.03em] sm:text-2xl">
                {
                  invoice
                    .invoiceNumber
                }
              </h1>

              <span
                className={[
                  'inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ring-1 ring-inset',
                  statusClass(
                    invoice.status,
                  ),
                ].join(
                  ' ',
                )}
              >
                {
                  invoice.status
                    .replaceAll(
                      '_',
                      ' ',
                    )
                }
              </span>
            </div>

            <p className="mt-2 text-sm text-slate-500">
              {
                invoice
                  .customer
                  .name
              } · issued {
                invoice
                  .invoiceDate
              } · due {
                invoice
                  .dueDate
              }
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {
              data.capabilities
                .canCreate &&
              (
                <button
                  type="button"
                  disabled={
                    busy
                  }
                  onClick={
                    () =>
                      run(
                        {
                          action:
                            'duplicate_invoice',
                          invoiceId:
                            invoice.id,
                        },
                        'Duplicate invoice created as a new draft.',
                      )
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-60"
                >
                  <CopyPlus className="h-4 w-4" />
                  Duplicate
                </button>
              )
            }

            {
              data.capabilities
                .canSend &&
              invoice.balanceDue >
                0 &&
              ![
                'draft',
                'paid',
                'cancelled',
                'void',
                'written_off',
              ].includes(
                invoice.status,
              ) &&
              (
                invoice.customer
                  .email ||
                invoice.customer
                  .phone
              ) &&
              (
                <button
                  type="button"
                  disabled={
                    busy
                  }
                  onClick={
                    () =>
                      run(
                        {
                          action:
                            'send_reminder',
                          invoiceId:
                            invoice.id,
                          channels:
                            invoice.customer
                              .email
                              ? [
                                  'email',
                                ]
                              : [
                                  'whatsapp',
                                ],
                        },
                        'Payment reminder sent.',
                      )
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-black text-amber-700 disabled:opacity-60 dark:text-amber-300"
                >
                  <BellRing className="h-4 w-4" />
                  Send reminder
                </button>
              )
            }

            {
              invoice.status ===
                'draft' &&
              data.capabilities
                .canEdit &&
              (
                <button
                  type="button"
                  onClick={
                    () =>
                      setEditing(
                        true,
                      )
                  }
                  className="h-10 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
                >
                  Edit draft
                </button>
              )
            }

            {
              invoice.status ===
                'draft' &&
              data.capabilities
                .canConfirm &&
              (
                <button
                  type="button"
                  disabled={
                    busy
                  }
                  onClick={
                    () =>
                      run(
                        {
                          action:
                            'change_status',
                          invoiceId:
                            invoice.id,
                          status:
                            'confirmed',
                        },
                        'Invoice confirmed.',
                      )
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-black text-white dark:bg-white dark:text-slate-950"
                >
                  <BadgeCheck className="h-4 w-4" />
                  Confirm
                </button>
              )
            }

            {
              data.capabilities
                .canSend &&
              ![
                'paid',
                'cancelled',
                'void',
                'written_off',
              ].includes(
                invoice.status,
              ) &&
              (
                <>
                  {
                    invoice.customer
                      .email &&
                    (
                      <button
                        type="button"
                        disabled={
                          busy
                        }
                        onClick={
                          () =>
                            run(
                              {
                                action:
                                  'send_invoice',
                                invoiceId:
                                  invoice.id,
                                channels: [
                                  'email',
                                ],
                              },
                              'Invoice emailed with PDF attachment.',
                            )
                        }
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-black text-white"
                      >
                        <Send className="h-4 w-4" />
                        Email PDF
                      </button>
                    )
                  }

                  {
                    invoice.customer
                      .phone &&
                    (
                      <button
                        type="button"
                        disabled={
                          busy
                        }
                        onClick={
                          () =>
                            run(
                              {
                                action:
                                  'send_invoice',
                                invoiceId:
                                  invoice.id,
                                channels: [
                                  'whatsapp',
                                ],
                              },
                              'Invoice sent on WhatsApp.',
                            )
                        }
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-black text-emerald-700 dark:text-emerald-300"
                      >
                        <Send className="h-4 w-4" />
                        WhatsApp
                      </button>
                    )
                  }

                  {
                    invoice.customer
                      .phone &&
                    (
                      <button
                        type="button"
                        disabled={
                          busy
                        }
                        onClick={
                          () =>
                            run(
                              {
                                action:
                                  'send_invoice',
                                invoiceId:
                                  invoice.id,
                                channels: [
                                  'sms',
                                ],
                              },
                              'Invoice link sent by SMS.',
                            )
                        }
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
                      >
                        SMS
                      </button>
                    )
                  }
                </>
              )
            }
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <section className="sami-surface rounded-[24px] p-4 sm:p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                  Bill to
                </p>

                <p className="mt-2 text-lg font-black">
                  {
                    invoice
                      .customer
                      .name
                  }
                </p>

                {
                  invoice
                    .customer
                    .email &&
                  (
                    <p className="mt-1 text-sm text-slate-500">
                      {
                        invoice
                          .customer
                          .email
                      }
                    </p>
                  )
                }

                {
                  invoice
                    .customer
                    .phone &&
                  (
                    <p className="mt-1 text-sm text-slate-500">
                      {
                        invoice
                          .customer
                          .phone
                      }
                    </p>
                  )
                }

                {
                  invoice
                    .customer
                    .billingAddress &&
                  (
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-500">
                      {
                        invoice
                          .customer
                          .billingAddress
                      }
                    </p>
                  )
                }
              </div>

              <div className="md:text-right">
                {
                  invoice
                    .customer
                    .paymentTermsName &&
                  (
                    <p className="text-sm">
                      <span className="text-slate-400">
                        Payment terms:
                      </span>{' '}
                      <strong>
                        {
                          invoice
                            .customer
                            .paymentTermsName
                        }
                      </strong>
                    </p>
                  )
                }

                {
                  invoice
                    .customer
                    .taxId &&
                  (
                    <p className="mt-1 text-sm">
                      <span className="text-slate-400">
                        Tax / PIN:
                      </span>{' '}
                      <strong>
                        {
                          invoice
                            .customer
                            .taxId
                        }
                      </strong>
                    </p>
                  )
                }

                {
                  invoice
                    .reference &&
                  (
                    <p className="mt-1 text-sm">
                      <span className="text-slate-400">
                        Reference:
                      </span>{' '}
                      <strong>
                        {
                          invoice
                            .reference
                        }
                      </strong>
                    </p>
                  )
                }

                {
                  invoice
                    .purchaseOrderNumber &&
                  (
                    <p className="mt-1 text-sm">
                      <span className="text-slate-400">
                        PO:
                      </span>{' '}
                      <strong>
                        {
                          invoice
                            .purchaseOrderNumber
                        }
                      </strong>
                    </p>
                  )
                }
              </div>
            </div>
          </section>

          <section className="sami-surface overflow-hidden rounded-[24px]">
            <div className="border-b border-[var(--sami-border)] p-4">
              <p className="text-sm font-black">
                Invoice lines
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Snapshot of the commercial document at creation/last draft edit.
              </p>
            </div>

            <div className="space-y-3 p-3 sm:hidden">
              {
                invoice.lines.map(
                  line => (
                    <div
                      key={
                        line.id
                      }
                      className="rounded-2xl border border-[var(--sami-border)] p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-black">
                            {
                              line.description
                            }
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {
                              line.quantity
                            } {
                              line.unit
                            } × {
                              formatMoney(
                                line.unitPrice,
                                invoice.currency,
                              )
                            }
                          </p>
                        </div>

                        <p className="shrink-0 text-sm font-black">
                          {
                            formatMoney(
                              line.lineTotal,
                              invoice.currency,
                            )
                          }
                        </p>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold text-slate-500">
                        {
                          line.sku &&
                          (
                            <span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-white/5">
                              SKU {
                                line.sku
                              }
                            </span>
                          )
                        }

                        {
                          line.discountAmount >
                            0 &&
                          (
                            <span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-white/5">
                              Discount {
                                formatMoney(
                                  line.discountAmount,
                                  invoice.currency,
                                )
                              }
                            </span>
                          )
                        }

                        {
                          line.taxRate >
                            0 &&
                          (
                            <span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-white/5">
                              {
                                line.taxName ||
                                'Tax'
                              } {
                                line.taxRate
                              }%
                            </span>
                          )
                        }
                      </div>
                    </div>
                  ),
                )
              }
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[760px] text-left">
                <thead className="bg-slate-50/70 text-[10px] uppercase tracking-[0.1em] text-slate-400 dark:bg-white/[0.02]">
                  <tr>
                    <th className="px-4 py-3">
                      Item
                    </th>

                    <th className="px-4 py-3 text-right">
                      Qty
                    </th>

                    <th className="px-4 py-3 text-right">
                      Price
                    </th>

                    <th className="px-4 py-3 text-right">
                      Discount
                    </th>

                    <th className="px-4 py-3 text-right">
                      Tax
                    </th>

                    <th className="px-4 py-3 text-right">
                      Total
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {
                    invoice.lines.map(
                      line => (
                        <tr
                          key={
                            line.id
                          }
                          className="border-t border-[var(--sami-border)] text-sm"
                        >
                          <td className="px-4 py-3">
                            <p className="font-black">
                              {
                                line.description
                              }
                            </p>

                            <p className="mt-1 text-[11px] text-slate-500">
                              {
                                line.sku ||
                                line.unit
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
                              formatMoney(
                                line.unitPrice,
                                invoice.currency,
                              )
                            }
                          </td>

                          <td className="px-4 py-3 text-right">
                            {
                              formatMoney(
                                line.discountAmount,
                                invoice.currency,
                              )
                            }
                          </td>

                          <td className="px-4 py-3 text-right">
                            {
                              formatMoney(
                                line.taxAmount,
                                invoice.currency,
                              )
                            }
                          </td>

                          <td className="px-4 py-3 text-right font-black">
                            {
                              formatMoney(
                                line.lineTotal,
                                invoice.currency,
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
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <ActivityCard
              title="Status history"
              icon={
                History
              }
            >
              {
                invoice.history.length ===
                  0
                  ? (
                    <Empty text="No status changes recorded." />
                  )
                  : invoice.history.map(
                      item => (
                        <TimelineRow
                          key={
                            item.id
                          }
                          title={
                            (
                              item.fromStatus
                                ? item.fromStatus +
                                  ' → '
                                : ''
                            ) +
                            item.toStatus
                          }
                          subtitle={
                            item.reason ||
                            'Status changed'
                          }
                          date={
                            item.createdAt
                          }
                        />
                      ),
                    )
              }
            </ActivityCard>

            <ActivityCard
              title="Delivery history"
              icon={
                Mail
              }
            >
              {
                invoice.deliveries.length ===
                  0
                  ? (
                    <Empty text="Invoice has not been delivered yet." />
                  )
                  : invoice.deliveries.map(
                      item => (
                        <TimelineRow
                          key={
                            item.id
                          }
                          title={
                            item.channel +
                            ' · ' +
                            item.status
                          }
                          subtitle={
                            item.provider ||
                            item.errorCode ||
                            'SaMi delivery'
                          }
                          date={
                            item.createdAt
                          }
                        />
                      ),
                    )
              }
            </ActivityCard>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:h-fit">
          <section className="sami-surface rounded-[24px] p-4">
            <p className="text-sm font-black">
              Financial summary
            </p>

            <div className="mt-4 space-y-2 text-sm">
              <SummaryRow
                label="Subtotal"
                value={
                  formatMoney(
                    invoice.subtotal,
                    invoice.currency,
                  )
                }
              />

              <SummaryRow
                label="Discount"
                value={
                  '− ' +
                  formatMoney(
                    invoice.discountTotal,
                    invoice.currency,
                  )
                }
              />

              <SummaryRow
                label={
                  invoice.taxCalculation ===
                    'inclusive'
                    ? 'Tax included'
                    : 'Tax'
                }
                value={
                  formatMoney(
                    invoice.taxTotal,
                    invoice.currency,
                  )
                }
              />

              <SummaryRow
                label="Shipping"
                value={
                  formatMoney(
                    invoice.shippingTotal,
                    invoice.currency,
                  )
                }
              />

              <SummaryRow
                label="Paid"
                value={
                  '− ' +
                  formatMoney(
                    invoice.paidAmount,
                    invoice.currency,
                  )
                }
              />

              <SummaryRow
                label="Credits"
                value={
                  '− ' +
                  formatMoney(
                    invoice.creditedAmount,
                    invoice.currency,
                  )
                }
              />
            </div>

            <div className="mt-4 border-t border-[var(--sami-border)] pt-4">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Balance due
              </p>

              <p className="mt-1 text-2xl font-black text-blue-700 dark:text-blue-300">
                {
                  formatMoney(
                    invoice.balanceDue,
                    invoice.currency,
                  )
                }
              </p>
            </div>
          </section>

          {
            data.capabilities
              .canRecordPayment &&
            invoice.balanceDue >
              0 &&
            ![
              'draft',
              'cancelled',
              'void',
              'written_off',
              'paid',
            ].includes(
              invoice.status,
            ) &&
            (
              <form
                className="sami-surface rounded-[24px] p-4"
                onSubmit={
                  async event => {
                    event
                      .preventDefault();

                    const element =
                      event.currentTarget;

                    const form =
                      new FormData(
                        element,
                      );

                    const saved =
                      await run(
                      {
                        action:
                          'record_payment',
                        invoiceId:
                          invoice.id,
                        amount:
                          form.get(
                            'amount',
                          ),
                        method:
                          form.get(
                            'method',
                          ),
                        reference:
                          form.get(
                            'reference',
                          ),
                      },
                      'Payment recorded.',
                    );

                    if (
                      saved
                    ) {
                      element.reset();
                    }
                  }
                }
              >
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-blue-600" />
                  <p className="text-sm font-black">
                    Record payment
                  </p>
                </div>

                <div className="mt-3 space-y-2">
                  <input
                    name="amount"
                    type="number"
                    min={
                      data.settings
                        .allowPartialPayments
                        ? 0.01
                        : invoice.balanceDue
                    }
                    max={
                      invoice.balanceDue
                    }
                    step="0.01"
                    defaultValue={
                      invoice.balanceDue
                    }
                    required
                    className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                  />

                  <select
                    name="method"
                    className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                  >
                    <option value="mpesa">
                      M-Pesa
                    </option>
                    <option value="bank">
                      Bank
                    </option>
                    <option value="cash">
                      Cash
                    </option>
                    <option value="card">
                      Card
                    </option>
                    <option value="other">
                      Other
                    </option>
                  </select>

                  <input
                    name="reference"
                    placeholder="Transaction reference"
                    className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                  />

                  <button
                    type="submit"
                    disabled={
                      busy
                    }
                    className="h-11 w-full rounded-xl bg-blue-600 text-xs font-black text-white"
                  >
                    Post payment
                  </button>
                </div>
              </form>
            )
          }

          {
            data.capabilities
              .canCredit &&
            data.settings
              .allowCreditNotes &&
            invoice.balanceDue >
              0 &&
            ![
              'draft',
              'cancelled',
              'void',
              'written_off',
            ].includes(
              invoice.status,
            ) &&
            (
              <form
                className="sami-surface rounded-[24px] p-4"
                onSubmit={
                  async event => {
                    event
                      .preventDefault();

                    const element =
                      event.currentTarget;

                    const form =
                      new FormData(
                        element,
                      );

                    const saved =
                      await run(
                      {
                        action:
                          'issue_credit_note',
                        invoiceId:
                          invoice.id,
                        amount:
                          form.get(
                            'amount',
                          ),
                        reason:
                          form.get(
                            'reason',
                          ),
                      },
                      'Credit note issued.',
                    );

                    if (
                      saved
                    ) {
                      element.reset();
                    }
                  }
                }
              >
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-blue-600" />
                  <p className="text-sm font-black">
                    Issue credit note
                  </p>
                </div>

                <div className="mt-3 space-y-2">
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    max={
                      invoice.balanceDue
                    }
                    step="0.01"
                    required
                    placeholder="Credit amount"
                    className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                  />

                  <input
                    name="reason"
                    required
                    placeholder="Reason"
                    className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                  />

                  <button
                    type="submit"
                    disabled={
                      busy
                    }
                    className="h-11 w-full rounded-xl border border-[var(--sami-border)] text-xs font-black"
                  >
                    Issue credit
                  </button>
                </div>
              </form>
            )
          }

          {
            invoice.payments.length >
              0 &&
            (
              <ActivityCard
                title="Payments"
                icon={
                  CreditCard
                }
              >
                {
                  invoice.payments.map(
                    payment => (
                      <div
                        key={
                          payment.id
                        }
                        className="py-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-black">
                            {
                              payment.paymentNumber +
                              ' · ' +
                              formatMoney(
                                payment.amount,
                                invoice.currency,
                              )
                            }
                          </p>

                          <StatusPill
                            value={
                              payment.status
                            }
                          />
                        </div>

                        <p className="mt-1 text-[11px] leading-5 text-slate-500">
                          {
                            payment.method +
                            (
                              payment.reference
                                ? ' · ' +
                                  payment.reference
                                : ''
                            )
                          }
                        </p>

                        <p className="mt-1 text-[10px] text-slate-400">
                          {
                            payment.paymentDate
                          }
                        </p>

                        {
                          data.capabilities
                            .canRecordPayment &&
                          payment.status ===
                            'posted' &&
                          (
                            <form
                              className="mt-3 flex flex-col gap-2"
                              onSubmit={
                                async event => {
                                  event.preventDefault();
                                  const element =
                                    event.currentTarget;
                                  const form =
                                    new FormData(
                                      element,
                                    );
                                  const saved =
                                    await run(
                                      {
                                        action:
                                          'reverse_payment',
                                        paymentId:
                                          payment.id,
                                        reason:
                                          form.get(
                                            'reason',
                                          ),
                                      },
                                      'Payment reversed and invoice balance recalculated.',
                                    );

                                  if (
                                    saved
                                  ) {
                                    element.reset();
                                  }
                                }
                              }
                            >
                              <input
                                name="reason"
                                required
                                maxLength={
                                  2000
                                }
                                placeholder="Reason for reversal"
                                className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs"
                              />

                              <button
                                type="submit"
                                disabled={
                                  busy
                                }
                                className="h-10 rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-xs font-black text-red-700 disabled:opacity-60 dark:text-red-300"
                              >
                                Reverse payment
                              </button>
                            </form>
                          )
                        }
                      </div>
                    ),
                  )
                }
              </ActivityCard>
            )
          }

          {
            invoice.creditNotes.length >
              0 &&
            (
              <ActivityCard
                title="Credit notes"
                icon={
                  FileText
                }
              >
                {
                  invoice.creditNotes.map(
                    credit => (
                      <div
                        key={
                          credit.id
                        }
                        className="py-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-black">
                            {
                              credit.creditNoteNumber +
                              ' · ' +
                              formatMoney(
                                credit.amount,
                                invoice.currency,
                              )
                            }
                          </p>

                          <StatusPill
                            value={
                              credit.status
                            }
                          />
                        </div>

                        <p className="mt-1 text-[11px] leading-5 text-slate-500">
                          {
                            credit.reason
                          }
                        </p>

                        <p className="mt-1 text-[10px] text-slate-400">
                          {
                            credit.issueDate
                          }
                        </p>

                        {
                          data.capabilities
                            .canCredit &&
                          [
                            'issued',
                            'applied',
                          ].includes(
                            credit.status,
                          ) &&
                          (
                            <form
                              className="mt-3 flex flex-col gap-2"
                              onSubmit={
                                async event => {
                                  event.preventDefault();
                                  const element =
                                    event.currentTarget;
                                  const form =
                                    new FormData(
                                      element,
                                    );
                                  const saved =
                                    await run(
                                      {
                                        action:
                                          'cancel_credit_note',
                                        creditNoteId:
                                          credit.id,
                                        reason:
                                          form.get(
                                            'reason',
                                          ),
                                      },
                                      'Credit note cancelled and invoice balance recalculated.',
                                    );

                                  if (
                                    saved
                                  ) {
                                    element.reset();
                                  }
                                }
                              }
                            >
                              <input
                                name="reason"
                                required
                                maxLength={
                                  2000
                                }
                                placeholder="Reason for cancellation"
                                className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs"
                              />

                              <button
                                type="submit"
                                disabled={
                                  busy
                                }
                                className="h-10 rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-xs font-black text-red-700 disabled:opacity-60 dark:text-red-300"
                              >
                                Cancel credit note
                              </button>
                            </form>
                          )
                        }
                      </div>
                    ),
                  )
                }
              </ActivityCard>
            )
          }
        </aside>
      </div>
      </div>
    </>
  );
}


function SummaryRow({
  label,
  value,
}: {
  label:
    string;
  value:
    string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-slate-500">
        {
          label
        }
      </span>

      <span className="font-black">
        {
          value
        }
      </span>
    </div>
  );
}


function ActivityCard({
  title,
  icon:
    Icon,
  children,
}: {
  title:
    string;
  icon:
    typeof History;
  children:
    React.ReactNode;
}) {
  return (
    <section className="sami-surface rounded-[24px] p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-blue-600" />

        <p className="text-sm font-black">
          {
            title
          }
        </p>
      </div>

      <div className="mt-3 divide-y divide-[var(--sami-border)]">
        {
          children
        }
      </div>
    </section>
  );
}


function TimelineRow({
  title,
  subtitle,
  date,
}: {
  title:
    string;
  subtitle:
    string;
  date:
    string;
}) {
  return (
    <div className="py-3">
      <p className="text-xs font-black capitalize">
        {
          title.replaceAll(
            '_',
            ' ',
          )
        }
      </p>

      <p className="mt-1 text-[11px] leading-5 text-slate-500">
        {
          subtitle
        }
      </p>

      <p className="mt-1 text-[10px] text-slate-400">
        {
          date
        }
      </p>
    </div>
  );
}


function Empty({
  text,
}: {
  text:
    string;
}) {
  return (
    <p className="py-5 text-center text-xs text-slate-500">
      {
        text
      }
    </p>
  );
}
