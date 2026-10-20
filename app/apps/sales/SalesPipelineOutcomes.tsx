import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';

import type {
  SalesPipelineLossReason,
  SalesPipelineOutcomeSummary,
} from '@/lib/apps/sales/pipeline-outcomes';

/* -------------------------------------------------------------------------- */
/*  Formatting                                                                */
/* -------------------------------------------------------------------------- */

function formatMoney(value: number, currency: string): string {
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

function formatDays(value: number | null): string {
  return value == null ? '—' : Math.round(value).toLocaleString() + ' days';
}

/* -------------------------------------------------------------------------- */
/*  Root                                                                      */
/* -------------------------------------------------------------------------- */

export default function SalesPipelineOutcomes({
  summaries,
  lossReasons,
}: {
  summaries: SalesPipelineOutcomeSummary[];
  lossReasons: SalesPipelineLossReason[];
}) {
  const currencies = Array.from(
    new Set([
      ...summaries.map((row) => row.currency),
      ...lossReasons.map((row) => row.currency),
    ]),
  ).sort();

  const totalClosed = summaries.reduce((sum, row) => sum + row.closedCount, 0);
  const totalWon = summaries.reduce((sum, row) => sum + row.wonCount, 0);
  const totalLost = summaries.reduce((sum, row) => sum + row.lostCount, 0);
  const aggregateWinRate =
    totalWon + totalLost > 0
      ? Math.round((totalWon / (totalWon + totalLost)) * 100)
      : null;

  return (
    <section className="space-y-4">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <header>
        <h2 className="text-base font-black tracking-tight">Win/loss performance</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
          Opportunities closed in the last 90 days. Win rate uses won and lost
          opportunities with recorded close outcomes. Sales-cycle duration runs
          from opportunity creation to its recorded close date. Figures remain
          separated by currency.
        </p>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* KPI strip                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          label="Closed opportunities"
          value={totalClosed.toLocaleString()}
          detail={`Across ${currencies.length} currenc${currencies.length === 1 ? 'y' : 'ies'}`}
        />
        <KpiCard
          icon={<ArrowUpRight className="h-4 w-4" aria-hidden="true" />}
          label="Won"
          value={totalWon.toLocaleString()}
          detail={
            aggregateWinRate != null
              ? `Aggregate win rate ${aggregateWinRate}%`
              : 'No closed outcomes yet'
          }
          tone="success"
        />
        <KpiCard
          icon={<ArrowDownRight className="h-4 w-4" aria-hidden="true" />}
          label="Lost"
          value={totalLost.toLocaleString()}
          detail="Excluded from win-rate numerator"
          tone="danger"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
          label="Win rate"
          value={aggregateWinRate == null ? '—' : `${aggregateWinRate}%`}
          detail="Won ÷ (won + lost)"
          tone={aggregateWinRate != null && aggregateWinRate >= 50 ? 'success' : 'warning'}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Outcome cards                                                      */}
      {/* ------------------------------------------------------------------ */}
      {summaries.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <div
            aria-hidden="true"
            className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
          >
            <TrendingUp className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-black">No closed outcomes yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
            No opportunities were won or lost in the last 90 days. Closed
            outcomes will appear here as your team updates the pipeline.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {summaries.map((row) => {
            const winRate = row.winRate == null ? null : Math.round(row.winRate);
            const wonBarPercent =
              row.wonCount + row.lostCount > 0
                ? Math.round(
                    (row.wonCount / (row.wonCount + row.lostCount)) * 100,
                  )
                : 0;

            return (
              <article
                key={row.currency}
                className="min-w-0 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {row.currency}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {row.closedCount.toLocaleString()} closed
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                      Win rate
                    </p>
                    <p
                      className={
                        'mt-0.5 text-2xl font-black tabular-nums ' +
                        (winRate == null
                          ? 'text-slate-400 dark:text-slate-500'
                          : winRate >= 50
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400')
                      }
                    >
                      {winRate == null ? '—' : `${winRate}%`}
                    </p>
                  </div>
                </div>

                {/* Won / lost bar */}
                <div className="px-5 pt-4">
                  <div
                    className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                    role="img"
                    aria-label={`Won ${row.wonCount} versus lost ${row.lostCount}`}
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                      style={{ width: `${wonBarPercent}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                      />
                      {wonBarPercent}% won
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full bg-rose-500"
                      />
                      {100 - wonBarPercent}% lost
                    </span>
                  </div>
                </div>

                {/* Won / lost stat pair */}
                <dl className="grid grid-cols-2 gap-3 px-5 pt-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                    <dt className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      Won
                    </dt>
                    <dd className="mt-1 text-lg font-black tabular-nums">
                      {row.wonCount.toLocaleString()}
                    </dd>
                    <dd className="mt-0.5 break-words text-xs text-slate-600 dark:text-slate-300">
                      {formatMoney(row.wonValue, row.currency)}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3 dark:border-rose-900/60 dark:bg-rose-950/20">
                    <dt className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-rose-700 dark:text-rose-300">
                      <XCircle className="h-3 w-3" aria-hidden="true" />
                      Lost
                    </dt>
                    <dd className="mt-1 text-lg font-black tabular-nums">
                      {row.lostCount.toLocaleString()}
                    </dd>
                    <dd className="mt-0.5 break-words text-xs text-slate-600 dark:text-slate-300">
                      {formatMoney(row.lostValue, row.currency)}
                    </dd>
                  </div>
                </dl>

                {/* Cycle duration */}
                <div className="mt-4 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
                  <h4 className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                    <Clock3 className="h-3 w-3" aria-hidden="true" />
                    Sales-cycle duration
                  </h4>
                  <dl className="mt-3 grid grid-cols-3 gap-3">
                    <CycleStat
                      label="Avg to win"
                      value={formatDays(row.averageDaysToWin)}
                      tone="success"
                    />
                    <CycleStat
                      label="Median to win"
                      value={formatDays(row.medianDaysToWin)}
                      tone="success"
                    />
                    <CycleStat
                      label="Avg to lose"
                      value={formatDays(row.averageDaysToLose)}
                      tone="danger"
                    />
                  </dl>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Loss reasons                                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-black">Top loss reasons</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Up to five reasons per currency, ranked by lost opportunity
                count then lost value.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {lossReasons.length} row{lossReasons.length === 1 ? '' : 's'}
          </span>
        </div>

        {lossReasons.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div
              aria-hidden="true"
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
            >
              <TrendingDown className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-black">No loss reasons recorded</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
              No lost opportunities were recorded in this period.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {currencies
              .filter((currency) =>
                lossReasons.some((row) => row.currency === currency),
              )
              .map((currency) => {
                const rows = lossReasons.filter(
                  (row) => row.currency === currency,
                );
                const maxCount = Math.max(
                  1,
                  ...rows.map((row) => row.opportunityCount),
                );

                return (
                  <section key={currency} className="px-5 py-4">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {currency}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {rows.length} reason{rows.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {rows.map((row) => {
                        const barPercent = Math.max(
                          2,
                          Math.round((row.opportunityCount / maxCount) * 100),
                        );
                        return (
                          <li
                            key={row.reason}
                            className="rounded-xl border border-slate-200 bg-slate-50/40 p-3 dark:border-slate-800 dark:bg-slate-950/30"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <p className="min-w-0 break-words text-sm font-bold">
                                {row.reason}
                              </p>
                              <p className="shrink-0 text-sm font-black tabular-nums">
                                {formatMoney(row.lostValue, row.currency)}
                              </p>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <div
                                className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
                                role="img"
                                aria-label={`${row.opportunityCount} opportunities`}
                              >
                                <div
                                  className="h-full rounded-full bg-rose-500"
                                  style={{ width: `${barPercent}%` }}
                                />
                              </div>
                              <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
                                {row.opportunityCount.toLocaleString()}{' '}
                                opportunit
                                {row.opportunityCount === 1 ? 'y' : 'ies'}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
          </div>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

type KpiTone = 'default' | 'success' | 'warning' | 'danger';

const KPI_TONES: Record<KpiTone, { bg: string; fg: string; ring: string }> = {
  default: {
    bg: 'bg-slate-100 dark:bg-slate-800/60',
    fg: 'text-slate-600 dark:text-slate-300',
    ring: '',
  },
  success: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    fg: 'text-emerald-600 dark:text-emerald-400',
    ring: 'ring-1 ring-emerald-500/10 dark:ring-emerald-500/20',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    fg: 'text-amber-600 dark:text-amber-400',
    ring: 'ring-1 ring-amber-500/10 dark:ring-amber-500/20',
  },
  danger: {
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    fg: 'text-rose-600 dark:text-rose-400',
    ring: 'ring-1 ring-rose-500/10 dark:ring-rose-500/20',
  },
};

function KpiCard({
  icon,
  label,
  value,
  detail,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: KpiTone;
}) {
  const palette = KPI_TONES[tone];
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
          {label}
        </p>
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${palette.bg} ${palette.fg} ${palette.ring}`}
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 text-2xl font-black tabular-nums tracking-tight">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {detail}
      </p>
    </div>
  );
}

function CycleStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'success' | 'danger';
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-black uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd
        className={
          'mt-0.5 break-words text-sm font-bold tabular-nums ' +
          (tone === 'success'
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-rose-700 dark:text-rose-400')
        }
      >
        {value}
      </dd>
    </div>
  );
}