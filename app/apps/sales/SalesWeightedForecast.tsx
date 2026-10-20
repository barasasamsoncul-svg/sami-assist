import {
  BarChart3,
  CalendarClock,
  CircleDollarSign,
  Info,
  TrendingUp,
} from 'lucide-react';

type ForecastRow = {
  horizonDays: number;
  currency: string;
  opportunityCount: number;
  openPipelineValue: number;
  weightedPipelineValue: number;
};

const HORIZONS = [
  { days: 30, label: 'Next 30 days' },
  { days: 60, label: 'Next 60 days' },
  { days: 90, label: 'Next 90 days' },
] as const;

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

function ratio(weighted: number, open: number): number {
  if (!Number.isFinite(open) || open <= 0) return 0;
  return Math.min(100, Math.max(0, (weighted / open) * 100));
}

export default function SalesWeightedForecast({ rows }: { rows: ForecastRow[] }) {
  return (
    <section className="sami-surface rounded-[24px] p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-black">
            <TrendingUp className="h-4 w-4" />
            Weighted pipeline forecast
          </h2>
          <p className="mt-1 max-w-3xl text-xs text-slate-500 dark:text-slate-400">
            Open opportunities expected to close within each horizon. Weighted value uses
            the opportunity probability. Values stay grouped by currency and are never
            combined across currencies.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <BarChart3 className="h-3 w-3" />
          {rows.length} bucket{rows.length === 1 ? '' : 's'}
        </span>
      </header>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[var(--sami-border)] px-4 py-10 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <CalendarClock className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-black">No forecast yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
            No open opportunities have an expected close date within the next 90 days. Add
            expected close dates to build the forecast.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          {HORIZONS.map((horizon) => {
            const horizonRows = rows.filter(
              (row) => row.horizonDays === horizon.days,
            );
            const totals = horizonRows.reduce(
              (acc, row) => {
                acc.opportunityCount += row.opportunityCount;
                acc.openPipelineValue += row.openPipelineValue;
                acc.weightedPipelineValue += row.weightedPipelineValue;
                return acc;
              },
              {
                opportunityCount: 0,
                openPipelineValue: 0,
                weightedPipelineValue: 0,
              },
            );
            const overallRatio = ratio(
              totals.weightedPipelineValue,
              totals.openPipelineValue,
            );

            return (
              <section
                key={horizon.days}
                className="min-w-0 rounded-2xl border border-[var(--sami-border)] p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.08em]">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {horizon.label}
                  </h3>
                  {horizonRows.length > 0 ? (
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      {horizonRows.length} currenc
                      {horizonRows.length === 1 ? 'y' : 'ies'}
                    </span>
                  ) : null}
                </div>

                {horizonRows.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    No opportunities with a close date in this horizon.
                  </p>
                ) : (
                  <>
                    {horizonRows.length > 1 ? (
                      <div className="mt-3 rounded-xl bg-slate-500/[0.04] p-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                          Weighted share
                        </p>
                        <div
                          className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--sami-border)]"
                          role="img"
                          aria-label={`Weighted-to-open ratio ${overallRatio.toFixed(1)} percent across all currencies`}
                        >
                          <div
                            className={
                              'h-full rounded-full ' +
                              (overallRatio >= 60
                                ? 'bg-emerald-500'
                                : overallRatio >= 30
                                  ? 'bg-blue-500'
                                  : overallRatio > 0
                                    ? 'bg-amber-500'
                                    : 'bg-slate-400')
                            }
                            style={{ width: `${Math.max(2, overallRatio)}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                          {overallRatio.toFixed(1)}% weighted · {totals.opportunityCount}{' '}
                          opp{totals.opportunityCount === 1 ? '' : 's'}
                        </p>
                      </div>
                    ) : null}

                    <div className="mt-3 space-y-3">
                      {horizonRows.map((row) => {
                        const perRowRatio = ratio(
                          row.weightedPipelineValue,
                          row.openPipelineValue,
                        );
                        return (
                          <div
                            key={horizon.days + '-' + row.currency}
                            className="border-b border-[var(--sami-border)] pb-3 last:border-0 last:pb-0"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                {row.currency}
                              </span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                {row.opportunityCount.toLocaleString()} opportunit
                                {row.opportunityCount === 1 ? 'y' : 'ies'}
                              </span>
                            </div>

                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              <div>
                                <p className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
                                  <CircleDollarSign className="h-2.5 w-2.5" />
                                  Open pipeline
                                </p>
                                <p className="break-words text-sm font-bold tabular-nums">
                                  {formatMoney(row.openPipelineValue, row.currency)}
                                </p>
                              </div>
                              <div>
                                <p className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
                                  <TrendingUp className="h-2.5 w-2.5" />
                                  Probability-weighted
                                </p>
                                <p className="break-words text-sm font-black tabular-nums">
                                  {formatMoney(
                                    row.weightedPipelineValue,
                                    row.currency,
                                  )}
                                </p>
                              </div>
                            </div>

                            <div className="mt-2 flex items-center gap-2">
                              <div
                                className="h-1 w-full overflow-hidden rounded-full bg-[var(--sami-border)]"
                                role="img"
                                aria-label={`Weighted ${perRowRatio.toFixed(1)} percent of open pipeline`}
                              >
                                <div
                                  className={
                                    'h-full rounded-full ' +
                                    (perRowRatio >= 60
                                      ? 'bg-emerald-500'
                                      : perRowRatio >= 30
                                        ? 'bg-blue-500'
                                        : perRowRatio > 0
                                          ? 'bg-amber-500'
                                          : 'bg-slate-400')
                                  }
                                  style={{ width: `${Math.max(2, perRowRatio)}%` }}
                                />
                              </div>
                              <span className="shrink-0 text-[10px] font-bold tabular-nums text-slate-500 dark:text-slate-400">
                                {perRowRatio.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}

      {rows.length > 0 ? (
        <p className="mt-3 inline-flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Weighted = open pipeline × probability. Each bar shows how much of open value is
          probability-weighted.
        </p>
      ) : null}
    </section>
  );
}