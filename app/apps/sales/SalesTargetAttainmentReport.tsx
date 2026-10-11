import type { SalesTargetAttainmentReport as Report, SalesTargetAttainmentRow } from '@/lib/apps/sales/target-attainment-report';

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
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

function value(value: number, metric: SalesTargetAttainmentRow['metric'], currency: string) {
  return metric === 'orders' ? value.toLocaleString() : money(value, currency);
}

export default function SalesTargetAttainmentReport({ report }: { report: Report }) {
  if (!report.canViewTargets) {
    return (
      <section className="sami-surface rounded-[24px] p-4 sm:p-6">
        <h2 className="text-base font-black">Sales target attainment</h2>
        <p className="mt-2 text-sm text-slate-500">Target progress is hidden because your access does not include both Sales reporting and target-view permissions.</p>
      </section>
    );
  }

  const metrics: Array<SalesTargetAttainmentRow['metric']> = ['revenue', 'margin', 'orders'];

  return (
    <section className="sami-surface rounded-[24px] p-4 sm:p-6">
      <header>
        <h2 className="text-base font-black">Sales target attainment</h2>
        <p className="mt-1 text-sm text-slate-500">
          Active targets spanning the last 90 days through the next 90 days. Revenue and margin are shown in {report.companyCurrency}; actuals stop at today. Team and salesperson results use each order’s currently assigned team and owner.
        </p>
      </header>
      {report.rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No active sales targets overlap this reporting window.</p>
      ) : (
        <div className="mt-5 space-y-6">
          {metrics.map(metric => {
            const rows = report.rows.filter(row => row.metric === metric);
            if (rows.length === 0) return null;
            return (
              <section key={metric} aria-label={metric + ' target attainment'}>
                <h3 className="mb-3 text-xs font-black uppercase tracking-[0.1em] text-slate-500">{metric === 'orders' ? 'Order volume' : metric + ' target'}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead><tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-[0.08em] text-slate-500">
                      <th className="px-3 py-3 font-black">Scope</th>
                      <th className="px-3 py-3 font-black">Period</th>
                      <th className="px-3 py-3 text-right font-black">Target</th>
                      <th className="px-3 py-3 text-right font-black">Actual to date</th>
                      <th className="px-3 py-3 text-right font-black">Attainment</th>
                      <th className="px-3 py-3 font-black">Progress</th>
                      <th className="px-3 py-3 font-black">Status</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[var(--sami-border)]">
                      {rows.map(row => (
                        <tr key={row.id}>
                          <th scope="row" className="max-w-[220px] truncate px-3 py-3 font-bold">{scopeLabel(row)}</th>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-500">{row.periodStart} – {row.periodEnd}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{value(row.targetValue, metric, report.companyCurrency)}</td>
                          <td className="px-3 py-3 text-right font-bold tabular-nums">{value(row.actualValue, metric, report.companyCurrency)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{row.attainmentPercent.toLocaleString(undefined, { maximumFractionDigits: 1 })}%</td>
                          <td className="min-w-[180px] px-3 py-3">
                            <div className="h-2 overflow-hidden rounded-full bg-[var(--sami-border)]">
                              <div className="h-full rounded-full bg-[var(--sami-accent)]" style={{ width: Math.min(100, Math.max(0, row.attainmentPercent)) + '%' }} />
                            </div>
                            <span className="mt-1 block text-[10px] text-slate-500">{row.elapsedPercent.toLocaleString(undefined, { maximumFractionDigits: 1 })}% of period elapsed</span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex rounded-full border border-[var(--sami-border)] px-2 py-1 text-xs font-bold capitalize">{statusLabel(row.status)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
