import type { SalesReturnFulfillmentQualityReport } from '@/lib/apps/sales/return-fulfillment-quality';

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return currency + ' ' + value.toLocaleString();
  }
}

function quantity(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function duration(value: number | null) {
  if (value == null) return '—';
  if (value < 24) return Math.round(value * 10) / 10 + ' h';
  const days = value / 24;
  return Math.round(days * 10) / 10 + ' d';
}

function statusLabel(value: string) {
  return value.replace(/_/g, ' ');
}

export default function SalesReturnFulfillmentQuality({ report }: { report: SalesReturnFulfillmentQualityReport }) {
  const currencies = Array.from(new Set(report.returnsByStatus.map(row => row.currency)));
  const reasonCurrencies = Array.from(new Set(report.returnReasons.map(row => row.currency)));

  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-base font-black">Returns and delivery quality</h2>
        <p className="mt-1 text-sm text-slate-500">
          Return requests and shipments from the last 90 days. Return credits use the associated order currency. Shipment timing is based on recorded timestamps, not promised delivery dates.
        </p>
      </header>

      {report.canViewShipping && (
        <section className="sami-surface rounded-[24px] p-4 sm:p-6">
          <h3 className="text-sm font-black">Shipment execution</h3>
          <p className="mt-1 text-xs text-slate-500">Dispatch and delivery duration excludes records with missing or invalid timestamps.</p>
          {report.shipmentsByStatus.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No shipments were created in the last 90 days.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead><tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-[0.08em] text-slate-500">
                  <th className="px-3 py-3 font-black">Status</th>
                  <th className="px-3 py-3 text-right font-black">Shipments</th>
                  <th className="px-3 py-3 text-right font-black">Orders</th>
                  <th className="px-3 py-3 text-right font-black">Units on shipments</th>
                  <th className="px-3 py-3 text-right font-black">Avg. time to ship</th>
                  <th className="px-3 py-3 text-right font-black">Avg. transit time</th>
                </tr></thead>
                <tbody className="divide-y divide-[var(--sami-border)]">
                  {report.shipmentsByStatus.map(row => (
                    <tr key={row.status}>
                      <th scope="row" className="px-3 py-3 font-bold capitalize">{statusLabel(row.status)}</th>
                      <td className="px-3 py-3 text-right tabular-nums">{row.shipmentCount.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{row.orderCount.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{quantity(row.itemQuantity)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{duration(row.averageHoursToShip)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{duration(row.averageHoursToDeliver)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {report.canViewReturns && (
        <>
          <section className="sami-surface rounded-[24px] p-4 sm:p-6">
            <h3 className="text-sm font-black">Return lifecycle by status</h3>
            <p className="mt-1 text-xs text-slate-500">Cancelled sales orders and cancelled returns are excluded. Credit, available credit, and refunds are kept separate by currency.</p>
            {report.returnsByStatus.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No returns were requested in the last 90 days.</p>
            ) : (
              <div className="mt-5 space-y-6">
                {currencies.map(currency => {
                  const rows = report.returnsByStatus.filter(row => row.currency === currency);
                  return (
                    <section key={currency} aria-label={currency + ' return status'}>
                      <h4 className="mb-3 text-xs font-black uppercase tracking-[0.1em] text-slate-500">{currency}</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[940px] text-left text-sm">
                          <thead><tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-[0.08em] text-slate-500">
                            <th className="px-3 py-3 font-black">Status</th>
                            <th className="px-3 py-3 text-right font-black">Returns</th>
                            <th className="px-3 py-3 text-right font-black">Orders</th>
                            <th className="px-3 py-3 text-right font-black">Units returned</th>
                            <th className="px-3 py-3 text-right font-black">Credit notes</th>
                            <th className="px-3 py-3 text-right font-black">Available credit</th>
                            <th className="px-3 py-3 text-right font-black">Refunded</th>
                          </tr></thead>
                          <tbody className="divide-y divide-[var(--sami-border)]">
                            {rows.map(row => (
                              <tr key={row.status + ':' + currency}>
                                <th scope="row" className="px-3 py-3 font-bold capitalize">{statusLabel(row.status)}</th>
                                <td className="px-3 py-3 text-right tabular-nums">{row.returnCount.toLocaleString()}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{row.orderCount.toLocaleString()}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{quantity(row.itemQuantity)}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{money(row.creditAmount, currency)}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{money(row.availableCredit, currency)}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{money(row.refundedAmount, currency)}</td>
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
            <h3 className="text-sm font-black">Return reasons</h3>
            <p className="mt-1 text-xs text-slate-500">Recorded reasons can be free-form, so similar explanations may appear as separate rows.</p>
            {report.returnReasons.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No return reasons are available for this period.</p>
            ) : (
              <div className="mt-5 space-y-6">
                {reasonCurrencies.map(currency => {
                  const rows = report.returnReasons.filter(row => row.currency === currency);
                  return (
                    <section key={currency} aria-label={currency + ' return reasons'}>
                      <h4 className="mb-3 text-xs font-black uppercase tracking-[0.1em] text-slate-500">{currency}</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-left text-sm">
                          <thead><tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-[0.08em] text-slate-500">
                            <th className="px-3 py-3 font-black">Recorded reason</th>
                            <th className="px-3 py-3 text-right font-black">Returns</th>
                            <th className="px-3 py-3 text-right font-black">Units</th>
                            <th className="px-3 py-3 text-right font-black">Credit notes</th>
                          </tr></thead>
                          <tbody className="divide-y divide-[var(--sami-border)]">
                            {rows.map(row => (
                              <tr key={row.reason + ':' + currency}>
                                <th scope="row" className="max-w-[520px] truncate px-3 py-3 font-bold">{row.reason}</th>
                                <td className="px-3 py-3 text-right tabular-nums">{row.returnCount.toLocaleString()}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{quantity(row.itemQuantity)}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{money(row.creditAmount, currency)}</td>
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
        </>
      )}
    </section>
  );
}
