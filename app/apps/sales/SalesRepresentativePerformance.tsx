import type { SalesRepresentativePerformanceRow } from '@/lib/apps/sales/representative-performance';

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
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

export default function SalesRepresentativePerformance({ rows }: { rows: SalesRepresentativePerformanceRow[] }) {
  const currencies = Array.from(new Set(rows.map(row => row.currency)));
  return (
    <section className="sami-surface rounded-[24px] p-4 sm:p-6">
      <header>
        <h2 className="text-base font-black">Salesperson pipeline performance</h2>
        <p className="mt-1 text-sm text-slate-500">Current open pipeline and overdue deals, plus win/loss outcomes recorded over the last 90 days. Currency totals remain separate.</p>
      </header>
      {!rows.length ? (
        <p className="mt-4 text-sm text-slate-500">No open opportunities or recorded wins/losses are available for this reporting period.</p>
      ) : (
        <div className="mt-5 space-y-6">
          {currencies.map(currency => {
            const items = rows.filter(row => row.currency === currency);
            return (
              <section key={currency} aria-label={currency + ' salesperson performance'}>
                <h3 className="mb-3 text-xs font-black uppercase tracking-[0.1em] text-slate-500">{currency}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1040px] text-left text-sm">
                    <thead><tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-[0.08em] text-slate-500">
                      <th className="px-3 py-3 font-black">Salesperson</th>
                      <th className="px-3 py-3 text-right font-black">Open deals</th>
                      <th className="px-3 py-3 text-right font-black">Open pipeline</th>
                      <th className="px-3 py-3 text-right font-black">Weighted</th>
                      <th className="px-3 py-3 text-right font-black">Overdue</th>
                      <th className="px-3 py-3 text-right font-black">Won · 90d</th>
                      <th className="px-3 py-3 text-right font-black">Won value · 90d</th>
                      <th className="px-3 py-3 text-right font-black">Lost · 90d</th>
                      <th className="px-3 py-3 text-right font-black">Win rate · 90d</th>
                      <th className="px-3 py-3 text-right font-black">Avg. days to win</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[var(--sami-border)]">
                      {items.map((row, index) => <tr key={(row.representativeId ?? 'unassigned') + ':' + currency + ':' + index}>
                        <th scope="row" className="max-w-[200px] truncate px-3 py-3 font-bold">{row.representativeName}</th>
                        <td className="px-3 py-3 text-right tabular-nums">{row.openOpportunityCount.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(row.openPipelineValue, currency)}</td>
                        <td className="px-3 py-3 text-right font-bold tabular-nums">{money(row.weightedPipelineValue, currency)}</td>
                        <td className="px-3 py-3 text-right tabular-nums"><span className={row.overdueOpportunityCount > 0 ? 'font-black text-red-600' : ''}>{row.overdueOpportunityCount.toLocaleString()}</span></td>
                        <td className="px-3 py-3 text-right tabular-nums">{row.wonCount90Days.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(row.wonValue90Days, currency)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{row.lostCount90Days.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{rate(row.winRate90Days)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{days(row.averageDaysToWin90Days)}</td>
                      </tr>)}
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
