import type { SalesProductPerformanceRow } from '@/lib/apps/sales/product-performance';

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

export default function SalesProductPerformance({ rows }: { rows: SalesProductPerformanceRow[] }) {
  const currencies = Array.from(new Set(rows.map(row => row.currency)));
  return (
    <section className="sami-surface rounded-[24px] p-4 sm:p-6">
      <header>
        <h2 className="text-base font-black">Product and service performance</h2>
        <p className="mt-1 text-sm text-slate-500">
          Order lines from confirmed and closed orders dated within the last 90 days. Sales exclude tax and include line discounts; currency totals are kept separate. Returns are not netted into these order-line totals.
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No eligible order lines were found for the last 90 days.</p>
      ) : (
        <div className="mt-5 space-y-6">
          {currencies.map(currency => {
            const currencyRows = rows.filter(row => row.currency === currency);
            return (
              <section key={currency} aria-label={currency + ' product performance'}>
                <h3 className="mb-3 text-xs font-black uppercase tracking-[0.1em] text-slate-500">{currency}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1120px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-[0.08em] text-slate-500">
                        <th className="px-3 py-3 font-black">Product / service</th>
                        <th className="px-3 py-3 font-black">SKU</th>
                        <th className="px-3 py-3 text-right font-black">Orders</th>
                        <th className="px-3 py-3 text-right font-black">Lines</th>
                        <th className="px-3 py-3 text-right font-black">Ordered</th>
                        <th className="px-3 py-3 text-right font-black">Shipped</th>
                        <th className="px-3 py-3 text-right font-black">Delivered</th>
                        <th className="px-3 py-3 text-right font-black">Invoiced</th>
                        <th className="px-3 py-3 text-right font-black">Net sales</th>
                        <th className="px-3 py-3 text-right font-black">Discounts</th>
                        <th className="px-3 py-3 text-right font-black">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--sami-border)]">
                      {currencyRows.map(row => (
                        <tr key={row.productKey + ':' + currency}>
                          <th scope="row" className="max-w-[240px] truncate px-3 py-3 font-bold">{row.productName}</th>
                          <td className="max-w-[150px] truncate px-3 py-3 text-slate-500">{row.sku || '—'}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{row.orderCount.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{row.lineCount.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{quantity(row.quantityOrdered)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{quantity(row.quantityShipped)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{quantity(row.quantityDelivered)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{quantity(row.quantityInvoiced)}</td>
                          <td className="px-3 py-3 text-right font-bold tabular-nums">{money(row.netSales, currency)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{money(row.discountAmount, currency)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{money(row.marginAmount, currency)}</td>
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
