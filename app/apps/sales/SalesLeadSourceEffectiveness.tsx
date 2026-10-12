import type { SalesLeadSourceEffectivenessReport } from '@/lib/apps/sales/lead-source-effectiveness';

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return currency + ' ' + value.toLocaleString();
  }
}
function days(value: number | null) {
  return value == null ? '—' : Math.round(value).toLocaleString() + ' days';
}

export default function SalesLeadSourceEffectiveness({ report }: { report: SalesLeadSourceEffectivenessReport }) {
  const currencies = Array.from(new Set(report.values.map(row => row.currency)));
  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-base font-black">Lead source effectiveness</h2>
        <p className="mt-1 text-sm text-slate-500">
          Leads created during the last 90 days, grouped by recorded source. Status counts show the current state of each lead; opportunity values reflect the linked opportunity’s current outcome.
        </p>
      </header>

      <section className="sami-surface rounded-[24px] p-4 sm:p-6">
        <h3 className="text-sm font-black">Lead conversion by source</h3>
        <p className="mt-1 text-xs text-slate-500">Conversion rate is converted leads divided by all leads in that source cohort.</p>
        {report.sources.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No leads were created in the last 90 days.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead><tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-[0.08em] text-slate-500">
                <th className="px-3 py-3 font-black">Source</th>
                <th className="px-3 py-3 text-right font-black">Leads</th>
                <th className="px-3 py-3 text-right font-black">New</th>
                <th className="px-3 py-3 text-right font-black">Contacted</th>
                <th className="px-3 py-3 text-right font-black">Qualified</th>
                <th className="px-3 py-3 text-right font-black">Converted</th>
                <th className="px-3 py-3 text-right font-black">Disqualified</th>
                <th className="px-3 py-3 text-right font-black">Conversion</th>
                <th className="px-3 py-3 text-right font-black">Avg. days to convert</th>
              </tr></thead>
              <tbody className="divide-y divide-[var(--sami-border)]">
                {report.sources.map(row => <tr key={row.source}>
                  <th scope="row" className="max-w-[220px] truncate px-3 py-3 font-bold">{row.source}</th>
                  <td className="px-3 py-3 text-right tabular-nums">{row.leadCount.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{row.newCount.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{row.contactedCount.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{row.qualifiedCount.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums">{row.convertedCount.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{row.disqualifiedCount.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right font-black tabular-nums">{Math.round(row.conversionRate).toLocaleString()}%</td>
                  <td className="px-3 py-3 text-right tabular-nums">{days(row.averageDaysToConvert)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="sami-surface rounded-[24px] p-4 sm:p-6">
        <h3 className="text-sm font-black">Opportunity value by lead source</h3>
        <p className="mt-1 text-xs text-slate-500">Figures use linked opportunities from the same 90-day lead cohort and are kept separate by currency.</p>
        {report.values.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No source-attributed opportunities are available yet.</p>
        ) : (
          <div className="mt-5 space-y-6">
            {currencies.map(currency => {
              const rows = report.values.filter(row => row.currency === currency);
              return (
                <section key={currency} aria-label={currency + ' source attribution'}>
                  <h4 className="mb-3 text-xs font-black uppercase tracking-[0.1em] text-slate-500">{currency}</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-sm">
                      <thead><tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-[0.08em] text-slate-500">
                        <th className="px-3 py-3 font-black">Source</th>
                        <th className="px-3 py-3 text-right font-black">Opportunities</th>
                        <th className="px-3 py-3 text-right font-black">Open deals</th>
                        <th className="px-3 py-3 text-right font-black">Open pipeline</th>
                        <th className="px-3 py-3 text-right font-black">Weighted</th>
                        <th className="px-3 py-3 text-right font-black">Overdue</th>
                        <th className="px-3 py-3 text-right font-black">Won</th>
                        <th className="px-3 py-3 text-right font-black">Won value</th>
                        <th className="px-3 py-3 text-right font-black">Lost</th>
                        <th className="px-3 py-3 text-right font-black">Lost value</th>
                      </tr></thead>
                      <tbody className="divide-y divide-[var(--sami-border)]">
                        {rows.map(row => <tr key={row.source + ':' + currency}>
                          <th scope="row" className="max-w-[220px] truncate px-3 py-3 font-bold">{row.source}</th>
                          <td className="px-3 py-3 text-right tabular-nums">{row.opportunityCount.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{row.openOpportunityCount.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{money(row.openPipelineValue, currency)}</td>
                          <td className="px-3 py-3 text-right font-bold tabular-nums">{money(row.weightedPipelineValue, currency)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{row.overdueOpportunityCount.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{row.wonCount.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{money(row.wonValue, currency)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{row.lostCount.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{money(row.lostValue, currency)}</td>
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
    </section>
  );
}
