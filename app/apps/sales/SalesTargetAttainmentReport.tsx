import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Info,
  Lock,
  Target,
  TrendingUp,
} from 'lucide-react';

import type {
  SalesTargetAttainmentReport as Report,
  SalesTargetAttainmentRow,
} from '@/lib/apps/sales/target-attainment-report';

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

function statusLabel(status: SalesTargetAttainmentRow['status']) {
  return status.replace(/_/g, ' ');
}

function scopeLabel(row: SalesTargetAttainmentRow) {
  if (row.targetScope === 'company') return 'Company';
  if (row.targetScope === 'team') return row.teamName || 'Sales team';
  return row.salespersonName || 'Salesperson';
}

function value(
  value: number,
  metric: SalesTargetAttainmentRow['metric'],
  currency: string,
) {
  return metric === 'orders' ? value.toLocaleString() : money(value, currency);
}

type Tone = 'emerald' | 'amber' | 'red' | 'blue' | 'slate';

function attainmentTone(percent: number): Tone {
  if (!Number.isFinite(percent) || percent <= 0) return 'slate';
  if (percent >= 100) return 'emerald';
  if (percent >= 75) return 'blue';
  if (percent >= 40) return 'amber';
  return 'red';
}

function statusTone(status: SalesTargetAttainmentRow['status']): Tone {
  switch (status) {
    case 'achieved':
      return 'emerald';
    case 'missed':
      return 'red';
    case 'at_risk':
      return 'amber';
    case 'on_track':
      return 'blue';
    case 'scheduled':
      return 'slate';
    default:
      return 'slate';
  }
}

function toneText(tone: Tone): string {
  switch (tone) {
    case 'emerald':
      return 'text-emerald-700 dark:text-emerald-300';
    case 'amber':
      return 'text-amber-700 dark:text-amber-300';
    case 'red':
      return 'text-red-700 dark:text-red-300';
    case 'slate':
      return 'text-slate-500 dark:text-slate-400';
    case 'blue':
      return 'text-blue-700 dark:text-blue-300';
  }
}

function toneBar(tone: Tone): string {
  switch (tone) {
    case 'emerald':
      return 'bg-emerald-500';
    case 'amber':
      return 'bg-amber-500';
    case 'red':
      return 'bg-red-500';
    case 'slate':
      return 'bg-slate-400';
    case 'blue':
      return 'bg-blue-500';
  }
}

function toneBadge(tone: Tone): string {
  switch (tone) {
    case 'emerald':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/30';
    case 'amber':
      return 'bg-amber-50 text-amber-700 ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-500/30';
    case 'red':
      return 'bg-red-50 text-red-700 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-500/30';
    case 'slate':
      return 'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-500/30';
    case 'blue':
      return 'bg-blue-50 text-blue-700 ring-blue-500/20 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-500/30';
  }
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function metricLabel(metric: SalesTargetAttainmentRow['metric']) {
  if (metric === 'orders') return 'Order volume';
  if (metric === 'margin') return 'Margin target';
  return 'Revenue target';
}

function metricIcon(metric: SalesTargetAttainmentRow['metric']) {
  if (metric === 'orders') return <BarChart3 className="h-3.5 w-3.5" />;
  if (metric === 'margin') return <TrendingUp className="h-3.5 w-3.5" />;
  return <Target className="h-3.5 w-3.5" />;
}

export default function SalesTargetAttainmentReport({
  report,
}: {
  report: Report;
}) {
  if (!report.canViewTargets) {
    return (
      <section className="sami-surface rounded-[24px] p-4 sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-black">Sales target attainment</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              Target progress is hidden because your access does not include both Sales
              reporting and target-view permissions.
            </p>
            <p className="mt-2 inline-flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Ask an administrator to grant target-view permissions if you need this view.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const metrics: Array<SalesTargetAttainmentRow['metric']> = [
    'revenue',
    'margin',
    'orders',
  ];
  const totalRows = report.rows.length;

  return (
    <section className="sami-surface rounded-[24px] p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="inline-flex items-center gap-1.5 text-base font-black">
            <Target className="h-4 w-4" />
            Sales target attainment
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Active targets spanning the last 90 days through the next 90 days. Revenue and
            margin are shown in {report.companyCurrency}; actuals stop at today. Team and
            salesperson results use each order’s currently assigned team and owner.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {totalRows} target{totalRows === 1 ? '' : 's'}
        </span>
      </header>

      {report.rows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[var(--sami-border)] px-4 py-10 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <Target className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-black">No active targets in this window</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
            No active sales targets overlap this reporting window. Set a target in Sales →
            Targets to populate this report.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-8">
          {metrics.map((metric) => {
            const rows = report.rows.filter((row) => row.metric === metric);
            if (rows.length === 0) return null;

            const avgAttainment =
              rows.reduce((sum, row) => sum + (row.attainmentPercent || 0), 0) /
              rows.length;
            const attained = rows.filter(
              (row) => row.attainmentPercent >= 100,
            ).length;
            const atRisk = rows.filter(
              (row) => row.attainmentPercent < 40 && row.attainmentPercent > 0,
            ).length;
            const tone = attainmentTone(avgAttainment);

            return (
              <section key={metric} aria-label={metric + ' target attainment'}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                      {metricIcon(metric)}
                    </span>
                    <h3 className="text-sm font-black">{metricLabel(metric)}</h3>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      · {rows.length} row{rows.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <dl className="flex flex-wrap items-center gap-3 text-[11px]">
                    <SummaryStat
                      icon={<BarChart3 className="h-3 w-3" />}
                      label="Avg. attainment"
                      value={
                        <span className={toneText(tone)}>
                          {avgAttainment.toLocaleString(undefined, {
                            maximumFractionDigits: 1,
                          })}
                          %
                        </span>
                      }
                      bold
                    />
                    <SummaryStat
                      icon={<CheckCircle2 className="h-3 w-3" />}
                      label="At or above"
                      value={`${attained} / ${rows.length}`}
                    />
                    {atRisk > 0 ? (
                      <SummaryStat
                        icon={<AlertTriangle className="h-3 w-3" />}
                        label="At risk"
                        value={
                          <span className="font-black text-red-700 dark:text-red-300">
                            {atRisk}
                          </span>
                        }
                      />
                    ) : null}
                  </dl>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-[var(--sami-border)]">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50/80 backdrop-blur dark:bg-slate-900/70">
                      <tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        <th scope="col" className="px-3 py-3 text-left font-black">
                          Scope
                        </th>
                        <th scope="col" className="px-3 py-3 text-left font-black">
                          Period
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Target
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Actual to date
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Attainment
                        </th>
                        <th scope="col" className="px-3 py-3 text-left font-black">
                          Progress
                        </th>
                        <th scope="col" className="px-3 py-3 text-left font-black">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--sami-border)]">
                      {rows.map((row) => {
                        const attTone = attainmentTone(row.attainmentPercent);
                        const statTone = statusTone(row.status);
                        const width = clamp(row.attainmentPercent);
                        const elapsed = clamp(row.elapsedPercent);

                        return (
                          <tr
                            key={row.id}
                            className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                          >
                            <th
                              scope="row"
                              className="max-w-[220px] truncate px-3 py-3 text-left font-bold"
                              title={scopeLabel(row)}
                            >
                              {scopeLabel(row)}
                            </th>
                            <td className="whitespace-nowrap px-3 py-3 text-slate-500 dark:text-slate-400">
                              {row.periodStart} – {row.periodEnd}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {value(row.targetValue, metric, report.companyCurrency)}
                            </td>
                            <td className="px-3 py-3 text-right font-bold tabular-nums">
                              {value(row.actualValue, metric, report.companyCurrency)}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              <span className={'font-bold ' + toneText(attTone)}>
                                {row.attainmentPercent.toLocaleString(undefined, {
                                  maximumFractionDigits: 1,
                                })}
                                %
                              </span>
                            </td>
                            <td className="min-w-[180px] px-3 py-3">
                              <div
                                className="relative h-2 overflow-hidden rounded-full bg-[var(--sami-border)]"
                                role="img"
                                aria-label={`Attainment ${row.attainmentPercent.toFixed(1)} percent, elapsed ${row.elapsedPercent.toFixed(1)} percent`}
                              >
                                <div
                                  className={'h-full rounded-full ' + toneBar(attTone)}
                                  style={{ width: `${Math.max(2, width)}%` }}
                                />
                                <span
                                  aria-hidden="true"
                                  className="absolute top-0 h-full w-0.5 bg-slate-900/60 dark:bg-white/60"
                                  style={{ left: `calc(${elapsed}% - 1px)` }}
                                  title={`${row.elapsedPercent.toFixed(1)}% of period elapsed`}
                                />
                              </div>
                              <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                                <Clock3 className="h-2.5 w-2.5" />
                                {row.elapsedPercent.toLocaleString(undefined, {
                                  maximumFractionDigits: 1,
                                })}
                                % of period elapsed
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] capitalize ring-1 ${toneBadge(statTone)}`}
                              >
                                {statusLabel(row.status)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {atRisk > 0 ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-red-700 dark:text-red-300">
                    <AlertTriangle className="h-3 w-3" />
                    {atRisk} target{atRisk === 1 ? '' : 's'} below 40% attainment in this
                    metric.
                  </p>
                ) : (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <Info className="h-3 w-3" />
                    Attainment = actual ÷ target. The vertical marker shows how much of the
                    period has elapsed.
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
      <dd
        className={`tabular-nums ${bold ? 'text-sm font-black' : 'text-xs font-bold'}`}
      >
        {value}
      </dd>
    </div>
  );
}