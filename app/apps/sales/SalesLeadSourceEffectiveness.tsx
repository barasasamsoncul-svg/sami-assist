import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Mail,
  Target,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';

import type { SalesLeadSourceEffectivenessReport } from '@/lib/apps/sales/lead-source-effectiveness';

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

function formatPercent(value: number): string {
  return Math.round(value).toLocaleString() + '%';
}

/* -------------------------------------------------------------------------- */
/*  Root                                                                      */
/* -------------------------------------------------------------------------- */

export default function SalesLeadSourceEffectiveness({
  report,
}: {
  report: SalesLeadSourceEffectivenessReport;
}) {
  const currencies = Array.from(new Set(report.values.map((row) => row.currency))).sort();

  const totals = report.sources.reduce(
    (acc, row) => ({
      leadCount: acc.leadCount + row.leadCount,
      convertedCount: acc.convertedCount + row.convertedCount,
      disqualifiedCount: acc.disqualifiedCount + row.disqualifiedCount,
    }),
    { leadCount: 0, convertedCount: 0, disqualifiedCount: 0 },
  );

  const overallConversion =
    totals.leadCount > 0
      ? Math.round((totals.convertedCount / totals.leadCount) * 100)
      : 0;

  return (
    <section className="space-y-4">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-black tracking-tight">
            Lead source effectiveness
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Leads created during the last {report.windowDays} days, grouped by
            recorded source. Status counts show the current state of each lead;
            opportunity values reflect the linked opportunity&apos;s current
            outcome.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          Last {report.windowDays} days
        </span>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* KPI strip                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          icon={<Users className="h-4 w-4" aria-hidden="true" />}
          label="Leads in cohort"
          value={totals.leadCount.toLocaleString()}
          detail={`Across ${report.sources.length} source${report.sources.length === 1 ? '' : 's'}`}
        />
        <KpiCard
          icon={<UserCheck className="h-4 w-4" aria-hidden="true" />}
          label="Converted"
          value={totals.convertedCount.toLocaleString()}
          detail={`Overall conversion ${overallConversion}%`}
          tone="success"
        />
        <KpiCard
          icon={<XCircle className="h-4 w-4" aria-hidden="true" />}
          label="Disqualified"
          value={totals.disqualifiedCount.toLocaleString()}
          detail="Excluded from conversion rate"
          tone="danger"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Source conversion                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-black">Lead conversion by source</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Conversion rate is converted leads divided by all leads in the
              source cohort.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {report.sources.length} source{report.sources.length === 1 ? '' : 's'}
          </span>
        </div>

        {report.sources.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div
              aria-hidden="true"
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
            >
              <Users className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-black">No leads in cohort</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
              No leads were created in the last {report.windowDays} days.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.08em] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th scope="col" className="px-5 py-3 font-black">
                    Source
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-black">
                    Leads
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-black">
                    New
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-black">
                    Contacted
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-black">
                    Qualified
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-black">
                    Converted
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-black">
                    Disqualified
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-black">
                    Conversion
                  </th>
                  <th scope="col" className="px-5 py-3 text-right font-black">
                    Avg. days to convert
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {report.sources.map((row) => {
                  const conversionBand =
                    row.conversionRate >= 50
                      ? 'emerald'
                      : row.conversionRate >= 20
                        ? 'amber'
                        : 'red';
                  return (
                    <tr
                      key={row.source}
                      className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      <th scope="row" className="max-w-[240px] px-5 py-3 text-left">
                        <span className="truncate font-bold">{row.source}</span>
                      </th>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {row.leadCount.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400">
                        {row.newCount.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400">
                        {row.contactedCount.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400">
                        {row.qualifiedCount.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums">
                        {row.convertedCount.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400">
                        {row.disqualifiedCount.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <div className="inline-flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className={
                              'h-1.5 w-10 rounded-full ' +
                              (conversionBand === 'emerald'
                                ? 'bg-emerald-500'
                                : conversionBand === 'amber'
                                  ? 'bg-amber-500'
                                  : 'bg-red-500')
                            }
                          />
                          <span className="font-black">
                            {formatPercent(row.conversionRate)}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400">
                        {formatDays(row.averageDaysToConvert)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Opportunity value by source                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-black">Opportunity value by source</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Figures use linked opportunities from the same {report.windowDays}
              -day lead cohort and stay separated by currency.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {currencies.length} currenc{currencies.length === 1 ? 'y' : 'ies'}
          </span>
        </div>

        {report.values.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div
              aria-hidden="true"
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
            >
              <Target className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-black">No source-attributed opportunities</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
              Once leads convert into opportunities, their pipeline and outcome
              values will appear here grouped by source.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {currencies.map((currency) => {
              const rows = report.values.filter((row) => row.currency === currency);
              return (
                <section key={currency} className="px-5 py-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {currency}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {rows.length} source{rows.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {rows.map((row) => (
                      <SourceValueCard key={row.source + ':' + currency} row={row} />
                    ))}
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

type KpiTone = 'default' | 'success' | 'danger';

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
  const iconClass =
    tone === 'success'
      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300'
      : tone === 'danger'
        ? 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300';

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
          {label}
        </p>
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${iconClass}`}
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

function SourceValueCard({
  row,
}: {
  row: SalesLeadSourceEffectivenessReport['values'][number];
}) {
  const winRate =
    row.wonCount + row.lostCount > 0
      ? Math.round((row.wonCount / (row.wonCount + row.lostCount)) * 100)
      : null;

  return (
    <li className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 dark:border-slate-800 dark:bg-slate-950/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
            <Target className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-black">{row.source}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {row.opportunityCount.toLocaleString()} opportunit
            {row.opportunityCount === 1 ? 'y' : 'ies'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {row.overdueOpportunityCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-amber-700 ring-1 ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-300">
              <CircleDashed className="h-3 w-3" aria-hidden="true" />
              {row.overdueOpportunityCount} overdue
            </span>
          ) : null}
          {winRate != null ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {winRate}% win rate
            </span>
          ) : null}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Open deals"
          value={row.openOpportunityCount.toLocaleString()}
        />
        <Stat
          label="Open pipeline"
          value={formatMoney(row.openPipelineValue, row.currency)}
          icon={<TrendingUp className="h-3 w-3 text-slate-400" aria-hidden="true" />}
        />
        <Stat
          label="Weighted"
          value={formatMoney(row.weightedPipelineValue, row.currency)}
          icon={<TrendingUp className="h-3 w-3 text-slate-400" aria-hidden="true" />}
        />
        <Stat
          label="Won value"
          value={formatMoney(row.wonValue, row.currency)}
          icon={<CheckCircle2 className="h-3 w-3 text-emerald-500" aria-hidden="true" />}
          tone="success"
        />
        <Stat
          label="Won count"
          value={row.wonCount.toLocaleString()}
        />
        <Stat
          label="Lost value"
          value={formatMoney(row.lostValue, row.currency)}
          icon={<TrendingDown className="h-3 w-3 text-red-500" aria-hidden="true" />}
          tone="danger"
        />
        <Stat
          label="Lost count"
          value={row.lostCount.toLocaleString()}
        />
        <Stat
          label="Open ↔ overdue"
          value={`${row.openOpportunityCount.toLocaleString()} / ${row.overdueOpportunityCount.toLocaleString()}`}
        />
      </dl>
    </li>
  );
}

function Stat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: 'success' | 'danger';
}) {
  const valueTone =
    tone === 'success'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'danger'
        ? 'text-red-700 dark:text-red-400'
        : 'text-slate-900 dark:text-slate-100';

  return (
    <div>
      <dt className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd
        className={`mt-0.5 inline-flex items-center gap-1 text-sm font-black tabular-nums ${valueTone}`}
      >
        {icon}
        {value}
      </dd>
    </div>
  );
}