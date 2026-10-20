import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  CalendarX2,
  CheckCircle2,
  CircleDashed,
  Clock3,
  UserRound,
} from 'lucide-react';

import type { SalesActivityExecutionReport } from '@/lib/apps/sales/activity-execution';

/* -------------------------------------------------------------------------- */
/*  Formatting                                                                */
/* -------------------------------------------------------------------------- */

function formatRate(value: number | null): string {
  return value == null
    ? '—'
    : value.toLocaleString(undefined, { maximumFractionDigits: 1 }) + '%';
}

function formatDate(value: string | null): string {
  if (!value) return 'No due date';
  const date = new Date(value + 'T00:00:00');
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(date);
}

function pluralizeDays(count: number): string {
  return count === 1 ? 'day' : 'days';
}

/* -------------------------------------------------------------------------- */
/*  Root                                                                      */
/* -------------------------------------------------------------------------- */

export default function SalesActivityExecution({
  report,
}: {
  report: SalesActivityExecutionReport;
}) {
  const { totals, owners, queue } = report;
  const queueHasMore = report.meta?.queueHasMore === true;

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-black tracking-tight">
            Sales activity execution
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Lead and opportunity follow-ups across your company. Current workload
            and due-date risks are live; completion and on-time performance cover
            the last 30 days.
          </p>
        </div>
      </header>

      {/* ---------------- Metric strip ---------------- */}
      <section
        aria-label="Activity summary"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
      >
        <MetricCard
          label="Planned activities"
          value={totals.plannedCount}
          detail="Open follow-ups across leads and opportunities"
          icon={<CircleDashed className="h-4 w-4" aria-hidden="true" />}
        />
        <MetricCard
          label="Overdue"
          value={totals.overdueCount}
          detail="Planned items past their due date"
          icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          tone="danger"
        />
        <MetricCard
          label="No due date"
          value={totals.undatedCount}
          detail="Open activities needing a schedule"
          icon={<CalendarX2 className="h-4 w-4" aria-hidden="true" />}
          tone="warning"
        />
        <MetricCard
          label="Due in 7 days"
          value={totals.dueNext7Count}
          detail="Includes items due today"
          icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
        />
        <MetricCard
          label="Completed · 30 days"
          value={totals.completedLast30Count}
          detail={
            totals.completedWithDueDateLast30Count > 0
              ? `On-time rate: ${formatRate(totals.onTimeRateLast30)} of ${totals.completedWithDueDateLast30Count.toLocaleString()} with a due date`
              : 'No completed items with a due date in this window'
          }
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          tone="success"
        />
      </section>

      {/* ---------------- Owner table ---------------- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-black">Follow-up workload by salesperson</h3>
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
            Last 30 days for completion metrics
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
          Open workload is current. Completion counts cover the last 30 days;
          on-time rate excludes completed activities that have no due date.
        </p>

        {owners.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="No lead or opportunity activities have been recorded. Create one from a lead or opportunity to start tracking execution."
            href="/apps/sales/pipeline"
            actionLabel="Open pipeline"
          />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.08em] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th scope="col" className="px-3 py-3 font-black">
                    Salesperson
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-black">
                    Open
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-black">
                    Overdue
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-black">
                    Unscheduled
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-black">
                    Due in 7 days
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-black">
                    Completed · 30d
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-black">
                    On-time rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {owners.map((owner, index) => (
                  <tr
                    key={owner.ownerId ?? 'unassigned-' + index}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                  >
                    <th
                      scope="row"
                      className="max-w-[240px] truncate px-3 py-3 font-bold"
                      title={owner.ownerName}
                    >
                      <span className="inline-flex items-center gap-2">
                        <UserRound
                          className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500"
                          aria-hidden="true"
                        />
                        <span className="truncate">{owner.ownerName}</span>
                      </span>
                    </th>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {owner.plannedCount.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <span
                        className={
                          owner.overdueCount > 0
                            ? 'font-black text-red-600 dark:text-red-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }
                      >
                        {owner.overdueCount.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {owner.undatedCount.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {owner.dueNext7Count.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {owner.completedLast30Count.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatRate(owner.onTimeRateLast30)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------------- Queue ---------------- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-black">Overdue and upcoming follow-ups</h3>
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
            Top {queue.length} of priority queue
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
          Priority list of planned activities that are overdue, due within seven
          days, or unscheduled. Overdue items appear first.
        </p>

        {queue.length === 0 ? (
          <EmptyState
            title="Nothing due"
            description="No overdue, upcoming or unscheduled planned activities were found."
            href="/apps/sales/pipeline"
            actionLabel="Open pipeline"
          />
        ) : (
          <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
            {queue.map((item) => {
              const overdue = item.dueDate !== null && item.daysOverdue > 0;
              const status = overdue
                ? `Overdue by ${item.daysOverdue.toLocaleString()} ${pluralizeDays(item.daysOverdue)}`
                : item.dueDate === null
                  ? 'No due date'
                  : `Due ${formatDate(item.dueDate)}`;

              return (
                <li
                  key={item.activityId}
                  className="flex flex-wrap items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:border-slate-700 dark:text-slate-300">
                        {item.recordType}
                      </span>
                      <Link
                        href={pipelineHrefFor(item.recordType, item.recordId)}
                        className="text-xs font-black underline decoration-slate-300 underline-offset-4 hover:decoration-current dark:decoration-slate-600"
                      >
                        {item.recordNumber}
                      </Link>
                      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        {item.activityType.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <p className="mt-2 break-words text-sm font-black">
                      {item.subject}
                    </p>
                    <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">
                      {item.customerName} · {item.recordName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Assigned to {item.assignedUserName}
                    </p>
                  </div>
                  <p
                    className={
                      'inline-flex shrink-0 items-center gap-1 text-xs font-black ' +
                      (overdue
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-slate-500 dark:text-slate-400')
                    }
                  >
                    {overdue ? (
                      <AlertTriangle
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                    ) : (
                      <Clock3
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                    )}
                    {status}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {queueHasMore ? (
          <div className="mt-3 flex justify-end">
            <Link
              href="/apps/sales/pipeline"
              className="text-xs font-black underline decoration-slate-300 underline-offset-4 hover:decoration-current dark:decoration-slate-600"
            >
              View the full follow-up queue →
            </Link>
          </div>
        ) : null}
      </section>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

type MetricTone = 'default' | 'danger' | 'warning' | 'success';

const METRIC_TONES: Record<
  MetricTone,
  { bg: string; fg: string; ring: string }
> = {
  default: {
    bg: 'bg-slate-100 dark:bg-slate-800/60',
    fg: 'text-slate-600 dark:text-slate-300',
    ring: '',
  },
  danger: {
    bg: 'bg-red-50 dark:bg-red-950/40',
    fg: 'text-red-600 dark:text-red-400',
    ring: 'ring-1 ring-red-500/10 dark:ring-red-500/20',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    fg: 'text-amber-600 dark:text-amber-400',
    ring: 'ring-1 ring-amber-500/10 dark:ring-amber-500/20',
  },
  success: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    fg: 'text-emerald-600 dark:text-emerald-400',
    ring: 'ring-1 ring-emerald-500/10 dark:ring-emerald-500/20',
  },
};

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = 'default',
}: {
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
  tone?: MetricTone;
}) {
  const palette = METRIC_TONES[tone];
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
      <p className="mt-2 break-words text-2xl font-black tracking-tight tabular-nums">
        {value.toLocaleString()}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {detail}
      </p>
    </div>
  );
}

function EmptyState({
  title,
  description,
  href,
  actionLabel,
}: {
  title: string;
  description: string;
  href: string;
  actionLabel: string;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center dark:border-slate-700 dark:bg-slate-900/40">
      <p className="text-sm font-black text-slate-900 dark:text-slate-100">
        {title}
      </p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
      <Link
        href={href}
        className="mt-3 inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
      >
        {actionLabel}
      </Link>
    </div>
  );
}

function pipelineHrefFor(recordType: string, recordId: string): string {
  if (recordType === 'Lead') return '/apps/sales/pipeline?tab=leads&leadId=' + encodeURIComponent(recordId);
  if (recordType === 'Opportunity') return '/apps/sales/pipeline?tab=opportunities&opportunityId=' + encodeURIComponent(recordId);
  return '/apps/sales/pipeline';
}