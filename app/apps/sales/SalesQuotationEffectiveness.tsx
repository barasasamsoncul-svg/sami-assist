import type { SalesQuotationEffectivenessReport as Report, SalesQuotationEffectivenessRow } from '@/lib/apps/sales/quotation-effectiveness';

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return currency + ' ' + value.toLocaleString();
  }
}

function days(value: number | null) {
  return value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' days';
}

function EffectivenessTable({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: SalesQuotationEffectivenessRow[];
}) {
  const currencies = Array.from(new Set(rows.map(row => row.currency)));
  return (
    <section className="sami-surface rounded-[24px] p-4 sm:p-6">
      <h3 className="text-sm font-black">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No quotations are available for this breakdown in the last 90 days.</p>
      ) : (
        <div className="mt-5 space-y-6">
          {currencies.map(currency => {
            const currencyRows = rows.filter(row => row.currency === currency);
            return (
              <section key={currency} aria-label={currency + ' quotation effectiveness'}>
                <h4 className="mb-3 text-xs font-black uppercase tracking-[0.1em] text-slate-500">{currency}</h4>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1180px] text-left text-sm">
                    <thead><tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-[0.08em] text-slate-500">
                      <th className="px-3 py-3 font-black">{title.includes('template') ? 'Template' : 'Salesperson'}</th>
                      <th className="px-3 py-3 text-right font-black">Quotes</th>
                      <th className="px-3 py-3 text-right font-black">Sent</th>
                      <th className="px-3 py-3 text-right font-black">Accepted</th>
                      <th className="px-3 py-3 text-right font-black">Converted</th>
                      <th className="px-3 py-3 text-right font-black">Rejected</th>
                      <th className="px-3 py-3 text-right font-black">Expired</th>
                      <th className="px-3 py-3 text-right font-black">Quoted value</th>
                      <th className="px-3 py-3 text-right font-black">Converted value</th>
                      <th className="px-3 py-3 text-right font-black">Sent → accepted</th>
                      <th className="px-3 py-3 text-right font-black">Accepted → order</th>
                      <th className="px-3 py-3 text-right font-black">Days to accept</th>
                      <th className="px-3 py-3 text-right font-black">Days to order</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[var(--sami-border)]">
                      {currencyRows.map(row => (
                        <tr key={row.dimensionKey + ':' + currency}>
                          <th scope="row" className="max-w-[220px] truncate px-3 py-3 font-bold">{row.dimensionLabel}</th>
                          <td className="px-3 py-3 text-right tabular-nums">{row.quoteCount.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{row.sentCount.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{row.acceptedCount.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right font-bold tabular-nums">{row.convertedCount.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{row.rejectedCount.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{row.expiredCount.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{money(row.quotedValue, currency)}</td>
                          <td className="px-3 py-3 text-right font-bold tabular-nums">{money(row.convertedValue, currency)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{row.sentToAcceptedRate.toLocaleString(undefined, { maximumFractionDigits: 1 })}%</td>
                          <td className="px-3 py-3 text-right tabular-nums">{row.acceptedToOrderRate.toLocaleString(undefined, { maximumFractionDigits: 1 })}%</td>
                          <td className="px-3 py-3 text-right tabular-nums">{days(row.sentToAcceptedDays)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{days(row.acceptedToOrderDays)}</td>
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

export default function SalesQuotationEffectiveness({ report }: { report: Report }) {
  if (!report.canViewReports) {
    return (
      <section className="sami-surface rounded-[24px] p-4 sm:p-6">
        <h2 className="text-base font-black">Quotation effectiveness</h2>
        <p className="mt-2 text-sm text-slate-500">Quotation effectiveness is unavailable because your account does not have Sales report access.</p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-base font-black">Quotation effectiveness</h2>
        <p className="mt-1 text-sm text-slate-500">
          Quotations dated in the last 90 days. Accepted means customer acceptance recorded or an accepted/converted status; converted means a linked order exists. Amounts remain separated by quotation currency.
        </p>
      </header>
      <EffectivenessTable
        title="Salesperson quote effectiveness"
        description="Compares sent, accepted and ordered quotations by the currently assigned salesperson. Only active internal tenant members are named."
        rows={report.bySalesperson}
      />
      <EffectivenessTable
        title="Quotation template effectiveness"
        description="Compares template performance. Quotes without a template and quotes linked to deleted templates remain visible separately."
        rows={report.byTemplate}
      />
    </section>
  );
}
