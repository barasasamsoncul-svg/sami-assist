import Link from 'next/link';
import type { SalesActivityExecutionReport } from '@/lib/apps/sales/activity-execution';

function rate(value: number | null) {
  return value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 1 }) + '%';
}

function dateLabel(value: string | null) {
  if (!value) return 'No due date';
  const date = new Date(value + 'T00:00:00');
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(date);
}

export default function SalesActivityExecution({ report }: { report: SalesActivityExecutionReport }) {
  const { totals, owners, queue } = report;
  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-base font-black">Sales activity execution</h2>
        <p className="mt-1 text-sm text-slate-500">
          Lead and opportunity follow-ups across your company. Current workload and due-date risks are live; completion and on-time performance cover the last 30 days.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Planned activities" value={totals.plannedCount} detail="Open follow-ups across leads and opportunities" />
        <Metric label="Overdue" value={totals.overdueCount} detail="Planned items past their due date" />
        <Metric label="No due date" value={totals.undatedCount} detail="Open activities needing a schedule" />
        <Metric label="Due in 7 days" value={totals.dueNext7Count} detail="Includes items due today" />
        <Metric label="Completed · 30 days" value={totals.completedLast30Count} detail={'On-time: ' + rate(totals.onTimeRateLast30) + ' of completed items with a due date'} />
      </section>

      <section className="sami-surface rounded-[24px] p-4 sm:p-6">
        <h3 className="text-sm font-black">Follow-up workload by salesperson</h3>
        <p className="mt-1 text-xs text-slate-500">
          Open workload is current. Completion counts cover the last 30 days; on-time rate excludes completed activities that have no due date.
        </p>
        {owners.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No lead or opportunity activities have been recorded yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead><tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-[0.08em] text-slate-500">
                <th className="px-3 py-3 font-black">Salesperson</th>
                <th className="px-3 py-3 text-right font-black">Open</th>
                <th className="px-3 py-3 text-right font-black">Overdue</th>
                <th className="px-3 py-3 text-right font-black">Unscheduled</th>
                <th className="px-3 py-3 text-right font-black">Due in 7 days</th>
                <th className="px-3 py-3 text-right font-black">Completed · 30d</th>
                <th className="px-3 py-3 text-right font-black">On-time rate</th>
              </tr></thead>
              <tbody className="divide-y divide-[var(--sami-border)]">
                {owners.map((owner, index) => (
                  <tr key={owner.ownerId ?? 'unassigned-' + index}>
                    <th scope="row" className="max-w-[240px] truncate px-3 py-3 font-bold">{owner.ownerName}</th>
                    <td className="px-3 py-3 text-right tabular-nums">{owner.plannedCount.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right tabular-nums"><span className={owner.overdueCount > 0 ? 'font-black text-red-600' : ''}>{owner.overdueCount.toLocaleString()}</span></td>
                    <td className="px-3 py-3 text-right tabular-nums">{owner.undatedCount.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{owner.dueNext7Count.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{owner.completedLast30Count.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{rate(owner.onTimeRateLast30)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="sami-surface rounded-[24px] p-4 sm:p-6">
        <h3 className="text-sm font-black">Overdue and upcoming follow-ups</h3>
        <p className="mt-1 text-xs text-slate-500">Priority list of up to 25 planned activities that are overdue, due within seven days, or unscheduled. Overdue items appear first.</p>
        {queue.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No overdue, upcoming or unscheduled planned activities were found.</p>
        ) : (
          <div className="mt-4 divide-y divide-[var(--sami-border)]">
            {queue.map(item => {
              const overdue = item.dueDate !== null && item.daysOverdue > 0;
              const status = overdue
                ? 'Overdue by ' + item.daysOverdue.toLocaleString() + (item.daysOverdue === 1 ? ' day' : ' days')
                : item.dueDate === null ? 'No due date' : 'Due ' + dateLabel(item.dueDate);
              return (
                <article key={item.activityId} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[var(--sami-border)] px-2 py-1 text-[10px] font-black uppercase">{item.recordType}</span>
                      <Link href="/apps/sales/pipeline" className="text-xs font-black underline decoration-[var(--sami-border)] underline-offset-4 hover:decoration-current">{item.recordNumber}</Link>
                    </div>
                    <p className="mt-2 break-words text-sm font-black">{item.subject}</p>
                    <p className="mt-1 break-words text-xs text-slate-500">{item.customerName} · {item.recordName}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.activityType.replaceAll('_', ' ')} · Assigned to {item.assignedUserName}</p>
                  </div>
                  <p className={'shrink-0 text-left text-xs font-black sm:text-right ' + (overdue ? 'text-red-600' : 'text-slate-500')}>{status}</p>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="sami-surface min-w-0 rounded-[22px] p-4">
    <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</p>
    <p className="mt-2 break-words text-2xl font-black tracking-tight tabular-nums">{value.toLocaleString()}</p>
    <p className="mt-2 text-xs text-slate-500">{detail}</p>
  </div>;
}
