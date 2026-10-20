import {
  AlertTriangle,
  Award,
  Clock3,
  Info,
  Layers3,
  TrendingUp,
  UserRound,
} from 'lucide-react';

import type { SalesRepresentativePerformanceRow } from '@/lib/apps/sales/representative-performance';

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

function rate(value: number | null) {
  return value == null ? '—' : Math.round(value).toLocaleString() + '%';
}

function days(value: number | null) {
  return value == null ? '—' : Math.round(value).toLocaleString() + ' days';
}

function rateTone(value: number | null): 'good' | 'warn' | 'bad' | 'muted' {
  if (value == null) return 'muted';
  if (value >= 60) return 'good';
  if (value >= 30) return 'warn';
  if (value > 0) return 'bad';
  return 'muted';
}

function rateTextClass(tone: 'good' | 'warn' | 'bad' | 'muted') {
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

function rateBarClass(tone: 'good' | 'warn' | 'bad' | 'muted') {
  switch (tone) {
    case 'good':
      return 'bg-emerald-500';
    case 'warn':
      return 'bg-amber-500';
    case 'bad':
      return 'bg-red-500';
    case 'muted':
      return 'bg-slate-400';
  }
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export default function SalesRepresentativePerformance({
  rows,
}: {
  rows: SalesRepresentativePerformanceRow[];
}) {
  const currencies = Array.from(new Set(rows.map((row) => row.currency)));

  return (
    <section className="sami-surface rounded-[24px] p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="inline-flex items-center gap-1.5 text-base font-black">
            <TrendingUp className="h-4 w-4" />
            Salesperson pipeline performance
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Current open pipeline and overdue deals, plus win/loss outcomes recorded over
            the last 90 days. Currency totals remain separate.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <UserRound className="h-3 w-3" />
          {rows.length} row{rows.length === 1 ? '' : 's'}
        </span>
      </header>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[var(--sami-border)] px-4 py-10 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <Layers3 className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-black">No salesperson data yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
            No open opportunities or recorded wins/losses are available for this reporting
            period. Confirm or win/lose an opportunity to populate this report.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-8">
          {currencies.map((currency) => {
            const items = rows.filter((row) => row.currency === currency);
            const totals = items.reduce(
              (acc, row) => {
                acc.openOpportunityCount += row.openOpportunityCount;
                acc.openPipelineValue += row.openPipelineValue;
                acc.weightedPipelineValue += row.weightedPipelineValue;
                acc.overdueOpportunityCount += row.overdueOpportunityCount;
                acc.wonCount90Days += row.wonCount90Days;
                acc.wonValue90Days += row.wonValue90Days;
                acc.lostCount90Days += row.lostCount90Days;
                return acc;
              },
              {
                openOpportunityCount: 0,
                openPipelineValue: 0,
                weightedPipelineValue: 0,
                overdueOpportunityCount: 0,
                wonCount90Days: 0,
                wonValue90Days: 0,
                lostCount90Days: 0,
              },
            );
            const totalWinRate =
              totals.wonCount90Days + totals.lostCount90Days > 0
                ? (totals.wonCount90Days /
                    (totals.wonCount90Days + totals.lostCount90Days)) *
                  100
                : null;

            return (
              <section
                key={currency}
                aria-label={currency + ' salesperson performance'}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {currency}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {items.length} salesperson{items.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <dl className="flex flex-wrap items-center gap-3 text-[11px]">
                    <SummaryStat
                      icon={<Layers3 className="h-3 w-3" />}
                      label="Open"
                      value={totals.openOpportunityCount.toLocaleString()}
                    />
                    <SummaryStat
                      icon={<TrendingUp className="h-3 w-3" />}
                      label="Pipeline"
                      value={money(totals.openPipelineValue, currency)}
                    />
                    <SummaryStat
                      icon={<TrendingUp className="h-3 w-3" />}
                      label="Weighted"
                      value={money(totals.weightedPipelineValue, currency)}
                      bold
                    />
                    <SummaryStat
                      icon={<AlertTriangle className="h-3 w-3" />}
                      label="Overdue"
                      value={
                        <span
                          className={
                            totals.overdueOpportunityCount > 0
                              ? 'font-black text-red-700 dark:text-red-300'
                              : ''
                          }
                        >
                          {totals.overdueOpportunityCount.toLocaleString()}
                        </span>
                      }
                    />
                    <SummaryStat
                      icon={<Award className="h-3 w-3" />}
                      label="Won · 90d"
                      value={money(totals.wonValue90Days, currency)}
                      bold
                    />
                    <SummaryStat
                      icon={<Award className="h-3 w-3" />}
                      label="Win rate"
                      value={
                        <span className={rateTextClass(rateTone(totalWinRate))}>
                          {totalWinRate == null ? '—' : Math.round(totalWinRate) + '%'}
                        </span>
                      }
                    />
                  </dl>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-[var(--sami-border)]">
                  <table className="w-full min-w-[1080px] text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50/80 backdrop-blur dark:bg-slate-900/70">
                      <tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        <th scope="col" className="px-3 py-3 text-left font-black">
                          Salesperson
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Open deals
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Open pipeline
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Weighted
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Overdue
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Won · 90d
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Won value · 90d
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Lost · 90d
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Win rate · 90d
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Avg. days to win
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--sami-border)]">
                      {items.map((row, index) => {
                        const tone = rateTone(row.winRate90Days);
                        const width = row.winRate90Days == null ? 0 : clamp(row.winRate90Days);
                        return (
                          <tr
                            key={
                              (row.representativeId ?? 'unassigned') +
                              ':' +
                              currency +
                              ':' +
                              index
                            }
                            className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                          >
                            <th
                              scope="row"
                              className="max-w-[200px] truncate px-3 py-3 text-left font-bold"
                            >
                              <div className="flex items-center gap-2">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                                  <UserRound className="h-3 w-3" />
                                </span>
                                <span className="truncate">{row.representativeName}</span>
                              </div>
                            </th>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {row.openOpportunityCount.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {money(row.openPipelineValue, currency)}
                            </td>
                            <td className="px-3 py-3 text-right font-bold tabular-nums">
                              {money(row.weightedPipelineValue, currency)}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              <span
                                className={
                                  row.overdueOpportunityCount > 0
                                    ? 'inline-flex items-center gap-1 font-black text-red-700 dark:text-red-300'
                                    : ''
                                }
                              >
                                {row.overdueOpportunityCount > 0 ? (
                                  <Clock3 className="h-3 w-3" />
                                ) : null}
                                {row.overdueOpportunityCount.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {row.wonCount90Days.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {money(row.wonValue90Days, currency)}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {row.lostCount90Days.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              <div className="flex items-center justify-end gap-2">
                                <div
                                  className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
                                  role="img"
                                  aria-label={`Win rate ${rate(row.winRate90Days)}`}
                                >
                                  <div
                                    className={'h-full rounded-full ' + rateBarClass(tone)}
                                    style={{ width: `${Math.max(2, width)}%` }}
                                  />
                                </div>
                                <span
                                  className={
                                    'text-xs font-bold tabular-nums ' + rateTextClass(tone)
                                  }
                                >
                                  {rate(row.winRate90Days)}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {days(row.averageDaysToWin90Days)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {totals.overdueOpportunityCount > 0 ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-red-700 dark:text-red-300">
                    <AlertTriangle className="h-3 w-3" />
                    {totals.overdueOpportunityCount} overdue opportunit
                    {totals.overdueOpportunityCount === 1 ? 'y' : 'ies'} across this
                    currency.
                  </p>
                ) : (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <Info className="h-3 w-3" />
                    Win rate is computed from Won ÷ (Won + Lost) over the last 90 days.
                  </p>
                )}
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
  icon,
  bold,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </dt>
      <dd className={`tabular-nums ${bold ? 'text-sm font-black' : 'text-xs font-bold'}`}>
        {value}
      </dd>
    </div>
  );
}