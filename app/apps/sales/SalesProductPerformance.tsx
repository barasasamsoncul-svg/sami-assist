import type { SalesProductPerformanceRow } from '@/lib/apps/sales/product-performance';

import {
  AlertTriangle,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Box,
  Package,
  TrendingUp,
} from 'lucide-react';

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return currency + ' ' + value.toLocaleString();
  }
}

function quantity(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function marginRatio(margin: number, net: number): number | null {
  if (!Number.isFinite(net) || net === 0) return null;
  return margin / net;
}

function marginTone(ratio: number | null): 'good' | 'warn' | 'bad' | 'muted' {
  if (ratio === null) return 'muted';
  if (ratio >= 0.25) return 'good';
  if (ratio >= 0) return 'warn';
  return 'bad';
}

function marginClass(tone: 'good' | 'warn' | 'bad' | 'muted'): string {
  switch (tone) {
    case 'good':
      return 'text-emerald-700 dark:text-emerald-300';
    case 'warn':
      return 'text-amber-700 dark:text-amber-300';
    case 'bad':
      return 'text-red-700 dark:text-red-300';
    case 'muted':
      return 'text-slate-500 dark:text-slate-400';
  }
}

function progressPercent(part: number, whole: number): number {
  if (!Number.isFinite(whole) || whole <= 0) return 0;
  return Math.min(100, Math.max(0, (part / whole) * 100));
}

export default function SalesProductPerformance({
  rows,
}: {
  rows: SalesProductPerformanceRow[];
}) {
  const currencies = Array.from(new Set(rows.map((row) => row.currency)));

  const totalRows = rows.length;

  return (
    <section className="sami-surface rounded-[24px] p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black">Product and service performance</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Order lines from confirmed and closed orders dated within the last 90 days.
            Sales exclude tax and include line discounts; currency totals are kept
            separate. Returns are not netted into these order-line totals.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Package className="h-3 w-3" />
          {totalRows} line{totalRows === 1 ? '' : 's'}
        </span>
      </header>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-5 space-y-8">
          {currencies.map((currency) => {
            const currencyRows = rows.filter((row) => row.currency === currency);
            const totals = currencyRows.reduce(
              (acc, row) => {
                acc.orderCount += row.orderCount;
                acc.lineCount += row.lineCount;
                acc.netSales += row.netSales;
                acc.discountAmount += row.discountAmount;
                acc.marginAmount += row.marginAmount;
                return acc;
              },
              {
                orderCount: 0,
                lineCount: 0,
                netSales: 0,
                discountAmount: 0,
                marginAmount: 0,
              },
            );
            const totalMarginRatio = marginRatio(totals.marginAmount, totals.netSales);
            const totalTone = marginTone(totalMarginRatio);

            return (
              <section key={currency} aria-label={currency + ' product performance'}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {currency}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {currencyRows.length} item{currencyRows.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <dl className="flex flex-wrap items-center gap-3 text-[11px]">
                    <SummaryStat label="Orders" value={totals.orderCount.toLocaleString()} />
                    <SummaryStat label="Lines" value={totals.lineCount.toLocaleString()} />
                    <SummaryStat
                      label="Net sales"
                      value={money(totals.netSales, currency)}
                      bold
                    />
                    <SummaryStat
                      label="Discounts"
                      value={money(totals.discountAmount, currency)}
                    />
                    <SummaryStat
                      label="Margin"
                      value={
                        <span className={marginClass(totalTone)}>
                          {money(totals.marginAmount, currency)}
                          {totalMarginRatio !== null ? (
                            <span className="ml-1 font-bold">
                              ({Math.round(totalMarginRatio * 100)}%)
                            </span>
                          ) : null}
                        </span>
                      }
                    />
                  </dl>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-[var(--sami-border)]">
                  <table className="w-full min-w-[1180px] text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50/80 backdrop-blur dark:bg-slate-900/70">
                      <tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        <th scope="col" className="px-3 py-3 text-left font-black">
                          Product / service
                        </th>
                        <th scope="col" className="px-3 py-3 text-left font-black">
                          SKU
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Orders
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Lines
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Ordered
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Shipped
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Delivered
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Invoiced
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-3 text-right font-black"
                          title="Ordered → Delivered progress"
                        >
                          Fulfilment
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Net sales
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Discounts
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Margin
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--sami-border)]">
                      {currencyRows.map((row) => {
                        const ratio = marginRatio(row.marginAmount, row.netSales);
                        const tone = marginTone(ratio);
                        const fulfilment = progressPercent(
                          row.quantityDelivered,
                          row.quantityOrdered,
                        );

                        return (
                          <tr
                            key={row.productKey + ':' + currency}
                            className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                          >
                            <th
                              scope="row"
                              className="max-w-[240px] px-3 py-3 text-left font-bold"
                            >
                              <div className="flex items-center gap-2">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                                  <Box className="h-3 w-3" />
                                </span>
                                <span className="truncate">{row.productName}</span>
                              </div>
                            </th>
                            <td className="max-w-[150px] truncate px-3 py-3 text-slate-500 dark:text-slate-400">
                              {row.sku || '—'}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {row.orderCount.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {row.lineCount.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {quantity(row.quantityOrdered)}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {quantity(row.quantityShipped)}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {quantity(row.quantityDelivered)}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {quantity(row.quantityInvoiced)}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center justify-end gap-2">
                                <div
                                  className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
                                  role="img"
                                  aria-label={`${Math.round(fulfilment)}% of ordered quantity delivered`}
                                >
                                  <div
                                    className={
                                      'h-full rounded-full ' +
                                      (fulfilment >= 100
                                        ? 'bg-emerald-500'
                                        : fulfilment >= 50
                                          ? 'bg-indigo-500'
                                          : fulfilment > 0
                                            ? 'bg-amber-500'
                                            : 'bg-slate-400')
                                    }
                                    style={{ width: `${Math.max(2, fulfilment)}%` }}
                                  />
                                </div>
                                <span className="w-9 text-right text-[10px] font-bold tabular-nums text-slate-500 dark:text-slate-400">
                                  {Math.round(fulfilment)}%
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right font-bold tabular-nums">
                              {money(row.netSales, currency)}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {money(row.discountAmount, currency)}
                            </td>
                            <td
                              className={`px-3 py-3 text-right tabular-nums ${marginClass(tone)}`}
                            >
                              <span className="font-bold">
                                {money(row.marginAmount, currency)}
                              </span>
                              {ratio !== null ? (
                                <span className="ml-1 text-[10px] font-bold">
                                  ({Math.round(ratio * 100)}%)
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {currencyRows.some((row) => row.marginAmount < 0) ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-3 w-3" />
                    Some items are selling below margin.
                  </p>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SummaryStat({
  label,
  value,
  bold,
}: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className={`tabular-nums ${bold ? 'text-sm font-black' : 'text-xs font-bold'}`}>
        {value}
      </dd>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-[var(--sami-border)] px-4 py-10 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        <TrendingUp className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-black">No eligible order lines yet</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
        Order lines from confirmed and closed orders in the last 90 days will appear
        here. Confirm or close an order to start populating this report.
      </p>
    </div>
  );
}