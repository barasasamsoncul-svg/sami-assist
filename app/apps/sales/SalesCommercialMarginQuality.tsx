import type { SalesCommercialMarginQualityReport, SalesCommercialQualityRiskRow } from '@/lib/apps/sales/commercial-margin-quality';

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return currency + ' ' + value.toLocaleString();
  }
}

function label(value: string) {
  return value.replace(/_/g, ' ');
}

function RiskTable({ rows }: { rows: SalesCommercialQualityRiskRow[] }) {
  const currencies = Array.from(new Set(rows.map(row => row.currency)));
  return (
    <div className="mt-5 space-y-6">
      {currencies.map(currency => {
        const currencyRows = rows.filter(row => row.currency === currency);
        return (
          <section key={currency} aria-label={currency + ' commercial risk'}>
            <h4 className="mb-3 text-xs font-black uppercase tracking-[0.1em] text-slate-500">{currency}</h4>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead><tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-[0.08em] text-slate-500">
                  <th className="px-3 py-3 font-black">Document</th>
                  <th className="px-3 py-3 font-black">Customer</th>
                  <th className="px-3 py-3 font-black">Status</th>
                  <th className="px-3 py-3 font-black">Review reason</th>
                  <th className="px-3 py-3 text-right font-black">Net value</th>
                  <th className="px-3 py-3 text-right font-black">Discount</th>
                  <th className="px-3 py-3 text-right font-black">Margin</th>
                </tr></thead>
                <tbody className="divide-y divide-[var(--sami-border)]">
                  {currencyRows.map(row => (
                    <tr key={row.documentType + ':' + row.id}>
                      <th scope="row" className="px-3 py-3 font-bold">{row.documentType === 'quotation' ? 'Quote' : 'Order'} {row.documentNumber}</th>
                      <td className="max-w-[200px] truncate px-3 py-3 text-slate-500">{row.customerName}</td>
                      <td className="px-3 py-3 capitalize">{label(row.status)}</td>
                      <td className="px-3 py-3">{row.riskReason}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{money(row.netValue, currency)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {money(row.discountAmount, currency)}
                        <span className="mt-1 block text-[10px] text-slate-500">{row.discountPercent.toLocaleString(undefined, { maximumFractionDigits: 1 })}% of subtotal</span>
                      </td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums">
                        {money(row.marginAmount, currency)}
                        <span className="mt-1 block text-[10px] text-slate-500">{row.marginPercent.toLocaleString(undefined, { maximumFractionDigits: 1 })}%</span>
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
  );
}

export default function SalesCommercialMarginQuality({ report }: { report: SalesCommercialMarginQualityReport }) {
  if (!report.canViewCommercialQuality) {
    return (
      <section className="sami-surface rounded-[24px] p-4 sm:p-6">
        <h2 className="text-base font-black">Margin and discount quality</h2>
        <p className="mt-2 text-sm text-slate-500">This report requires both Sales report access and margin-view permission.</p>
      </section>
    );
  }

  const currencies = Array.from(new Set(report.summaries.map(row => row.currency)));
  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-base font-black">Margin and discount quality</h2>
        <p className="mt-1 text-sm text-slate-500">
          Quotations and confirmed orders from the last 90 days. The review queue flags documents below {report.marginThresholdPercent}% margin or at/above {report.discountThresholdPercent}% discount. Values stay in their original currency; returns and later credit notes are not netted into order margin.
        </p>
      </header>

      <section className="sami-surface rounded-[24px] p-4 sm:p-6">
        <h3 className="text-sm font-black">Commercial performance by document type</h3>
        {report.summaries.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No quotations or confirmed orders were dated in the last 90 days.</p>
        ) : (
          <div className="mt-5 space-y-6">
            {currencies.map(currency => {
              const rows = report.summaries.filter(row => row.currency === currency);
              return (
                <section key={currency} aria-label={currency + ' commercial performance'}>
                  <h4 className="mb-3 text-xs font-black uppercase tracking-[0.1em] text-slate-500">{currency}</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-sm">
                      <thead><tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-[0.08em] text-slate-500">
                        <th className="px-3 py-3 font-black">Document type</th>
                        <th className="px-3 py-3 text-right font-black">Documents</th>
                        <th className="px-3 py-3 text-right font-black">Subtotal</th>
                        <th className="px-3 py-3 text-right font-black">Discounts</th>
                        <th className="px-3 py-3 text-right font-black">Net value</th>
                        <th className="px-3 py-3 text-right font-black">Cost snapshot</th>
                        <th className="px-3 py-3 text-right font-black">Margin</th>
                        <th className="px-3 py-3 text-right font-black">Margin rate</th>
                        <th className="px-3 py-3 text-right font-black">Low-margin</th>
                        <th className="px-3 py-3 text-right font-black">High-discount</th>
                      </tr></thead>
                      <tbody className="divide-y divide-[var(--sami-border)]">
                        {rows.map(row => (
                          <tr key={row.documentType + ':' + currency}>
                            <th scope="row" className="px-3 py-3 font-bold capitalize">{row.documentType}</th>
                            <td className="px-3 py-3 text-right tabular-nums">{row.documentCount.toLocaleString()}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{money(row.subtotal, currency)}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{money(row.discountAmount, currency)} <span className="block text-[10px] text-slate-500">{row.averageDiscountPercent.toLocaleString(undefined, { maximumFractionDigits: 1 })}%</span></td>
                            <td className="px-3 py-3 text-right tabular-nums">{money(row.netValue, currency)}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{money(row.costTotal, currency)}</td>
                            <td className="px-3 py-3 text-right font-bold tabular-nums">{money(row.marginAmount, currency)}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{row.marginPercent.toLocaleString(undefined, { maximumFractionDigits: 1 })}%</td>
                            <td className="px-3 py-3 text-right tabular-nums">{row.lowMarginCount.toLocaleString()}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{row.highDiscountCount.toLocaleString()}</td>
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

      <section className="sami-surface rounded-[24px] p-4 sm:p-6">
        <h3 className="text-sm font-black">Commercial review queue</h3>
        <p className="mt-1 text-xs text-slate-500">Open quotations and confirmed orders that cross either review threshold. Review the quote or order before approving further discounts or terms.</p>
        {report.risks.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No documents met the commercial review thresholds in this period.</p>
        ) : (
          <RiskTable rows={report.risks} />
        )}
      </section>
    </section>
  );
}
