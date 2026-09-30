'use client';

import {
  useMemo,
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


function money(
  value:
    number,
  currency:
    string,
) {
  try {
    return new Intl.NumberFormat(
      'en-KE',
      {
        style:
          'currency',
        currency,
        maximumFractionDigits:
          2,
      },
    ).format(
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


function today() {
  return new Date()
    .toISOString()
    .slice(
      0,
      10,
    );
}


export default function CurrencyCenterWorkspace({
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
  const baseCurrency =
    data.settings
      .baseCurrency;

  const activeCurrencies =
    useMemo(
      () =>
        data.currencies
          .filter(
            currency =>
              currency.isActive,
          ),
      [
        data.currencies,
      ],
    );

  const foreignCurrencies =
    activeCurrencies
      .filter(
        currency =>
          currency.code !==
          baseCurrency,
      );

  const openBaseExposure =
    data.currencyExposure
      .reduce(
        (
          total,
          row,
        ) =>
          total +
          row.openBaseAmount,
        0,
      );

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            Base currency
          </p>
          <p className="mt-2 text-2xl font-black">
            {baseCurrency}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Dashboard and receivables reporting are consolidated in this currency.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            Active currencies
          </p>
          <p className="mt-2 text-2xl font-black">
            {activeCurrencies.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Transaction currencies available for billing and customer receipts.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            Open exposure
          </p>
          <p className="mt-2 text-2xl font-black">
            {
              money(
                openBaseExposure,
                baseCurrency,
              )
            }
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Open invoice balances converted using each invoice&apos;s locked rate.
          </p>
        </div>
      </section>

      {
        data.capabilities
          .canManageSettings &&
        (
          <section className="grid gap-4 xl:grid-cols-2">
            <form
              className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-5 shadow-sm"
              onSubmit={
                async event => {
                  event.preventDefault();

                  const form =
                    new FormData(
                      event.currentTarget,
                    );

                  const saved =
                    await run(
                      {
                        action:
                          'save_currency',
                        code:
                          form.get(
                            'code',
                          ),
                        name:
                          form.get(
                            'name',
                          ),
                        symbol:
                          form.get(
                            'symbol',
                          ),
                        decimalPlaces:
                          form.get(
                            'decimalPlaces',
                          ),
                        isBase:
                          form.get(
                            'isBase',
                          ) ===
                          'on',
                        isActive:
                          true,
                      },
                      'Currency saved.',
                    );

                  if (saved) {
                    event.currentTarget
                      .reset();
                  }
                }
              }
            >
              <h3 className="text-sm font-black">
                Add or update currency
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Use ISO three-letter codes. Setting a currency as base changes future consolidated reporting; historical invoices keep their locked rates.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold">
                  Currency code
                  <input
                    name="code"
                    required
                    maxLength={3}
                    placeholder="USD"
                    className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 uppercase"
                  />
                </label>

                <label className="text-xs font-bold">
                  Currency name
                  <input
                    name="name"
                    required
                    maxLength={120}
                    placeholder="US Dollar"
                    className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3"
                  />
                </label>

                <label className="text-xs font-bold">
                  Symbol
                  <input
                    name="symbol"
                    maxLength={16}
                    placeholder="$"
                    className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3"
                  />
                </label>

                <label className="text-xs font-bold">
                  Decimal places
                  <input
                    name="decimalPlaces"
                    type="number"
                    min={0}
                    max={6}
                    defaultValue={2}
                    className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3"
                  />
                </label>
              </div>

              <label className="mt-3 flex items-center gap-2 text-xs font-bold">
                <input
                  name="isBase"
                  type="checkbox"
                />
                Make this the base reporting currency
              </label>

              <button
                type="submit"
                disabled={pending}
                className="mt-4 h-10 rounded-xl sami-contrast-invert px-4 text-xs font-black disabled:opacity-60"
              >
                Save currency
              </button>
            </form>

            <form
              className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-5 shadow-sm"
              onSubmit={
                async event => {
                  event.preventDefault();

                  const form =
                    new FormData(
                      event.currentTarget,
                    );

                  const saved =
                    await run(
                      {
                        action:
                          'save_exchange_rate',
                        currency:
                          form.get(
                            'currency',
                          ),
                        rate:
                          form.get(
                            'rate',
                          ),
                        effectiveDate:
                          form.get(
                            'effectiveDate',
                          ),
                        sourceType:
                          'manual',
                        sourceName:
                          form.get(
                            'sourceName',
                          ),
                        note:
                          form.get(
                            'note',
                          ),
                      },
                      'Exchange rate saved.',
                    );

                  if (saved) {
                    const element =
                      event.currentTarget;
                    element.reset();

                    const date =
                      element.elements
                        .namedItem(
                          'effectiveDate',
                        );

                    if (
                      date instanceof
                        HTMLInputElement
                    ) {
                      date.value =
                        today();
                    }
                  }
                }
              }
            >
              <h3 className="text-sm font-black">
                Add dated exchange rate
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Rate means 1 unit of the transaction currency expressed in {baseCurrency}. SaMi selects the latest rate on or before the transaction date.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold">
                  Currency
                  <select
                    name="currency"
                    required
                    className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3"
                  >
                    <option value="">
                      Select currency
                    </option>
                    {
                      foreignCurrencies.map(
                        currency => (
                          <option
                            key={
                              currency.id
                            }
                            value={
                              currency.code
                            }
                          >
                            {
                              currency.code
                            } — {
                              currency.name
                            }
                          </option>
                        ),
                      )
                    }
                  </select>
                </label>

                <label className="text-xs font-bold">
                  Rate to {baseCurrency}
                  <input
                    name="rate"
                    type="number"
                    step="0.00000001"
                    min="0.00000001"
                    required
                    placeholder="129.50000000"
                    className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3"
                  />
                </label>

                <label className="text-xs font-bold">
                  Effective date
                  <input
                    name="effectiveDate"
                    type="date"
                    required
                    defaultValue={
                      today()
                    }
                    className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3"
                  />
                </label>

                <label className="text-xs font-bold">
                  Source
                  <input
                    name="sourceName"
                    maxLength={120}
                    placeholder="Bank / Central bank / Manual"
                    className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3"
                  />
                </label>
              </div>

              <label className="mt-3 block text-xs font-bold">
                Note
                <input
                  name="note"
                  maxLength={1000}
                  placeholder="Optional audit note"
                  className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3"
                />
              </label>

              <button
                type="submit"
                disabled={
                  pending ||
                  foreignCurrencies.length ===
                    0
                }
                className="mt-4 h-10 rounded-xl sami-contrast-invert px-4 text-xs font-black disabled:opacity-60"
              >
                Save exchange rate
              </button>
            </form>
          </section>
        )
      }

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] shadow-sm">
          <div className="border-b border-[var(--sami-border)] px-5 py-4">
            <h3 className="text-sm font-black">
              Currency register
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-[var(--sami-surface-soft)] text-[10px] uppercase tracking-[0.1em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">
                    Currency
                  </th>
                  <th className="px-4 py-3">
                    Role
                  </th>
                  <th className="px-4 py-3">
                    Precision
                  </th>
                </tr>
              </thead>
              <tbody>
                {
                  data.currencies.map(
                    currency => (
                      <tr
                        key={
                          currency.id
                        }
                        className="border-t border-[var(--sami-border)]"
                      >
                        <td className="px-4 py-3">
                          <p className="font-black">
                            {
                              currency.code
                            } · {
                              currency.symbol
                            }
                          </p>
                          <p className="mt-1 text-slate-500">
                            {
                              currency.name
                            }
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {
                            currency.isBase
                              ? 'Base'
                              : currency.isActive
                                ? 'Active'
                                : 'Inactive'
                          }
                        </td>
                        <td className="px-4 py-3">
                          {
                            currency.decimalPlaces
                          } decimals
                        </td>
                      </tr>
                    ),
                  )
                }
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] shadow-sm">
          <div className="border-b border-[var(--sami-border)] px-5 py-4">
            <h3 className="text-sm font-black">
              Currency exposure
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Original balances and their locked base-currency equivalents.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-[var(--sami-surface-soft)] text-[10px] uppercase tracking-[0.1em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">
                    Currency
                  </th>
                  <th className="px-4 py-3 text-right">
                    Open
                  </th>
                  <th className="px-4 py-3 text-right">
                    Base value
                  </th>
                </tr>
              </thead>
              <tbody>
                {
                  data.currencyExposure.map(
                    row => (
                      <tr
                        key={
                          row.currency
                        }
                        className="border-t border-[var(--sami-border)]"
                      >
                        <td className="px-4 py-3">
                          <p className="font-black">
                            {
                              row.currency
                            }
                          </p>
                          <p className="mt-1 text-slate-500">
                            {
                              row.openInvoiceCount
                            } open invoices
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right font-bold">
                          {
                            money(
                              row.openAmount,
                              row.currency,
                            )
                          }
                        </td>
                        <td className="px-4 py-3 text-right font-black">
                          {
                            money(
                              row.openBaseAmount,
                              row.baseCurrency,
                            )
                          }
                        </td>
                      </tr>
                    ),
                  )
                }

                {
                  data.currencyExposure
                    .length ===
                    0 &&
                  (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-8 text-center text-slate-500"
                      >
                        No currency exposure yet.
                      </td>
                    </tr>
                  )
                }
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] shadow-sm">
        <div className="border-b border-[var(--sami-border)] px-5 py-4">
          <h3 className="text-sm font-black">
            Exchange-rate history
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Historical rates remain dated and auditable; invoices and payments store their locked transaction rate.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-[var(--sami-surface-soft)] text-[10px] uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-4 py-3">
                  Pair
                </th>
                <th className="px-4 py-3">
                  Effective
                </th>
                <th className="px-4 py-3 text-right">
                  Rate
                </th>
                <th className="px-4 py-3">
                  Source
                </th>
              </tr>
            </thead>
            <tbody>
              {
                data.exchangeRates.map(
                  rate => (
                    <tr
                      key={
                        rate.id
                      }
                      className="border-t border-[var(--sami-border)]"
                    >
                      <td className="px-4 py-3 font-black">
                        {
                          rate.currency
                        } / {
                          rate.baseCurrency
                        }
                      </td>
                      <td className="px-4 py-3">
                        {
                          rate.effectiveDate
                        }
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-black">
                        {
                          rate.rate
                            .toLocaleString(
                              undefined,
                              {
                                maximumFractionDigits:
                                  8,
                              },
                            )
                        }
                      </td>
                      <td className="px-4 py-3">
                        {
                          rate.sourceName ||
                          rate.sourceType
                        }
                      </td>
                    </tr>
                  ),
                )
              }

              {
                data.exchangeRates
                  .length ===
                  0 &&
                (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      No foreign exchange rates have been recorded.
                    </td>
                  </tr>
                )
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
