import type { SalesCommissionPerformanceRow } from '@/lib/apps/sales/commission-performance';

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return currency + ' ' + value.toLocaleString();
  }
}

export default function SalesCommissionPerformance({ rows }: { rows: SalesCommissionPerformanceRow[] }) {
  const currencies = Array.from(new Set(rows.map(row => row.currency)));
  return (
    <section className="sami-surface rounded-[24px] p-4 sm:p-6">
      <header>
        <h2 className="text-base font-black">Sales commission performance</h2>
        <p className="mt-1 text-sm text-slate-500">
          Commission entries accrued in the last 90 days, grouped by salesperson, team, and currency. Status shows the current disposition of each entry; currency totals are never combined.
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No commission entries are available for this period, or your access does not include commission reporting.</p>
      ) : (
        <div className="mt-5 space-y-6">
          {currencies.map(currency => {
            const currencyRows = rows.filter(row => row.currency === currency);
            return (
              <section key={currency} aria-label={currency + ' commission performance'}>
                <h3 className="mb-3 text-xs font-black uppercase tracking-[0.1em] text-slate-500">{currency}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] text-left text-sm">
                    <thead><tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-[0.08em] text-slate-500">
                      <th className="px-3 py-3 font-black">Salesperson</th>
                      <th className="px-3 py-3 font-black">Team</th>
                      <th className="px-3 py-3 text-right font-black">Entries</th>
                      <th className="px-3 py-3 text-right font-black">Accrued</th>
                      <th className="px-3 py-3 text-right font-black">Paid</th>
                      <th className="px-3 py-3 text-right font-black">Reversed</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[var(--sami-border)]">
                      {currencyRows.map((row, index) => (
                        <tr key={(row.userId ?? 'unassigned') + ':' + (row.teamId ?? 'no-team') + ':' + currency + ':' + index}>
                          <th scope="row" className="max-w-[220px] truncate px-3 py-3 font-bold">{row.salespersonName}</th>
                          <td className="max-w-[180px] truncate px-3 py-3 text-slate-500">{row.teamName}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{row.entryCount.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            <span>{money(row.accruedAmount, currency)}</span>
                            <span className="mt-1 block text-[10px] text-slate-500">{row.accruedCount.toLocaleString()} entries</span>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            <span>{money(row.paidAmount, currency)}</span>
                            <span className="mt-1 block text-[10px] text-slate-500">{row.paidCount.toLocaleString()} entries</span>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            <span>{money(row.reversedAmount, currency)}</span>
                            <span className="mt-1 block text-[10px] text-slate-500">{row.reversedCount.toLocaleString()} entries</span>
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
