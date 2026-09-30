'use client';

import {
  useMemo,
  useState,
} from 'react';

import type {
  InvoicingWorkspaceData,
} from '@/lib/apps/invoicing/types';


type Runner = (
  payload:
    Record<string, unknown>,
  message:
    string,
) => Promise<boolean>;


type DraftInstallment = {
  dueDate: string;
  amount: string;
  label: string;
};


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


function isoDate(
  date:
    Date,
) {
  return date
    .toISOString()
    .slice(
      0,
      10,
    );
}


function addScheduleDate(
  value:
    string,
  index:
    number,
  cadence:
    string,
) {
  const start =
    new Date(
      value +
      'T00:00:00Z',
    );

  if (
    Number.isNaN(
      start.getTime(),
    )
  ) {
    return value;
  }

  if (
    cadence ===
      'weekly'
  ) {
    start.setUTCDate(
      start.getUTCDate() +
      index *
      7,
    );
  } else if (
    cadence ===
      'biweekly'
  ) {
    start.setUTCDate(
      start.getUTCDate() +
      index *
      14,
    );
  } else {
    const sourceDay =
      start.getUTCDate();

    start.setUTCDate(
      1,
    );

    start.setUTCMonth(
      start.getUTCMonth() +
      index,
    );

    const lastDay =
      new Date(
        Date.UTC(
          start.getUTCFullYear(),
          start.getUTCMonth() +
          1,
          0,
        ),
      )
        .getUTCDate();

    start.setUTCDate(
      Math.min(
        sourceDay,
        lastDay,
      ),
    );
  }

  return isoDate(
    start,
  );
}


function buildInstallments(
  balance:
    number,
  count:
    number,
  firstDueDate:
    string,
  cadence:
    string,
) {
  const cents =
    Math.round(
      balance *
      100,
    );

  const base =
    Math.floor(
      cents /
      count,
    );

  const remainder =
    cents -
    base *
    count;

  return Array.from(
    {
      length:
        count,
    },
    (
      _,
      index,
    ) => ({
      dueDate:
        addScheduleDate(
          firstDueDate,
          index,
          cadence,
        ),
      amount:
        (
          (
            base +
            (
              index ===
                count -
                1
                ? remainder
                : 0
            )
          ) /
          100
        )
          .toFixed(
            2,
          ),
      label:
        'Installment ' +
        (
          index +
          1
        ),
    }),
  );
}


function statusClass(
  status:
    string,
) {
  if (
    [
      'paid',
      'completed',
    ].includes(
      status,
    )
  ) {
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }

  if (
    [
      'overdue',
      'cancelled',
    ].includes(
      status,
    )
  ) {
    return 'bg-red-500/10 text-red-700 dark:text-red-300';
  }

  if (
    status ===
      'due'
  ) {
    return 'bg-amber-500/10 text-amber-700 dark:text-amber-300';
  }

  return 'bg-blue-500/10 text-blue-700 dark:text-blue-300';
}


export default function PaymentPlansWorkspace({
  data,
  pending,
  run,
}: {
  data:
    InvoicingWorkspaceData;
  pending:
    boolean;
  run:
    Runner;
}) {
  const eligibleInvoices =
    useMemo(
      () =>
        data.invoices
          .filter(
            invoice =>
              invoice.balanceDue >
                0 &&
              ![
                'draft',
                'pending_approval',
                'rejected',
                'paid',
                'cancelled',
                'void',
                'written_off',
              ].includes(
                invoice.status,
              ) &&
              !data.paymentPlans
                .some(
                  plan =>
                    plan.invoiceId ===
                      invoice.id &&
                    [
                      'active',
                      'overdue',
                    ].includes(
                      plan.status,
                    ),
                ),
          ),
      [
        data.invoices,
        data.paymentPlans,
      ],
    );

  const [
    invoiceId,
    setInvoiceId,
  ] =
    useState(
      '',
    );

  const [
    count,
    setCount,
  ] =
    useState(
      3,
    );

  const [
    firstDueDate,
    setFirstDueDate,
  ] =
    useState(
      '',
    );

  const [
    cadence,
    setCadence,
  ] =
    useState(
      'monthly',
    );

  const [
    installments,
    setInstallments,
  ] =
    useState<
      DraftInstallment[]
    >(
      [],
    );

  const selectedInvoice =
    eligibleInvoices
      .find(
        invoice =>
          invoice.id ===
          invoiceId,
      ) ||
    null;

  const activePlans =
    data.paymentPlans.filter(
      plan =>
        [
          'active',
          'overdue',
        ].includes(
          plan.status,
        ),
    );

  const companyPlans =
    activePlans.filter(
      plan =>
        plan.currency ===
          data.company.currency,
    );

  const scheduledBalance =
    companyPlans.reduce(
      (
        sum,
        plan,
      ) =>
        sum +
        plan.balanceDue,
      0,
    );

  const overdueInstallments =
    activePlans.reduce(
      (
        sum,
        plan,
      ) =>
        sum +
        plan.overdueInstallments,
      0,
    );

  const nextDue =
    activePlans
      .flatMap(
        plan =>
          plan.installments
            .filter(
              installment =>
                [
                  'scheduled',
                  'due',
                  'partially_paid',
                  'overdue',
                ].includes(
                  installment.status,
                ),
            )
            .map(
              installment => ({
                ...installment,
                currency:
                  plan.currency,
                planNumber:
                  plan.planNumber,
              }),
            ),
      )
      .sort(
        (
          left,
          right,
        ) =>
          left.dueDate
            .localeCompare(
              right.dueDate,
            ),
      )[0] ||
    null;

  function generate() {
    if (
      !selectedInvoice ||
      !firstDueDate
    ) {
      return;
    }

    setInstallments(
      buildInstallments(
        selectedInvoice
          .balanceDue,
        Math.max(
          2,
          Math.min(
            120,
            count,
          ),
        ),
        firstDueDate,
        cadence,
      ),
    );
  }

  const draftTotal =
    installments.reduce(
      (
        sum,
        installment,
      ) =>
        sum +
        (
          Number(
            installment.amount,
          ) ||
          0
        ),
      0,
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="sami-surface rounded-[22px] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">
            Active plans
          </p>
          <p className="mt-2 text-2xl font-black">
            {
              activePlans.length
            }
          </p>
        </div>

        <div className="sami-surface rounded-[22px] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">
            Scheduled balance
          </p>
          <p className="mt-2 text-xl font-black">
            {
              money(
                scheduledBalance,
                data.company.currency,
              )
            }
          </p>
        </div>

        <div className="sami-surface rounded-[22px] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">
            Overdue installments
          </p>
          <p className="mt-2 text-2xl font-black">
            {
              overdueInstallments
            }
          </p>
        </div>

        <div className="sami-surface rounded-[22px] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">
            Next due
          </p>
          <p className="mt-2 text-sm font-black">
            {
              nextDue
                ? nextDue
                    .dueDate
                : '—'
            }
          </p>
          {
            nextDue &&
            (
              <p className="mt-1 text-[10px] text-slate-600 dark:text-slate-300">
                {
                  nextDue.planNumber
                } · {
                  money(
                    nextDue.balanceDue,
                    nextDue.currency,
                  )
                }
              </p>
            )
          }
        </div>
      </div>

      {
        data.capabilities
          .canManagePaymentPlans &&
        (
          <section className="sami-surface rounded-[24px] p-4 sm:p-5">
            <div>
              <p className="text-sm font-black">
                Create installment plan
              </p>
              <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-600 dark:text-slate-300">
                Split the current unpaid invoice balance into dated installments. Payments and credit notes still settle the invoice through SaMi’s normal ledger and automatically flow across installments in order.
              </p>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="xl:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                  Invoice
                </span>
                <select
                  value={
                    invoiceId
                  }
                  onChange={
                    event => {
                      setInvoiceId(
                        event.target
                          .value,
                      );
                      setInstallments(
                        [],
                      );
                    }
                  }
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                >
                  <option value="">
                    Choose unpaid invoice
                  </option>
                  {
                    eligibleInvoices.map(
                      invoice => (
                        <option
                          key={
                            invoice.id
                          }
                          value={
                            invoice.id
                          }
                        >
                          {
                            invoice.invoiceNumber
                          } · {
                            invoice.customerName
                          } · {
                            money(
                              invoice.balanceDue,
                              invoice.currency,
                            )
                          }
                        </option>
                      ),
                    )
                  }
                </select>
              </label>

              <label>
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                  Installments
                </span>
                <input
                  type="number"
                  min="2"
                  max="120"
                  value={
                    count
                  }
                  onChange={
                    event => {
                      setCount(
                        Number(
                          event.target
                            .value,
                        ) ||
                        2,
                      );
                      setInstallments(
                        [],
                      );
                    }
                  }
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                />
              </label>

              <label>
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                  First due date
                </span>
                <input
                  type="date"
                  value={
                    firstDueDate
                  }
                  onChange={
                    event => {
                      setFirstDueDate(
                        event.target
                          .value,
                      );
                      setInstallments(
                        [],
                      );
                    }
                  }
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                />
              </label>

              <label>
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                  Cadence
                </span>
                <select
                  value={
                    cadence
                  }
                  onChange={
                    event => {
                      setCadence(
                        event.target
                          .value,
                      );
                      setInstallments(
                        [],
                      );
                    }
                  }
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                >
                  <option value="monthly">
                    Monthly
                  </option>
                  <option value="biweekly">
                    Every 2 weeks
                  </option>
                  <option value="weekly">
                    Weekly
                  </option>
                </select>
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {
                  selectedInvoice
                    ? 'Balance to schedule: ' +
                      money(
                        selectedInvoice
                          .balanceDue,
                        selectedInvoice
                          .currency,
                      )
                    : 'Choose an invoice to build its installment schedule.'
                }
              </p>

              <button
                type="button"
                disabled={
                  !selectedInvoice ||
                  !firstDueDate
                }
                onClick={
                  generate
                }
                className="h-10 rounded-xl border border-[var(--sami-border)] px-4 text-xs font-black disabled:opacity-50"
              >
                Generate schedule
              </button>
            </div>

            {
              installments.length >
                0 &&
              selectedInvoice &&
              (
                <form
                  className="mt-4"
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
                              'create_payment_plan',
                            invoiceId:
                              selectedInvoice
                                .id,
                            name:
                              form.get(
                                'name',
                              ),
                            notes:
                              form.get(
                                'notes',
                              ),
                            idempotencyKey:
                              typeof crypto !==
                                'undefined' &&
                              'randomUUID' in
                                crypto
                                ? crypto
                                    .randomUUID()
                                : Date.now()
                                    .toString(
                                      36,
                                    ),
                            installments:
                              installments.map(
                                installment => ({
                                  dueDate:
                                    installment.dueDate,
                                  amount:
                                    installment.amount,
                                  label:
                                    installment.label,
                                }),
                              ),
                          },
                          'Installment payment plan activated.',
                        );

                      if (
                        saved
                      ) {
                        element.reset();
                        setInvoiceId(
                          '',
                        );
                        setInstallments(
                          [],
                        );
                      }
                    }
                  }
                >
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <label>
                      <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                        Plan name
                      </span>
                      <input
                        name="name"
                        defaultValue={
                          selectedInvoice
                            .invoiceNumber +
                          ' installment plan'
                        }
                        maxLength={
                          180
                        }
                        required
                        className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                      />
                    </label>

                    <label>
                      <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                        Notes
                      </span>
                      <input
                        name="notes"
                        maxLength={
                          4000
                        }
                        placeholder="Agreement or payment-plan notes"
                        className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                      />
                    </label>
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--sami-border)]">
                    <table className="w-full min-w-[760px] text-left text-xs">
                      <thead className="bg-[var(--sami-surface-soft)] text-[9px] font-black uppercase tracking-[0.1em] text-slate-600 dark:text-slate-300">
                        <tr>
                          <th className="px-3 py-3">
                            #
                          </th>
                          <th className="px-3 py-3">
                            Label
                          </th>
                          <th className="px-3 py-3">
                            Due date
                          </th>
                          <th className="px-3 py-3">
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--sami-border)]">
                        {
                          installments.map(
                            (
                              installment,
                              index,
                            ) => (
                              <tr
                                key={
                                  index
                                }
                              >
                                <td className="px-3 py-3 font-black">
                                  {
                                    index +
                                    1
                                  }
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    value={
                                      installment.label
                                    }
                                    onChange={
                                      event =>
                                        setInstallments(
                                          current =>
                                            current.map(
                                              (
                                                item,
                                                itemIndex,
                                              ) =>
                                                itemIndex ===
                                                  index
                                                  ? {
                                                      ...item,
                                                      label:
                                                        event.target.value,
                                                    }
                                                  : item,
                                            ),
                                        )
                                    }
                                    maxLength={
                                      180
                                    }
                                    className="h-9 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="date"
                                    value={
                                      installment.dueDate
                                    }
                                    onChange={
                                      event =>
                                        setInstallments(
                                          current =>
                                            current.map(
                                              (
                                                item,
                                                itemIndex,
                                              ) =>
                                                itemIndex ===
                                                  index
                                                  ? {
                                                      ...item,
                                                      dueDate:
                                                        event.target.value,
                                                    }
                                                  : item,
                                            ),
                                        )
                                    }
                                    className="h-9 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={
                                      installment.amount
                                    }
                                    onChange={
                                      event =>
                                        setInstallments(
                                          current =>
                                            current.map(
                                              (
                                                item,
                                                itemIndex,
                                              ) =>
                                                itemIndex ===
                                                  index
                                                  ? {
                                                      ...item,
                                                      amount:
                                                        event.target.value,
                                                    }
                                                  : item,
                                            ),
                                        )
                                    }
                                    className="h-9 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2"
                                  />
                                </td>
                              </tr>
                            ),
                          )
                        }
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p
                      className={[
                        'text-xs font-black',
                        Math.abs(
                          draftTotal -
                          selectedInvoice
                            .balanceDue,
                        ) <=
                          0.01
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-red-700 dark:text-red-300',
                      ].join(
                        ' ',
                      )}
                    >
                      Schedule total: {
                        money(
                          draftTotal,
                          selectedInvoice
                            .currency,
                        )
                      } / {
                        money(
                          selectedInvoice
                            .balanceDue,
                          selectedInvoice
                            .currency,
                        )
                      }
                    </p>

                    <button
                      type="submit"
                      disabled={
                        pending ||
                        Math.abs(
                          draftTotal -
                          selectedInvoice
                            .balanceDue,
                        ) >
                          0.01
                      }
                      className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-50"
                    >
                      Activate plan
                    </button>
                  </div>
                </form>
              )
            }
          </section>
        )
      }

      <section className="sami-surface overflow-hidden rounded-[24px]">
        <div className="border-b border-[var(--sami-border)] p-4 sm:p-5">
          <p className="text-sm font-black">
            Installment plans
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
            Installment status is calculated from the invoice’s authoritative payment and credit settlement. Reversals automatically recalculate the schedule.
          </p>
        </div>

        <div className="divide-y divide-[var(--sami-border)]">
          {
            data.paymentPlans.map(
              plan => (
                <div
                  key={
                    plan.id
                  }
                  className="p-4 sm:p-5"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black">
                          {
                            plan.planNumber
                          }
                        </p>
                        <span
                          className={[
                            'rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide',
                            statusClass(
                              plan.status,
                            ),
                          ].join(
                            ' ',
                          )}
                        >
                          {
                            plan.status
                          }
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        {
                          plan.invoiceNumber
                        } · {
                          plan.customerName
                        } · {
                          plan.name
                        }
                      </p>

                      <p className="mt-1 text-[10px] text-slate-500">
                        Original due {
                          plan.originalDueDate
                        } · final installment {
                          plan.finalDueDate
                        }
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[560px]">
                      {
                        [
                          [
                            'Scheduled',
                            money(
                              plan.totalAmount,
                              plan.currency,
                            ),
                          ],
                          [
                            'Settled',
                            money(
                              plan.paidAmount,
                              plan.currency,
                            ),
                          ],
                          [
                            'Remaining',
                            money(
                              plan.balanceDue,
                              plan.currency,
                            ),
                          ],
                          [
                            'Progress',
                            plan.paidInstallments +
                            '/' +
                            plan.installmentCount,
                          ],
                        ].map(
                          (
                            [
                              label,
                              value,
                            ],
                          ) => (
                            <div
                              key={
                                label
                              }
                              className="rounded-xl bg-[var(--sami-surface-soft)] p-3"
                            >
                              <p className="text-[9px] font-black uppercase tracking-wide text-slate-500">
                                {
                                  label
                                }
                              </p>
                              <p className="mt-1 text-xs font-black">
                                {
                                  value
                                }
                              </p>
                            </div>
                          ),
                        )
                      }
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-xs">
                      <thead className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                        <tr>
                          <th className="px-2 py-2">#</th>
                          <th className="px-2 py-2">Installment</th>
                          <th className="px-2 py-2">Due</th>
                          <th className="px-2 py-2">Scheduled</th>
                          <th className="px-2 py-2">Paid</th>
                          <th className="px-2 py-2">Balance</th>
                          <th className="px-2 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--sami-border)]">
                        {
                          plan.installments.map(
                            installment => (
                              <tr
                                key={
                                  installment.id
                                }
                              >
                                <td className="px-2 py-2 font-black">
                                  {
                                    installment.sequenceNo
                                  }
                                </td>
                                <td className="px-2 py-2">
                                  {
                                    installment.label ||
                                    'Installment ' +
                                    installment.sequenceNo
                                  }
                                </td>
                                <td className="px-2 py-2">
                                  {
                                    installment.dueDate
                                  }
                                </td>
                                <td className="px-2 py-2">
                                  {
                                    money(
                                      installment.amount,
                                      plan.currency,
                                    )
                                  }
                                </td>
                                <td className="px-2 py-2">
                                  {
                                    money(
                                      installment.paidAmount,
                                      plan.currency,
                                    )
                                  }
                                </td>
                                <td className="px-2 py-2 font-black">
                                  {
                                    money(
                                      installment.balanceDue,
                                      plan.currency,
                                    )
                                  }
                                </td>
                                <td className="px-2 py-2">
                                  <span
                                    className={[
                                      'rounded-full px-2 py-1 text-[9px] font-black uppercase',
                                      statusClass(
                                        installment.status,
                                      ),
                                    ].join(
                                      ' ',
                                    )}
                                  >
                                    {
                                      installment.status
                                    }
                                  </span>
                                </td>
                              </tr>
                            ),
                          )
                        }
                      </tbody>
                    </table>
                  </div>

                  {
                    data.capabilities
                      .canManagePaymentPlans &&
                    [
                      'active',
                      'overdue',
                    ].includes(
                      plan.status,
                    ) &&
                    (
                      <details className="mt-3 rounded-xl border border-red-500/20 p-3">
                        <summary className="cursor-pointer text-xs font-black text-red-700 dark:text-red-300">
                          Cancel payment plan
                        </summary>
                        <form
                          className="mt-3 flex flex-col gap-2 sm:flex-row"
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
                                      'cancel_payment_plan',
                                    planId:
                                      plan.id,
                                    reason:
                                      form.get(
                                        'reason',
                                      ),
                                  },
                                  'Payment plan cancelled and original invoice due date restored where safe.',
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
                            className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs"
                          />
                          <button
                            type="submit"
                            disabled={
                              pending
                            }
                            className="h-10 rounded-xl border border-red-500/30 bg-red-500/10 px-4 text-xs font-black text-red-700 disabled:opacity-60 dark:text-red-300"
                          >
                            Cancel plan
                          </button>
                        </form>
                      </details>
                    )
                  }
                </div>
              ),
            )
          }

          {
            data.paymentPlans.length ===
              0 &&
            (
              <p className="p-8 text-center text-sm text-slate-600 dark:text-slate-300">
                No installment payment plans yet.
              </p>
            )
          }
        </div>
      </section>
    </div>
  );
}
