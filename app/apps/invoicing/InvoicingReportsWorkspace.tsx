'use client';

import {
  useState,
} from 'react';

import {
  BarChart3,
  Download,
} from 'lucide-react';

import type {
  InvoicingWorkspaceData,
} from '@/lib/apps/invoicing/types';


type ReportTab =
  | 'overview'
  | 'customers'
  | 'itemsTax'
  | 'collections';


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
      value
        .toLocaleString()
    );
  }
}


function csvCell(
  value:
    unknown,
) {
  const text =
    String(
      value ??
      '',
    );

  return (
    '"' +
    text.replaceAll(
      '"',
      '""',
    ) +
    '"'
  );
}


function exportAnalytics(
  data:
    InvoicingWorkspaceData,
) {
  const rows:
    unknown[][] = [
      [
        'SaMi Invoicing Analytics',
        data.company.name,
        data.company.currency,
      ],
      [],
      [
        'KPI',
        'Value',
      ],
      [
        'Billed total',
        data.reporting
          .kpis
          .billedTotal,
      ],
      [
        'Collected total',
        data.reporting
          .kpis
          .collectedTotal,
      ],
      [
        'Collection rate %',
        data.reporting
          .kpis
          .collectionRate,
      ],
      [
        'DSO days',
        data.reporting
          .kpis
          .dsoDays,
      ],
      [
        'Average days to pay',
        data.reporting
          .kpis
          .averageDaysToPay,
      ],
      [
        'Average invoice value',
        data.reporting
          .kpis
          .averageInvoiceValue,
      ],
      [],
      [
        'Monthly trend',
      ],
      [
        'Month',
        'Invoices',
        'Payments',
        'Billed',
        'Collected',
        'Credits',
      ],
      ...data.reporting
        .monthlyTrend
        .map(
          item => [
            item.month,
            item.invoiceCount,
            item.paymentCount,
            item.billed,
            item.collected,
            item.credited,
          ],
        ),
      [],
      [
        'Customer exposure',
      ],
      [
        'Customer',
        'Invoices',
        'Billed',
        'Outstanding',
        'Overdue',
      ],
      ...data.reporting
        .customerExposure
        .map(
          item => [
            item.customerName,
            item.invoiceCount,
            item.billed,
            item.outstanding,
            item.overdue,
          ],
        ),
      [],
      [
        'Item performance',
      ],
      [
        'Item',
        'SKU',
        'Quantity',
        'Revenue',
        'Tax',
      ],
      ...data.reporting
        .itemPerformance
        .map(
          item => [
            item.itemName,
            item.sku ||
              '',
            item.quantity,
            item.revenue,
            item.tax,
          ],
        ),
      [],
      [
        'Tax summary',
      ],
      [
        'Tax',
        'Rate %',
        'Invoices',
        'Taxable amount',
        'Tax amount',
      ],
      ...data.reporting
        .taxSummary
        .map(
          item => [
            item.taxName,
            item.taxRate,
            item.invoiceCount,
            item.taxableAmount,
            item.taxAmount,
          ],
        ),
      [],
      [
        'Payment methods',
      ],
      [
        'Method',
        'Payments',
        'Gross',
        'Refunded',
        'Net',
      ],
      ...data.reporting
        .paymentMethods
        .map(
          item => [
            item.method,
            item.paymentCount,
            item.gross,
            item.refunded,
            item.net,
          ],
        ),
    ];

  const csv =
    rows
      .map(
        row =>
          row
            .map(
              csvCell,
            )
            .join(
              ',',
            ),
      )
      .join(
        '\n',
      );

  const blob =
    new Blob(
      [
        csv,
      ],
      {
        type:
          'text/csv;charset=utf-8',
      },
    );

  const url =
    URL.createObjectURL(
      blob,
    );

  const link =
    document.createElement(
      'a',
    );

  link.href =
    url;
  link.download =
    'invoicing-analytics-' +
    new Date()
      .toISOString()
      .slice(
        0,
        10,
      ) +
    '.csv';

  document.body
    .appendChild(
      link,
    );

  link.click();
  link.remove();

  URL.revokeObjectURL(
    url,
  );
}


function Empty({
  children,
}: {
  children:
    string;
}) {
  return (
    <p className="py-8 text-center text-sm text-slate-500">
      {
        children
      }
    </p>
  );
}


export default function InvoicingReportsWorkspace({
  data,
}: {
  data:
    InvoicingWorkspaceData;
}) {
  const [
    activeTab,
    setActiveTab,
  ] =
    useState<ReportTab>(
      'overview',
    );

  const currency =
    data.company.currency;

  const recentTrend =
    data.reporting
      .monthlyTrend
      .slice(
        -6,
      );

  const maxTrendAmount =
    Math.max(
      1,
      ...recentTrend
        .flatMap(
          item => [
            item.billed,
            item.collected,
          ],
        ),
    );

  const tabs:
    Array<{
      key: ReportTab;
      label: string;
    }> = [
      {
        key:
          'overview',
        label:
          'Overview',
      },
      {
        key:
          'customers',
        label:
          'Customers',
      },
      {
        key:
          'itemsTax',
        label:
          'Items & Tax',
      },
      {
        key:
          'collections',
        label:
          'Collections',
      },
    ];

  return (
    <div className="space-y-4">
      <section className="sami-surface rounded-[24px] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />

              <h2 className="text-base font-black sm:text-lg">
                Invoicing analytics
              </h2>
            </div>

            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">
              Base-currency reporting for billing, collections, receivables, customers, items and tax. Tabs keep mobile reporting focused instead of stacking every report into one long page.
            </p>
          </div>

          {
            data.capabilities
              .canExportReports &&
            (
              <button
                type="button"
                onClick={
                  () =>
                    exportAnalytics(
                      data,
                    )
                }
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
              >
                <Download className="h-4 w-4" />
                Export analytics CSV
              </button>
            )
          }
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {
            tabs.map(
              tab => (
                <button
                  key={
                    tab.key
                  }
                  type="button"
                  onClick={
                    () =>
                      setActiveTab(
                        tab.key,
                      )
                  }
                  className={
                    [
                      'min-h-10 shrink-0 rounded-xl border px-3 text-xs font-black transition',
                      activeTab ===
                        tab.key
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-[var(--sami-border)] bg-transparent text-[var(--sami-text)]',
                    ].join(
                      ' ',
                    )
                  }
                >
                  {
                    tab.label
                  }
                </button>
              ),
            )
          }
        </div>
      </section>

      {
        activeTab ===
          'overview' &&
        (
          <div className="space-y-4">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {
                [
                  {
                    label:
                      'Collection rate',
                    value:
                      data.reporting
                        .kpis
                        .collectionRate
                        .toFixed(
                          1,
                        ) +
                      '%',
                    hint:
                      'Posted allocations versus billed value',
                  },
                  {
                    label:
                      'DSO',
                    value:
                      data.reporting
                        .kpis
                        .dsoDays
                        .toFixed(
                          1,
                        ) +
                      ' days',
                    hint:
                      'Open receivables against trailing 90-day billing',
                  },
                  {
                    label:
                      'Average days to pay',
                    value:
                      data.reporting
                        .kpis
                        .averageDaysToPay
                        .toFixed(
                          1,
                        ) +
                      ' days',
                    hint:
                      'Posted allocation payment timing',
                  },
                  {
                    label:
                      'Average invoice',
                    value:
                      money(
                        data.reporting
                          .kpis
                          .averageInvoiceValue,
                        currency,
                      ),
                    hint:
                      'Average eligible invoice value',
                  },
                ].map(
                  item => (
                    <div
                      key={
                        item.label
                      }
                      className="sami-surface rounded-[22px] p-4"
                    >
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                        {
                          item.label
                        }
                      </p>

                      <p className="mt-2 break-words text-xl font-black">
                        {
                          item.value
                        }
                      </p>

                      <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                        {
                          item.hint
                        }
                      </p>
                    </div>
                  ),
                )
              }
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
              <div className="sami-surface rounded-[24px] p-4 sm:p-5">
                <p className="text-sm font-black">
                  Billing vs collections
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                  Latest six months shown here; the CSV export includes the full 12-month series with credits.
                </p>

                <div className="mt-4 space-y-4">
                  {
                    recentTrend.map(
                      item => (
                        <div
                          key={
                            item.month
                          }
                          className="rounded-2xl border border-[var(--sami-border)] p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-black">
                              {
                                item.month
                              }
                            </span>

                            <span className="text-slate-600 dark:text-slate-300">
                              {
                                item.invoiceCount
                              } invoices · {
                                item.paymentCount
                              } payments
                            </span>
                          </div>

                          <div className="mt-3 space-y-2">
                            {
                              [
                                {
                                  label:
                                    'Billed',
                                  value:
                                    item.billed,
                                  className:
                                    'bg-blue-600',
                                },
                                {
                                  label:
                                    'Collected',
                                  value:
                                    item.collected,
                                  className:
                                    'bg-emerald-600',
                                },
                              ].map(
                                series => (
                                  <div
                                    key={
                                      series.label
                                    }
                                  >
                                    <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs">
                                      <span className="font-bold">
                                        {
                                          series.label
                                        }
                                      </span>

                                      <span className="font-black">
                                        {
                                          money(
                                            series.value,
                                            currency,
                                          )
                                        }
                                      </span>
                                    </div>

                                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
                                      <div
                                        className={
                                          'h-full rounded-full ' +
                                          series.className
                                        }
                                        style={{
                                          width:
                                            Math.min(
                                              100,
                                              series.value /
                                              maxTrendAmount *
                                              100,
                                            ) +
                                            '%',
                                        }}
                                      />
                                    </div>
                                  </div>
                                ),
                              )
                            }
                          </div>
                        </div>
                      ),
                    )
                  }

                  {
                    recentTrend.length ===
                      0 &&
                    (
                      <Empty>
                        Billing and collection trends will appear after invoicing activity begins.
                      </Empty>
                    )
                  }
                </div>
              </div>

              <div className="sami-surface rounded-[24px] p-4 sm:p-5">
                <p className="text-sm font-black">
                  Status analysis
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                  Current invoice value and volume by lifecycle state.
                </p>

                <div className="mt-4 space-y-2">
                  {
                    data.statusCounts
                      .map(
                        item => (
                          <div
                            key={
                              item.status
                            }
                            className="rounded-xl border border-[var(--sami-border)] px-3 py-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="rounded-full border border-[var(--sami-border)] px-2 py-1 text-[11px] font-black capitalize">
                                {
                                  item.status
                                    .replaceAll(
                                      '_',
                                      ' ',
                                    )
                                }
                              </span>

                              <span className="text-xs font-bold text-slate-500">
                                {
                                  item.count
                                } invoices
                              </span>
                            </div>

                            <p className="mt-2 break-words text-sm font-black">
                              {
                                money(
                                  item.amount,
                                  currency,
                                )
                              }
                            </p>
                          </div>
                        ),
                      )
                  }

                  {
                    data.statusCounts
                      .length ===
                      0 &&
                    (
                      <Empty>
                        Status analytics will appear after invoicing activity begins.
                      </Empty>
                    )
                  }
                </div>
              </div>
            </section>
          </div>
        )
      }

      {
        activeTab ===
          'customers' &&
        (
          <section className="sami-surface rounded-[24px] p-4 sm:p-5">
            <p className="text-sm font-black">
              Customer exposure
            </p>

            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
              Highest outstanding customer balances first, expressed in {
                currency
              }.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[760px] w-full text-left text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="px-3 py-2">
                      Customer
                    </th>
                    <th className="px-3 py-2">
                      Invoices
                    </th>
                    <th className="px-3 py-2">
                      Billed
                    </th>
                    <th className="px-3 py-2">
                      Outstanding
                    </th>
                    <th className="px-3 py-2">
                      Overdue
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {
                    data.reporting
                      .customerExposure
                      .map(
                        item => (
                          <tr
                            key={
                              item.customerId
                            }
                            className="border-t border-[var(--sami-border)]"
                          >
                            <td className="px-3 py-3 font-black">
                              {
                                item.customerName
                              }
                            </td>
                            <td className="px-3 py-3">
                              {
                                item.invoiceCount
                              }
                            </td>
                            <td className="px-3 py-3 font-bold">
                              {
                                money(
                                  item.billed,
                                  currency,
                                )
                              }
                            </td>
                            <td className="px-3 py-3 font-black">
                              {
                                money(
                                  item.outstanding,
                                  currency,
                                )
                              }
                            </td>
                            <td className="px-3 py-3 font-black">
                              {
                                money(
                                  item.overdue,
                                  currency,
                                )
                              }
                            </td>
                          </tr>
                        ),
                      )
                  }

                  {
                    data.reporting
                      .customerExposure
                      .length ===
                      0 &&
                    (
                      <tr>
                        <td
                          colSpan={
                            5
                          }
                          className="px-3 py-10 text-center text-sm text-slate-500"
                        >
                          Customer exposure will appear after eligible invoices are posted.
                        </td>
                      </tr>
                    )
                  }
                </tbody>
              </table>
            </div>
          </section>
        )
      }

      {
        activeTab ===
          'itemsTax' &&
        (
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="sami-surface rounded-[24px] p-4 sm:p-5">
              <p className="text-sm font-black">
                Item performance
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                Top invoice lines by base-currency revenue.
              </p>

              <div className="mt-4 space-y-2">
                {
                  data.reporting
                    .itemPerformance
                    .map(
                      item => (
                        <div
                          key={
                            (
                              item.catalogItemId ||
                              item.itemName
                            ) +
                            ':' +
                            (
                              item.sku ||
                              ''
                            )
                          }
                          className="rounded-xl border border-[var(--sami-border)] p-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-black">
                                {
                                  item.itemName
                                }
                              </p>

                              <p className="mt-1 text-xs text-slate-500">
                                {
                                  item.sku
                                    ? 'SKU ' +
                                      item.sku +
                                      ' · '
                                    : ''
                                }
                                Qty {
                                  item.quantity
                                    .toLocaleString()
                                }
                              </p>
                            </div>

                            <p className="text-sm font-black">
                              {
                                money(
                                  item.revenue,
                                  currency,
                                )
                              }
                            </p>
                          </div>

                          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                            Tax {
                              money(
                                item.tax,
                                currency,
                              )
                            }
                          </p>
                        </div>
                      ),
                    )
                }

                {
                  data.reporting
                    .itemPerformance
                    .length ===
                    0 &&
                  (
                    <Empty>
                      Item performance will appear after eligible invoice lines are posted.
                    </Empty>
                  )
                }
              </div>
            </section>

            <section className="sami-surface rounded-[24px] p-4 sm:p-5">
              <p className="text-sm font-black">
                Tax summary
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                Taxable value and tax amount by invoice-line tax treatment.
              </p>

              <div className="mt-4 space-y-2">
                {
                  data.reporting
                    .taxSummary
                    .map(
                      item => (
                        <div
                          key={
                            item.taxName +
                            ':' +
                            item.taxRate
                          }
                          className="rounded-xl border border-[var(--sami-border)] p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-black">
                              {
                                item.taxName
                              } · {
                                item.taxRate
                              }%
                            </p>

                            <p className="text-sm font-black">
                              {
                                money(
                                  item.taxAmount,
                                  currency,
                                )
                              }
                            </p>
                          </div>

                          <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                            Taxable {
                              money(
                                item.taxableAmount,
                                currency,
                              )
                            } · {
                              item.invoiceCount
                            } invoices
                          </p>
                        </div>
                      ),
                    )
                }

                {
                  data.reporting
                    .taxSummary
                    .length ===
                    0 &&
                  (
                    <Empty>
                      Tax analytics will appear after taxable invoice lines are posted.
                    </Empty>
                  )
                }
              </div>
            </section>
          </div>
        )
      }

      {
        activeTab ===
          'collections' &&
        (
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="sami-surface rounded-[24px] p-4 sm:p-5">
              <p className="text-sm font-black">
                Receivables aging
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                Open balance distribution by aging bucket.
              </p>

              <div className="mt-4 space-y-2">
                {
                  data.aging
                    .map(
                      item => (
                        <div
                          key={
                            item.bucket
                          }
                          className="rounded-xl border border-[var(--sami-border)] p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-black">
                              {
                                item.bucket
                              }
                            </p>

                            <p className="text-sm font-black">
                              {
                                money(
                                  item.amount,
                                  currency,
                                )
                              }
                            </p>
                          </div>

                          <p className="mt-1 text-xs text-slate-500">
                            {
                              item.count
                            } invoices
                          </p>
                        </div>
                      ),
                    )
                }

                {
                  data.aging.length ===
                    0 &&
                  (
                    <Empty>
                      Aging analytics will appear after receivables are posted.
                    </Empty>
                  )
                }
              </div>
            </section>

            <section className="sami-surface rounded-[24px] p-4 sm:p-5">
              <p className="text-sm font-black">
                Payment methods
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                Posted payment value, refunds and net collections by method.
              </p>

              <div className="mt-4 space-y-2">
                {
                  data.reporting
                    .paymentMethods
                    .map(
                      item => (
                        <div
                          key={
                            item.method
                          }
                          className="rounded-xl border border-[var(--sami-border)] p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-black capitalize">
                              {
                                item.method
                                  .replaceAll(
                                    '_',
                                    ' ',
                                  )
                              }
                            </p>

                            <p className="text-sm font-black">
                              {
                                money(
                                  item.net,
                                  currency,
                                )
                              }
                            </p>
                          </div>

                          <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                            {
                              item.paymentCount
                            } payments · Gross {
                              money(
                                item.gross,
                                currency,
                              )
                            } · Refunded {
                              money(
                                item.refunded,
                                currency,
                              )
                            }
                          </p>
                        </div>
                      ),
                    )
                }

                {
                  data.reporting
                    .paymentMethods
                    .length ===
                    0 &&
                  (
                    <Empty>
                      Collection method analytics will appear after payments are posted.
                    </Empty>
                  )
                }
              </div>
            </section>
          </div>
        )
      }
    </div>
  );
}
