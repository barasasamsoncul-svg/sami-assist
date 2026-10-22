import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CalendarX2,
  CircleDashed,
  Clock3,
  MapPin,
  Target,
  UserRound,
} from 'lucide-react';

import type {
  SalesOpportunityFunnelRow,
  SalesOpportunityRiskRow,
} from '@/lib/apps/sales/pipeline-funnel';

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
    return `${currency} ${value.toLocaleString()}`;
  }
}

function stageOutcome(stageType: SalesOpportunityFunnelRow['stageType']): string {
  if (stageType === 'won') return 'Won';
  if (stageType === 'lost') return 'Lost';
  return 'Open';
}

function stageOutcomeTone(stageType: SalesOpportunityFunnelRow['stageType']): string {
  if (stageType === 'won')
    return 'bg-emerald-50 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/30';
  if (stageType === 'lost')
    return 'bg-red-50 text-red-700 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-500/30';
  return 'bg-indigo-50 text-indigo-700 ring-indigo-500/20 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-500/30';
}

type RiskLabel = {
  label: string;
  tone: 'danger' | 'warning' | 'muted';
};

function riskLabels(row: SalesOpportunityRiskRow): RiskLabel[] {
  const labels: RiskLabel[] = [];
  if (row.overdue) labels.push({ label: 'Overdue close', tone: 'danger' });
  if (row.stale) labels.push({ label: '30+ days in stage', tone: 'warning' });
  if (row.missingCloseDate) labels.push({ label: 'No close date', tone: 'muted' });
  return labels;
}

function riskLabelClass(tone: RiskLabel['tone']): string {
  switch (tone) {
    case 'danger':
      return 'bg-red-50 text-red-700 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-500/30';
    case 'warning':
      return 'bg-amber-50 text-amber-700 ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-500/30';
    case 'muted':
      return 'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-500/30';
  }
}

function dealValueForRow(row: SalesOpportunityFunnelRow): number {
  if (row.stageType === 'open') return row.pipelineValue;
  if (row.stageType === 'won') return row.wonValue;
  return row.lostValue;
}

/* -------------------------------------------------------------------------- */
/*  Root                                                                      */
/* -------------------------------------------------------------------------- */

export default function SalesOpportunityFunnel({
  rows,
  riskRows,
}: {
  rows: SalesOpportunityFunnelRow[];
  riskRows: SalesOpportunityRiskRow[];
}) {
  const currencies = Array.from(new Set(rows.map((row) => row.currency))).sort();

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------------ */}
      {/* Funnel by stage                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
              <Target className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-black">Opportunity funnel by stage</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Current volume and value across your configured stages. Open
                value is probability-weighted; currencies are kept separate.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {rows.length} stage{rows.length === 1 ? '' : 's'}
          </span>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Target className="h-5 w-5" />}
            title="No active pipeline stages"
            description="No active pipeline stages are available for reporting yet. Configure a stage to populate this report."
            href="/apps/sales/pipeline"
            actionLabel="Open pipeline"
          />
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {currencies.map((currency) => {
              const currencyRows = rows.filter((row) => row.currency === currency);
              return (
                <section key={currency} className="px-5 py-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {currency}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {currencyRows.length} stage
                      {currencyRows.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <ol className="space-y-2">
                    {currencyRows.map((row, index) => (
                      <FunnelStageRow
                        key={row.stageId + ':' + currency}
                        row={row}
                        currency={currency}
                        isFirst={index === 0}
                        isLast={index === currencyRows.length - 1}
                      />
                    ))}
                  </ol>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Risk queue                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-black">Opportunities needing attention</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Overdue close dates, missing close dates, or 30+ days in stage.
                Up to 50 records.
              </p>
            </div>
          </div>
          <Link
            href="/apps/sales/opportunities"
            className="inline-flex items-center gap-1 text-xs font-black text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Open opportunities
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        {riskRows.length === 0 ? (
          <EmptyState
            icon={<CircleDashed className="h-5 w-5" />}
            title="Nothing at risk"
            description="No open opportunities currently meet the risk conditions. Keep expected close dates and next steps up to date."
            href="/apps/sales/opportunities"
            actionLabel="Open opportunities"
          />
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {riskRows.map((row) => {
              const reasons = riskLabels(row);
              return (
                <li
                  key={row.opportunityId}
                  className="px-5 py-4 transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/apps/sales/opportunities?opportunityId=${encodeURIComponent(row.opportunityId)}`}
                          className="inline-flex items-center gap-1 text-sm font-black underline decoration-slate-300 underline-offset-4 hover:decoration-current dark:decoration-slate-600"
                        >
                          {row.opportunityName}
                          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                        </Link>
                        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                          {row.opportunityNumber}
                        </span>
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" aria-hidden="true" />
                          {row.customerName}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1">
                          <Target className="h-3 w-3" aria-hidden="true" />
                          {row.stageName}
                        </span>
                      </p>
                      {reasons.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {reasons.map((reason) => (
                            <span
                              key={reason.label}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] ring-1 ${riskLabelClass(reason.tone)}`}
                            >
                              {reason.label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-sm font-black tabular-nums">
                        {formatMoney(row.expectedValue, row.currency)}
                      </p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
                        {row.probability}% probability
                      </p>
                    </div>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-800 sm:grid-cols-3">
                    <div>
                      <dt className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        <CalendarClock className="h-3 w-3" aria-hidden="true" />
                        Expected close
                      </dt>
                      <dd className="mt-0.5 font-bold">
                        {row.expectedCloseDate || 'Not set'}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        <Clock3 className="h-3 w-3" aria-hidden="true" />
                        Time in stage
                      </dt>
                      <dd className="mt-0.5 font-bold">
                        {row.daysInStage} day{row.daysInStage === 1 ? '' : 's'}
                      </dd>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <dt className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        <UserRound className="h-3 w-3" aria-hidden="true" />
                        Owner
                      </dt>
                      <dd className="mt-0.5 break-words font-bold">
                        {row.salespersonName}
                      </dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function FunnelStageRow({
  row,
  currency,
  isFirst,
  isLast,
}: {
  row: SalesOpportunityFunnelRow;
  currency: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const value = dealValueForRow(row);
  const isOpen = row.stageType === 'open';

  return (
    <li
      className="relative rounded-xl border border-slate-200 bg-slate-50/40 p-4 dark:border-slate-800 dark:bg-slate-950/30"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-white dark:bg-white dark:text-slate-950">
              {row.sequence || (isFirst ? 1 : 0) || 0}
            </span>
            <span className="truncate text-sm font-black">{row.stageName}</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ring-1 ${stageOutcomeTone(row.stageType)}`}
            >
              {stageOutcome(row.stageType)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {row.opportunityCount.toLocaleString()}{' '}
            {row.opportunityCount === 1 ? 'opportunity' : 'opportunities'}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-black tabular-nums">
            {formatMoney(value, currency)}
          </p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
            {isOpen
              ? 'Open pipeline'
              : row.stageType === 'won'
                ? 'Won value'
                : 'Lost value'}
          </p>
        </div>
      </div>

      {/* Progress bar sized against the largest deal in this currency */}
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        role="img"
        aria-label={`${row.stageName} value ${formatMoney(value, currency)}`}
      >
        <div
          className={
            'h-full rounded-full ' +
            (row.stageType === 'won'
              ? 'bg-emerald-500'
              : row.stageType === 'lost'
                ? 'bg-red-500'
                : 'bg-indigo-500')
          }
          style={{ width: `${Math.min(100, Math.max(2, (value / Math.max(1, value)) * 100))}%` }}
        />
      </div>

      {isOpen ? (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
            <div>
              <dt className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                Weighted
              </dt>
              <dd className="mt-0.5 font-bold tabular-nums">
                {formatMoney(row.weightedPipelineValue, currency)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                Stage probability
              </dt>
              <dd className="mt-0.5 font-bold tabular-nums">
                {row.stageProbability.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
                %
              </dd>
            </div>
          </dl>

          {row.overdueOpportunityCount > 0 || row.staleOpportunityCount > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {row.overdueOpportunityCount > 0 ? (
                <li className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] text-red-700 ring-1 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-500/30">
                  <CalendarX2 className="h-3 w-3" aria-hidden="true" />
                  {row.overdueOpportunityCount} overdue close · {formatMoney(row.overdueValue, currency)}
                </li>
              ) : null}
              {row.staleOpportunityCount > 0 ? (
                <li className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] text-amber-700 ring-1 ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-500/30">
                  <Clock3 className="h-3 w-3" aria-hidden="true" />
                  {row.staleOpportunityCount} stale ·{' '}
                  {formatMoney(row.staleValue, currency)}
                </li>
              ) : null}
            </ul>
          ) : null}
        </>
      ) : null}

      {!isLast ? (
        <span
          aria-hidden="true"
          className="absolute -bottom-[1px] left-6 h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600"
        />
      ) : null}
    </li>
  );
}

function EmptyState({
  icon,
  title,
  description,
  href,
  actionLabel,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <div
        aria-hidden="true"
        className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
      >
        {icon}
      </div>
      <p className="mt-3 text-sm font-black">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
      <Link
        href={href}
        className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
      >
        {actionLabel}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}