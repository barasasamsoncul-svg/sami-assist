'use client';

import {
  useRef,
  useState,
  useTransition,
} from 'react';

import Link from 'next/link';

import {
  Check,
  Copy,
  FileDown,
  Pencil,
  Send,
  ShoppingCart,
  X,
} from 'lucide-react';

import {
  useRouter,
} from 'next/navigation';

import SaMiOverlay from '@/app/components/SaMiOverlay';

import {
  useSaMiOverlay,
} from '@/app/components/useSaMiOverlay';

import SalesQuoteComposer from '@/app/apps/sales/SalesQuoteComposer';

import type {
  SalesQuoteDetail,
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


function Badge({
  value,
}: {
  value:
    string;
}) {
  return (
    <span className="inline-flex rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-blue-700 ring-1 ring-inset ring-blue-500/20 dark:text-blue-300">
      {
        value.replaceAll(
          '_',
          ' ',
        )
      }
    </span>
  );
}


export default function SalesQuoteDetailClient({
  quote,
  workspace,
}: {
  quote:
    SalesQuoteDetail;
  workspace:
    SalesWorkspaceData;
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
    confirmAction,
  } =
    useSaMiOverlay();

  const isBusy =
    busy ||
    pending;

  async function request(
    payload:
      Record<
        string,
        unknown
      >,
  ) {
    if (
      inFlight.current
    ) {
      throw new Error(
        'Another Sales action is still being saved.',
      );
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
            cache:
              'no-store',
            credentials:
              'same-origin',
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

      startTransition(
        () => {
          router.refresh();
        },
      );

      return body.result ||
        {};
    } finally {
      inFlight.current =
        false;

      setBusy(
        false,
      );
    }
  }

  async function run(
    payload:
      Record<
        string,
        unknown
      >,
    message:
      string,
  ) {
    try {
      const result =
        await request(
          payload,
        );

      showSuccess(
        'Action completed',
        message,
      );

      return result;
    } catch (
      error
    ) {
      const messageText =
        error instanceof
          Error
          ? error.message
          : 'SaMi could not complete the Sales action.';

      if (
        messageText.includes(
          'still being saved',
        )
      ) {
        showWarning(
          'Action already in progress',
          messageText,
        );
      } else {
        showError(
          'Sales action failed',
          messageText,
        );
      }

      return null;
    }
  }

  const canEdit =
    workspace
      .capabilities
      .canEdit &&
    quote.status ===
      'draft' &&
    ![
      'pending',
      'approved',
    ].includes(
      quote.approvalStatus,
    );

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
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black sm:text-2xl">
                  {
                    quote.quoteNumber
                  }
                </h1>
                <Badge
                  value={
                    quote.status
                  }
                />
                <Badge
                  value={
                    quote.approvalStatus
                  }
                />
              </div>

              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {
                  quote.customerName
                }
                {' · '}
                {
                  money(
                    quote.totalAmount,
                    quote.currency,
                  )
                }
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {
                  quote.quoteDate
                }
                {
                  quote.validUntil
                    ? ' · valid until ' +
                      quote.validUntil
                    : ''
                }
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/apps/sales"
                className="inline-flex h-10 items-center rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
              >
                Sales
              </Link>

              <a
                href={
                  '/api/apps/sales/quotes/' +
                  quote.id +
                  '/pdf'
                }
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
              >
                <FileDown className="h-4 w-4" />
                PDF
              </a>

              {
                canEdit &&
                (
                  <button
                    type="button"
                    onClick={
                      () =>
                        setEditing(
                          current =>
                            !current,
                        )
                    }
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
                  >
                    <Pencil className="h-4 w-4" />
                    {
                      editing
                        ? 'Close editor'
                        : 'Edit draft'
                    }
                  </button>
                )
              }

              {
                workspace
                  .capabilities
                  .canCreate &&
                (
                  <button
                    type="button"
                    disabled={
                      isBusy
                    }
                    onClick={
                      () =>
                        void run(
                          {
                            action:
                              'duplicate_quote',
                            quoteId:
                              quote.id,
                          },
                          'A new draft quotation was created from this quotation.',
                        )
                    }
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-60"
                  >
                    <Copy className="h-4 w-4" />
                    Duplicate
                  </button>
                )
              }
            </div>
          </div>
        </section>

        {
          editing &&
          canEdit &&
          (
            <section className="sami-surface rounded-[26px] p-4 sm:p-5">
              <SalesQuoteComposer
                data={
                  workspace
                }
                initialQuote={
                  quote
                }
                busy={
                  isBusy
                }
                onCancel={
                  () =>
                    setEditing(
                      false,
                    )
                }
                onSave={
                  async payload => {
                    const result =
                      await run(
                        payload,
                        'Quotation updated successfully.',
                      );

                    if (
                      result
                    ) {
                      setEditing(
                        false,
                      );
                    }

                    return Boolean(
                      result,
                    );
                  }
                }
              />
            </section>
          )
        }

        <section className="grid gap-4 xl:grid-cols-[1fr_370px]">
          <div className="space-y-4">
            <div className="sami-surface overflow-hidden rounded-[24px]">
              <div className="border-b border-[var(--sami-border)] p-4">
                <h2 className="text-sm font-black">
                  Commercial lines
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="border-b border-[var(--sami-border)] text-left text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    <tr>
                      <th className="px-4 py-3">
                        Description
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

                  <tbody className="divide-y divide-[var(--sami-border)]">
                    {
                      quote.lines.map(
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
                                    line.taxName,
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
                                money(
                                  line.unitPrice,
                                  quote.currency,
                                )
                              }
                            </td>
                            <td className="px-4 py-3 text-right">
                              {
                                money(
                                  line.discountAmount,
                                  quote.currency,
                                )
                              }
                            </td>
                            <td className="px-4 py-3 text-right">
                              {
                                money(
                                  line.taxAmount,
                                  quote.currency,
                                )
                              }
                            </td>
                            <td className="px-4 py-3 text-right font-black">
                              {
                                money(
                                  line.lineTotal,
                                  quote.currency,
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
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <TextCard
                title="Customer notes"
                value={
                  quote.notes
                }
              />
              <TextCard
                title="Terms & conditions"
                value={
                  quote.terms
                }
              />
              <TextCard
                title="Billing address"
                value={
                  quote.billingAddress
                }
              />
              <TextCard
                title="Shipping address"
                value={
                  quote.shippingAddress
                }
              />
            </div>

            <div className="sami-surface rounded-[24px] p-4">
              <h2 className="text-sm font-black">
                Lifecycle history
              </h2>

              <div className="mt-3 space-y-3">
                {
                  quote.history.length ===
                    0
                    ? (
                        <p className="text-xs text-slate-500">
                          No lifecycle changes recorded yet.
                        </p>
                      )
                    : quote.history.map(
                        item => (
                          <div
                            key={
                              item.id
                            }
                            className="border-b border-[var(--sami-border)] pb-3 last:border-0 last:pb-0"
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

            <div className="sami-surface rounded-[24px] p-4">
              <h2 className="text-sm font-black">
                Delivery log
              </h2>
              <div className="mt-3 space-y-2">
                {
                  quote.deliveries.length ===
                    0
                    ? (
                        <p className="text-xs text-slate-500">
                          This quotation has not been delivered yet.
                        </p>
                      )
                    : quote.deliveries.map(
                        delivery => (
                          <div
                            key={
                              delivery.id
                            }
                            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--sami-border)] p-3"
                          >
                            <div>
                              <p className="text-xs font-black capitalize">
                                {
                                  delivery.channel
                                }
                              </p>
                              <p className="mt-1 text-[10px] text-slate-400">
                                {
                                  delivery.provider ||
                                  'provider'
                                }
                                {' · '}
                                {
                                  delivery.createdAt
                                }
                              </p>
                            </div>
                            <Badge
                              value={
                                delivery.status
                              }
                            />
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
                Commercial summary
              </h2>
              <div className="mt-3 space-y-2 text-sm">
                <Summary
                  label="Subtotal"
                  value={
                    money(
                      quote.subtotal,
                      quote.currency,
                    )
                  }
                />
                <Summary
                  label="Discount"
                  value={
                    '− ' +
                    money(
                      quote.discountTotal,
                      quote.currency,
                    )
                  }
                />
                <Summary
                  label="Tax"
                  value={
                    money(
                      quote.taxTotal,
                      quote.currency,
                    )
                  }
                />
                <Summary
                  label="Shipping"
                  value={
                    money(
                      quote.shippingTotal,
                      quote.currency,
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
                        quote.totalAmount,
                        quote.currency,
                      )
                    }
                  </span>
                </div>
              </div>
            </div>

            {
              quote.approvalStatus ===
                'draft' &&
              workspace
                .capabilities
                .canEdit &&
              (
                <ActionCard
                  title="Internal approval"
                  text="Submit this draft for the company Sales approval policy."
                >
                  <button
                    type="button"
                    disabled={
                      isBusy
                    }
                    onClick={
                      () =>
                        void run(
                          {
                            action:
                              'request_quote_approval',
                            quoteId:
                              quote.id,
                          },
                          'Quotation submitted for internal approval.',
                        )
                    }
                    className="h-11 w-full rounded-xl bg-blue-600 text-xs font-black text-white disabled:opacity-60"
                  >
                    Request approval
                  </button>
                </ActionCard>
              )
            }

            {
              quote.approvalStatus ===
                'pending' &&
              workspace
                .capabilities
                .canApproveInternally &&
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
                            'review_quote_approval',
                          quoteId:
                            quote.id,
                          decision:
                            form.get(
                              'decision',
                            ),
                          reason:
                            form.get(
                              'reason',
                            ),
                        },
                        'Quotation approval decision recorded.',
                      );
                    }
                  }
                >
                  <h2 className="text-sm font-black">
                    Review approval
                  </h2>
                  <select
                    name="decision"
                    className="mt-3 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                  >
                    <option value="approve">
                      Approve
                    </option>
                    <option value="reject">
                      Reject
                    </option>
                  </select>
                  <textarea
                    name="reason"
                    rows={
                      3
                    }
                    placeholder="Reason for rejection when applicable"
                    className="mt-2 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={
                      isBusy
                    }
                    className="mt-2 h-11 w-full rounded-xl bg-blue-600 text-xs font-black text-white disabled:opacity-60"
                  >
                    Submit decision
                  </button>
                </form>
              )
            }

            {
              workspace
                .capabilities
                .canSend &&
              [
                'draft',
                'sent',
                'viewed',
              ].includes(
                quote.status,
              ) &&
              ![
                'draft',
                'pending',
                'rejected',
              ].includes(
                quote.approvalStatus,
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

                      const channels =
                        [
                          'email',
                          'whatsapp',
                          'sms',
                        ]
                          .filter(
                            channel =>
                              form.get(
                                channel,
                              ) ===
                                'on',
                          );

                      await run(
                        {
                          action:
                            'send_quote',
                          quoteId:
                            quote.id,
                          channels,
                        },
                        'Quotation delivery completed.',
                      );
                    }
                  }
                >
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-blue-600" />
                    <h2 className="text-sm font-black">
                      Deliver quotation
                    </h2>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {
                      [
                        'email',
                        'whatsapp',
                        'sms',
                      ].map(
                        channel => (
                          <label
                            key={
                              channel
                            }
                            className="flex items-center gap-2 rounded-xl border border-[var(--sami-border)] p-3 text-xs font-bold capitalize"
                          >
                            <input
                              name={
                                channel
                              }
                              type="checkbox"
                              defaultChecked={
                                channel ===
                                  'email'
                              }
                            />
                            {
                              channel
                            }
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
                    Send securely
                  </button>
                </form>
              )
            }

            {
              workspace
                .capabilities
                .canApprove &&
              [
                'draft',
                'sent',
                'viewed',
              ].includes(
                quote.status,
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

                      await run(
                        {
                          action:
                            'change_quote_status',
                          quoteId:
                            quote.id,
                          status:
                            form.get(
                              'status',
                            ),
                          reason:
                            form.get(
                              'reason',
                            ),
                        },
                        'Customer response recorded.',
                      );
                    }
                  }
                >
                  <h2 className="text-sm font-black">
                    Record customer response
                  </h2>
                  <select
                    name="status"
                    className="mt-3 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                  >
                    <option value="accepted">
                      Accepted
                    </option>
                    <option value="rejected">
                      Rejected
                    </option>
                  </select>
                  <textarea
                    name="reason"
                    rows={
                      3
                    }
                    placeholder="Reason / note"
                    className="mt-2 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={
                      isBusy
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[var(--sami-border)] text-xs font-black disabled:opacity-60"
                  >
                    Save response
                  </button>
                </form>
              )
            }

            {
              quote.status ===
                'accepted' &&
              workspace
                .capabilities
                .canConvert &&
              !quote.salesOrderId &&
              (
                <ActionCard
                  title="Convert accepted business"
                  text="Create a sales order, or create a draft invoice through the locked Invoicing workflow."
                >
                  <button
                    type="button"
                    disabled={
                      isBusy
                    }
                    onClick={
                      () =>
                        void run(
                          {
                            action:
                              'quote_to_order',
                            quoteId:
                              quote.id,
                          },
                          'Sales order created from the accepted quotation.',
                        )
                    }
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-xs font-black text-white disabled:opacity-60"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Create sales order
                  </button>

                  <button
                    type="button"
                    disabled={
                      isBusy
                    }
                    onClick={
                      () =>
                        confirmAction({
                          title:
                            'Create draft invoice?',
                          message:
                            'SaMi will create or reuse the sales order, then hand invoice creation to the locked Invoicing service.',
                          confirmLabel:
                            'Create invoice',
                          onConfirm:
                            () => {
                              void run(
                                {
                                  action:
                                    'quote_to_invoice',
                                  quoteId:
                                    quote.id,
                                },
                                'Draft invoice created.',
                              );
                            },
                        })
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[var(--sami-border)] text-xs font-black disabled:opacity-60"
                  >
                    Create draft invoice
                  </button>
                </ActionCard>
              )
            }

            {
              quote.salesOrderId &&
              (
                <LinkCard
                  label="Sales order"
                  href={
                    '/apps/sales/orders/' +
                    quote.salesOrderId
                  }
                  value="Open converted order"
                />
              )
            }

            {
              quote.latestInvoiceId &&
              (
                <LinkCard
                  label="Latest invoice"
                  href={
                    '/apps/invoicing/' +
                    quote.latestInvoiceId
                  }
                  value="Open invoice"
                />
              )
            }

            {
              workspace
                .capabilities
                .canCancel &&
              !quote.salesOrderId &&
              [
                'draft',
                'sent',
                'viewed',
                'accepted',
              ].includes(
                quote.status,
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

                      await run(
                        {
                          action:
                            'change_quote_status',
                          quoteId:
                            quote.id,
                          status:
                            'cancelled',
                          reason:
                            form.get(
                              'reason',
                            ),
                        },
                        'Quotation cancelled.',
                      );
                    }
                  }
                >
                  <h2 className="text-sm font-black text-red-700 dark:text-red-300">
                    Cancel quotation
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
                    Cancel quotation
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


function TextCard({
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


function ActionCard({
  title,
  text,
  children,
}: {
  title:
    string;
  text:
    string;
  children:
    React.ReactNode;
}) {
  return (
    <div className="sami-surface rounded-[24px] p-4">
      <h2 className="text-sm font-black">
        {
          title
        }
      </h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        {
          text
        }
      </p>
      <div className="mt-3">
        {
          children
        }
      </div>
    </div>
  );
}


function LinkCard({
  label,
  value,
  href,
}: {
  label:
    string;
  value:
    string;
  href:
    string;
}) {
  return (
    <Link
      href={
        href
      }
      className="sami-surface block rounded-[24px] p-4"
    >
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
        {
          label
        }
      </p>
      <p className="mt-1 text-sm font-black text-blue-700 dark:text-blue-300">
        {
          value
        }
      </p>
    </Link>
  );
}
