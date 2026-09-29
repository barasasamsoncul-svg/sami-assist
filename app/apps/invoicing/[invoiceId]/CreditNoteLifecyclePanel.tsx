'use client';

import type {
  InvoicingInvoiceDetail,
  InvoicingInvoiceSummary,
} from '@/lib/apps/invoicing/types';


type Credit =
  InvoicingInvoiceDetail[
    'creditNotes'
  ][number];


type Runner = (
  payload:
    Record<string, unknown>,
  message:
    string,
) => Promise<boolean>;


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


function requestKey(
  prefix:
    string,
) {
  return (
    prefix +
    ':' +
    (
      typeof crypto !==
        'undefined' &&
      'randomUUID' in
        crypto
        ? crypto.randomUUID()
        : Date.now()
            .toString(
              36,
            )
    )
  );
}


export default function CreditNoteLifecyclePanel({
  credit,
  customerId,
  currency,
  invoices,
  busy,
  run,
}: {
  credit:
    Credit;
  customerId:
    string;
  currency:
    string;
  invoices:
    InvoicingInvoiceSummary[];
  busy:
    boolean;
  run:
    Runner;
}) {
  const candidates =
    invoices
      .filter(
        invoice =>
          invoice.customerId ===
            customerId &&
          invoice.currency ===
            currency &&
          invoice.balanceDue >
            0.0001 &&
          ![
            'draft',
            'pending_approval',
            'rejected',
            'cancelled',
            'void',
            'written_off',
          ].includes(
            invoice.status,
          ),
      )
      .sort(
        (
          left,
          right,
        ) =>
          right.balanceDue -
          left.balanceDue,
      );

  const postedManualApplications =
    credit.applications.filter(
      application =>
        application
          .applicationType ===
          'customer_credit' &&
        application.status ===
          'posted',
    );

  const postedRefunds =
    credit.refunds.filter(
      refund =>
        refund.status ===
        'posted',
    );

  const canCancel =
    credit.status !==
      'cancelled' &&
    postedManualApplications
      .length ===
      0 &&
    postedRefunds.length ===
      0;

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-black">
            {
              credit.creditNoteNumber
            } · {
              money(
                credit.amount,
                currency,
              )
            }
          </p>

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
        </div>

        <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-slate-700 dark:bg-white/10 dark:text-slate-200">
          {
            credit.status
              .replaceAll(
                '_',
                ' ',
              )
          }
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-[var(--sami-surface-soft)] p-2">
          <p className="text-[9px] font-black uppercase text-slate-500">
            Applied
          </p>
          <p className="mt-1 text-xs font-black">
            {
              money(
                credit.appliedAmount,
                currency,
              )
            }
          </p>
        </div>

        <div className="rounded-xl bg-[var(--sami-surface-soft)] p-2">
          <p className="text-[9px] font-black uppercase text-slate-500">
            Refunded
          </p>
          <p className="mt-1 text-xs font-black">
            {
              money(
                credit.refundedAmount,
                currency,
              )
            }
          </p>
        </div>

        <div className="rounded-xl bg-blue-500/[0.07] p-2">
          <p className="text-[9px] font-black uppercase text-blue-700 dark:text-blue-300">
            Available credit
          </p>
          <p className="mt-1 text-xs font-black text-blue-700 dark:text-blue-300">
            {
              money(
                credit.availableAmount,
                currency,
              )
            }
          </p>
        </div>
      </div>

      {
        credit.applications.length >
          0 &&
        (
          <div className="mt-3 space-y-2">
            <p className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">
              Applications
            </p>

            {
              credit.applications.map(
                application => (
                  <div
                    key={
                      application.id
                    }
                    className="rounded-xl border border-[var(--sami-border)] p-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] font-bold">
                        {
                          application.targetInvoiceNumber
                        } · {
                          money(
                            application.amount,
                            currency,
                          )
                        }
                      </p>
                      <span className="text-[9px] font-black uppercase text-slate-500">
                        {
                          application.applicationType ===
                            'source_offset'
                            ? 'Source invoice offset'
                            : application.status
                        }
                      </span>
                    </div>

                    {
                      application.applicationType ===
                        'customer_credit' &&
                      application.status ===
                        'posted' &&
                      (
                        <form
                          className="mt-2 flex flex-col gap-2 sm:flex-row"
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
                                      'reverse_credit_application',
                                    applicationId:
                                      application.id,
                                    reason:
                                      form.get(
                                        'reason',
                                      ),
                                  },
                                  'Credit application reversed.',
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
                            placeholder="Reversal reason"
                            className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-[10px]"
                          />
                          <button
                            type="submit"
                            disabled={
                              busy
                            }
                            className="h-9 rounded-lg border border-red-500/30 px-3 text-[9px] font-black text-red-700 dark:text-red-300"
                          >
                            Reverse application
                          </button>
                        </form>
                      )
                    }
                  </div>
                ),
              )
            }
          </div>
        )
      }

      {
        credit.refunds.length >
          0 &&
        (
          <div className="mt-3 space-y-2">
            <p className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">
              Refunds
            </p>

            {
              credit.refunds.map(
                refund => (
                  <div
                    key={
                      refund.id
                    }
                    className="rounded-xl border border-[var(--sami-border)] p-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-bold">
                          {
                            refund.refundNumber
                          } · {
                            money(
                              refund.amount,
                              currency,
                            )
                          }
                        </p>
                        <p className="mt-1 text-[9px] text-slate-500">
                          {
                            refund.refundDate
                          } · {
                            refund.method
                          }{
                            refund.reference
                              ? ' · ' +
                                refund.reference
                              : ''
                          }
                        </p>
                      </div>

                      <span className="text-[9px] font-black uppercase text-slate-500">
                        {
                          refund.status
                        }
                      </span>
                    </div>

                    {
                      refund.status ===
                        'posted' &&
                      (
                        <form
                          className="mt-2 flex flex-col gap-2 sm:flex-row"
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
                                      'reverse_credit_refund',
                                    refundId:
                                      refund.id,
                                    reason:
                                      form.get(
                                        'reason',
                                      ),
                                  },
                                  'Credit refund reversed.',
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
                            placeholder="Reversal reason"
                            className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-[10px]"
                          />
                          <button
                            type="submit"
                            disabled={
                              busy
                            }
                            className="h-9 rounded-lg border border-red-500/30 px-3 text-[9px] font-black text-red-700 dark:text-red-300"
                          >
                            Reverse refund
                          </button>
                        </form>
                      )
                    }
                  </div>
                ),
              )
            }
          </div>
        )
      }

      {
        credit.availableAmount >
          0.0001 &&
        credit.status !==
          'cancelled' &&
        (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <form
              className="rounded-xl border border-[var(--sami-border)] p-3"
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
                          'apply_credit_note',
                        creditNoteId:
                          credit.id,
                        targetInvoiceId:
                          form.get(
                            'targetInvoiceId',
                          ),
                        amount:
                          form.get(
                            'amount',
                          ),
                        idempotencyKey:
                          requestKey(
                            'apply',
                          ),
                      },
                      'Customer credit applied.',
                    );

                  if (
                    saved
                  ) {
                    element.reset();
                  }
                }
              }
            >
              <p className="text-[10px] font-black">
                Apply customer credit
              </p>

              <select
                name="targetInvoiceId"
                required
                disabled={
                  candidates.length ===
                  0
                }
                className="mt-2 h-9 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-[10px]"
              >
                <option value="">
                  {
                    candidates.length
                      ? 'Choose open invoice'
                      : 'No open customer invoice'
                  }
                </option>
                {
                  candidates.map(
                    candidate => (
                      <option
                        key={
                          candidate.id
                        }
                        value={
                          candidate.id
                        }
                      >
                        {
                          candidate.invoiceNumber
                        } · {
                          money(
                            candidate.balanceDue,
                            currency,
                          )
                        }
                      </option>
                    ),
                  )
                }
              </select>

              <input
                name="amount"
                type="number"
                min="0.01"
                max={
                  credit.availableAmount
                }
                step="0.01"
                required
                placeholder="Amount to apply"
                className="mt-2 h-9 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-[10px]"
              />

              <button
                type="submit"
                disabled={
                  busy ||
                  candidates.length ===
                    0
                }
                className="mt-2 h-9 w-full rounded-lg bg-blue-600 px-3 text-[9px] font-black text-white disabled:opacity-50"
              >
                Apply credit
              </button>
            </form>

            <form
              className="rounded-xl border border-[var(--sami-border)] p-3"
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
                          'refund_credit_note',
                        creditNoteId:
                          credit.id,
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
                        reason:
                          form.get(
                            'reason',
                          ),
                        refundDate:
                          form.get(
                            'refundDate',
                          ),
                        idempotencyKey:
                          requestKey(
                            'refund',
                          ),
                      },
                      'Customer credit refunded.',
                    );

                  if (
                    saved
                  ) {
                    element.reset();
                  }
                }
              }
            >
              <p className="text-[10px] font-black">
                Refund available credit
              </p>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  max={
                    credit.availableAmount
                  }
                  step="0.01"
                  required
                  placeholder="Refund amount"
                  className="h-9 rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-[10px]"
                />

                <select
                  name="method"
                  className="h-9 rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-[10px]"
                >
                  <option value="bank">Bank</option>
                  <option value="mpesa">M-Pesa</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <input
                name="refundDate"
                type="date"
                required
                defaultValue={
                  new Date()
                    .toISOString()
                    .slice(
                      0,
                      10,
                    )
                }
                className="mt-2 h-9 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-[10px]"
              />

              <input
                name="reference"
                placeholder="Refund reference"
                className="mt-2 h-9 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-[10px]"
              />

              <input
                name="reason"
                required
                maxLength={
                  2000
                }
                placeholder="Refund reason"
                className="mt-2 h-9 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-[10px]"
              />

              <button
                type="submit"
                disabled={
                  busy
                }
                className="mt-2 h-9 w-full rounded-lg border border-[var(--sami-border)] px-3 text-[9px] font-black"
              >
                Post refund
              </button>
            </form>
          </div>
        )
      }

      {
        canCancel &&
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
                    'Credit note cancelled and balances recalculated.',
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
              className="h-9 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-[10px]"
            />

            <button
              type="submit"
              disabled={
                busy
              }
              className="h-9 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-[9px] font-black text-red-700 disabled:opacity-50 dark:text-red-300"
            >
              Cancel credit note
            </button>
          </form>
        )
      }
    </div>
  );
}
