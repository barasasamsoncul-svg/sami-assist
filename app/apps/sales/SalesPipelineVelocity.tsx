import {
  ArrowRight,
  Clock3,
  Gauge,
  Hourglass,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import type { SalesPipelineVelocityRow } from '@/lib/apps/sales/pipeline-velocity';

/* -------------------------------------------------------------------------- */
/*  Formatting                                                                */
/* -------------------------------------------------------------------------- */

function formatDuration(days: number | null): string {
  return days == null ? '—' : days.toFixed(1) + ' days';
}

function durationTone(days: number | null): 'success' | 'warning' | 'danger' | 'default' {
  if (days == null) return 'default';
  if (days <= 7) return 'success';
  if (days <= 30) return 'warning';
  return 'danger';
}

/* -------------------------------------------------------------------------- */
/*  Root                                                                      */
/* -------------------------------------------------------------------------- */

export default function SalesPipelineVelocity({
  transitions,
}: {
  transitions: SalesPipelineVelocityRow[];
}) {
  const slowestMedian = transitions.reduce<number | null>(
    (max, row) =>
      row.medianDaysInStage == null
        ? max
        : max == null
          ? row.medianDaysInStage
          : Math.max(max, row.medianDaysInStage),
    null,
  );

  const fastestMedian = transitions.reduce<number | null>(
    (min, row) =>
      row.medianDaysInStage == null
        ? min
        : min == null
          ? row.medianDaysInStage
          : Math.min(min, row.medianDaysInStage),
    null,
  );

  const totalTransitions = transitions.reduce(
    (sum, row) => sum + row.transitionCount,
    0,
  );

  const totalOpportunities = transitions.reduce(
    (sum, row) => sum + row.opportunityCount,
    0,
  );

  return (
    <section className="space-y-4">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <header>
        <h2 className="text-base font-black tracking-tight">Pipeline stage velocity</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
          Stage transitions recorded in the last 90 days. Time in stage is
          measured from the previous recorded entry into the source stage to the
          transition out. Slowest median transitions appear first.
        </p>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* KPI strip                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<Gauge className="h-4 w-4" aria-hidden="true" />}
          label="Stage transitions"
          value={totalTransitions.toLocaleString()}
          detail={`Across ${transitions.length} path${transitions.length === 1 ? '' : 's'}`}
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
          label="Opportunities touched"
          value={totalOpportunities.toLocaleString()}
          detail="Distinct opportunities across shown paths"
        />
        <KpiCard
          icon={<Hourglass className="h-4 w-4" aria-hidden="true" />}
          label="Slowest median"
          value={formatDuration(slowestMedian)}
          detail={
            slowestMedian != null
              ? 'Where deals tend to stall'
              : 'No median data available'
          }
          tone="danger"
        />
        <KpiCard
          icon={<Clock3 className="h-4 w-4" aria-hidden="true" />}
          label="Fastest median"
          value={formatDuration(fastestMedian)}
          detail={
            fastestMedian != null
              ? 'Healthiest stage in the pipeline'
              : 'No median data available'
          }
          tone="success"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Transitions list                                                   */}
      {/* ------------------------------------------------------------------ */}
      {transitions.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <div
            aria-hidden="true"
            className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
          >
            <TrendingDown className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-black">No stage transitions yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
            No stage transitions were recorded in the last 90 days. As
            opportunities move through the pipeline, this report will reveal
            where deals tend to slow down.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {transitions.map((row) => {
            const medianTone = durationTone(row.medianDaysInStage);
            const medianBarPercent =
              row.medianDaysInStage != null && slowestMedian != null && slowestMedian > 0
                ? Math.max(
                    3,
                    Math.round((row.medianDaysInStage / slowestMedian) * 100),
                  )
                : 0;

            return (
              <article
                key={row.fromStageId + ':' + row.toStageId}
                className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                {/* Transition header */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {row.fromStageName}
                  </span>
                  <ArrowRight
                    className="h-3.5 w-3.5 text-slate-400"
                    aria-hidden="true"
                  />
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                    {row.toStageName}
                  </span>
                </div>

                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {row.opportunityCount.toLocaleString()} distinct{' '}
                  {row.opportunityCount === 1 ? 'opportunity' : 'opportunities'} ·{' '}
                  {row.transitionCount.toLocaleString()} recorded transition
                  {row.transitionCount === 1 ? '' : 's'}
                </p>

                {/* Median bar */}
                <div className="mt-3">
                  <div className="flex items-baseline justify-between text-[10px] font-black uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
                    <span>Median time in stage</span>
                    <span
                      className={
                        medianTone === 'success'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : medianTone === 'warning'
                            ? 'text-amber-700 dark:text-amber-400'
                            : medianTone === 'danger'
                              ? 'text-rose-700 dark:text-rose-400'
                              : 'text-slate-500 dark:text-slate-400'
                      }
                    >
                      {formatDuration(row.medianDaysInStage)}
                    </span>
                  </div>
                  <div
                    className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                    role="img"
                    aria-label={`Median ${formatDuration(row.medianDaysInStage)} in stage`}
                  >
                    <div
                      className={
                        'h-full rounded-full ' +
                        (medianTone === 'success'
                          ? 'bg-emerald-500'
                          : medianTone === 'warning'
                            ? 'bg-amber-500'
                            : medianTone === 'danger'
                              ? 'bg-rose-500'
                              : 'bg-slate-400')
                      }
                      style={{ width: `${medianBarPercent}%` }}
                    />
                  </div>
                </div>

                {/* Three-stat detail */}
                <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                  <Stat label="Average" value={formatDuration(row.averageDaysInStage)} />
                  <Stat
                    label="Median"
                    value={formatDuration(row.medianDaysInStage)}
                    tone={medianTone}
                  />
                  <Stat
                    label="Longest"
                    value={formatDuration(row.maxDaysInStage)}
                    tone="danger"
                  />
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

type Tone = 'default' | 'success' | 'warning' | 'danger';

const KPI_TONES: Record<Tone, { bg: string; fg: string; ring: string }> = {
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
  tone?: Tone;
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

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  const valueTone =
    tone === 'success'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'warning'
        ? 'text-amber-700 dark:text-amber-400'
        : tone === 'danger'
          ? 'text-rose-700 dark:text-rose-400'
          : 'text-slate-900 dark:text-slate-100';

  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-black uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className={`mt-0.5 break-words text-sm font-black tabular-nums ${valueTone}`}>
        {value}
      </dd>
    </div>
  );
}