'use client';

import {
  useMemo,
  useState,
} from 'react';

import type {
  InvoicingInvoiceDetail,
} from '@/lib/apps/invoicing/types';


type Runner = (
  payload:
    Record<string, unknown>,
  message:
    string,
) => Promise<boolean>;


export default function CreditNoteIssueForm({
  invoice,
  busy,
  run,
}: {
  invoice:
    InvoicingInvoiceDetail;
  busy:
    boolean;
  run:
    Runner;
}) {
  const [
    mode,
    setMode,
  ] =
    useState<
      'amount' |
      'lines'
    >(
      'amount',
    );

  const [
    quantities,
    setQuantities,
  ] =
    useState<
      Record<
        string,
        string
      >
    >(
      {},
    );

  const activeCreditTotal =
    useMemo(
      () =>
        invoice.creditNotes
          .filter(
            credit =>
              credit.status !==
              'cancelled',
          )
          .reduce(
            (
              total,
              credit,
            ) =>
              total +
              credit.amount,
            0,
          ),
      [
        invoice.creditNotes,
      ],
    );

  const maxCreditable =
    Math.max(
      invoice.totalAmount -
      activeCreditTotal,
      0,
    );

  if (
    maxCreditable <=
      0.0001
  ) {
    return null;
  }

  return (
    <form
      className="sami-surface rounded-[24px] p-4"
      onSubmit={
        async event => {
          event.preventDefault();

          const element =
            event.currentTarget;

          const form =
            new FormData(
              element,
            );

          const items =
            mode ===
              'lines'
              ? invoice.lines
                  .map(
                    line => ({
                      invoiceItemId:
                        line.id,
                      quantity:
                        Number(
                          quantities[
                            line.id
                          ] ||
                          0,
                        ),
                    }),
                  )
                  .filter(
                    item =>
                      Number.isFinite(
                        item.quantity,
                      ) &&
                      item.quantity >
                        0,
                  )
              : [];

          const saved =
            await run(
              {
                action:
                  'issue_credit_note',
                invoiceId:
                  invoice.id,
                amount:
                  mode ===
                    'amount'
                    ? form.get(
                        'amount',
                      )
                    : undefined,
                items:
                  mode ===
                    'lines'
                    ? items
                    : undefined,
                reason:
                  form.get(
                    'reason',
                  ),
                issueDate:
                  form.get(
                    'issueDate',
                  ),
                idempotencyKey:
                  typeof crypto !==
                    'undefined' &&
                  'randomUUID' in
                    crypto
                    ? crypto
                        .randomUUID()
                    : (
                        Date.now()
                          .toString(
                            36,
                          )
                      ),
              },
              'Credit note issued and customer credit recalculated.',
            );

          if (
            saved
          ) {
            element.reset();
            setQuantities(
              {},
            );
          }
        }
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black">
            Issue credit note
          </p>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">
            Credit up to {
              invoice.currency
            } {
              maxCreditable
                .toLocaleString()
            }. Any amount beyond this invoice&apos;s open balance becomes reusable customer credit.
          </p>
        </div>

        <div className="flex rounded-xl border border-[var(--sami-border)] p-1">
          <button
            type="button"
            onClick={
              () =>
                setMode(
                  'amount',
                )
            }
            className={[
              'h-8 rounded-lg px-3 text-[10px] font-black',
              mode ===
                'amount'
                ? 'bg-blue-600 text-white'
                : '',
            ].join(
              ' ',
            )}
          >
            Quick amount
          </button>
          <button
            type="button"
            onClick={
              () =>
                setMode(
                  'lines',
                )
            }
            className={[
              'h-8 rounded-lg px-3 text-[10px] font-black',
              mode ===
                'lines'
                ? 'bg-blue-600 text-white'
                : '',
            ].join(
              ' ',
            )}
          >
            Credit lines
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {
          mode ===
            'amount'
            ? (
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  max={
                    maxCreditable
                  }
                  step="0.01"
                  required
                  placeholder="Credit amount"
                  className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                />
              )
            : (
                <div className="max-h-72 space-y-2 overflow-auto rounded-xl border border-[var(--sami-border)] p-2">
                  {
                    invoice.lines.map(
                      line => (
                        <label
                          key={
                            line.id
                          }
                          className="grid gap-2 rounded-xl bg-[var(--sami-surface-soft)] p-3 sm:grid-cols-[minmax(0,1fr)_120px]"
                        >
                          <div>
                            <p className="text-xs font-black">
                              {
                                line.description
                              }
                            </p>
                            <p className="mt-1 text-[10px] text-slate-500">
                              Original qty {
                                line.quantity
                              } · {
                                invoice.currency
                              } {
                                line.lineTotal
                                  .toLocaleString()
                              }
                            </p>
                          </div>

                          <input
                            type="number"
                            min="0"
                            max={
                              line.quantity
                            }
                            step="0.0001"
                            value={
                              quantities[
                                line.id
                              ] ||
                              ''
                            }
                            onChange={
                              event =>
                                setQuantities(
                                  current => ({
                                    ...current,
                                    [line.id]:
                                      event.target
                                        .value,
                                  }),
                                )
                            }
                            placeholder="Credit qty"
                            className="h-10 rounded-lg border border-[var(--sami-border)] bg-[var(--sami-surface)] px-2 text-xs"
                          />
                        </label>
                      ),
                    )
                  }
                </div>
              )
        }

        <input
          name="issueDate"
          type="date"
          defaultValue={
            new Date()
              .toISOString()
              .slice(
                0,
                10,
              )
          }
          required
          className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
        />

        <input
          name="reason"
          required
          maxLength={
            2000
          }
          placeholder="Reason for credit"
          className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
        />

        <button
          type="submit"
          disabled={
            busy ||
            (
              mode ===
                'lines' &&
              !Object
                .values(
                  quantities,
                )
                .some(
                  value =>
                    Number(
                      value,
                    ) >
                    0,
                )
            )
          }
          className="h-11 w-full rounded-xl border border-[var(--sami-border)] text-xs font-black disabled:opacity-50"
        >
          Issue credit
        </button>
      </div>
    </form>
  );
}
