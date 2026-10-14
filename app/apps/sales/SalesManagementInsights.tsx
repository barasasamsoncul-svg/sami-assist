import Link from 'next/link';
import type { SalesManagementInsightsData } from '@/lib/apps/sales/management-insights';
import SalesWeightedForecast from '@/app/apps/sales/SalesWeightedForecast';

type Props = {
  data: SalesManagementInsightsData;
  currency: string;
  metrics: { quoteCount: number; acceptedCount: number; convertedCount: number };
};

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency', currency, maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

function formatCurrencyBreakdown(
  values: Array<{ currency: string; amount: number }>,
  fallbackCurrency: string,
) {
  const nonZero = values.filter(item => Number(item.amount) !== 0);
  return nonZero.length
    ? nonZero.map(item => formatMoney(item.amount, item.currency)).join(' · ')
    : formatMoney(0, fallbackCurrency);
}

function monthComparison(
  current: Array<{ currency: string; amount: number }>,
  prior: Array<{ currency: string; amount: number }>,
  noActivityLabel: string,
) {
  const currentByCurrency = new Map(current.map(item => [item.currency, item.amount] as const));
  const priorByCurrency = new Map(prior.map(item => [item.currency, item.amount] as const));
  const currencies = Array.from(new Set([...current, ...prior]
    .filter(item => Number(item.amount) !== 0)
    .map(item => item.currency))).sort();

  if (currencies.length === 0) return noActivityLabel;

  return currencies.map(currency => {
    const now = Number(currentByCurrency.get(currency) || 0);
    const before = Number(priorByCurrency.get(currency) || 0);
    if (before > 0) {
      return currency + ': ' + Math.round((now / before - 1) * 100) + '% vs last month';
    }
    if (now > 0) return currency + ': new activity this month';
    return currency + ': no activity this month';
  }).join(' · ');
}

export default function SalesManagementInsights({ data, currency, metrics }: Props) {
  const { summary } = data;
  const conversionRate = metrics.quoteCount > 0 ? metrics.convertedCount / metrics.quoteCount * 100 : 0;
  const orderMonthChange = monthComparison(
    data.orderSummary.currentMonthOrderValueByCurrency,
    data.orderSummary.priorMonthOrderValueByCurrency,
    'No booked sales this month',
  );
  const acceptanceRate = metrics.quoteCount > 0
    ? (metrics.acceptedCount + metrics.convertedCount) / metrics.quoteCount * 100
    : 0;
  const monthChange = monthComparison(
    summary.currentMonthQuoteValueByCurrency,
    summary.priorMonthQuoteValueByCurrency,
    'No activity this month',
  );

  return (
    <div className="w-full space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-black tracking-tight">Sales management insights</h1>
        <p className="mt-1 text-sm text-slate-500">Conversion, quote value and prioritized customer follow-up for your company.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Quote-to-order conversion" value={`${Math.round(conversionRate)}%`}
          detail={`${metrics.convertedCount.toLocaleString()} converted of ${metrics.quoteCount.toLocaleString()} quotes`} />
        <Metric label="Acceptance rate" value={`${Math.round(acceptanceRate)}%`}
          detail={`${(metrics.acceptedCount + metrics.convertedCount).toLocaleString()} accepted or converted`} />
        <Metric label="Open quote value" value={formatCurrencyBreakdown(summary.openQuoteValueByCurrency, currency)}
          detail={`${summary.openQuoteCount.toLocaleString()} sent or viewed quotes awaiting outcome`} />
        <Metric label="This month’s quote value" value={formatCurrencyBreakdown(summary.currentMonthQuoteValueByCurrency, currency)} detail={monthChange} />
      </section>

      <section className="space-y-4">
        <header>
          <h2 className="text-base font-black">Sales orders &amp; revenue</h2>
          <p className="mt-1 text-sm text-slate-500">Booked sales grouped by each order's recorded base currency, with fulfillment, invoicing and product/team breakdowns.</p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Booked order value" value={formatCurrencyBreakdown(data.orderSummary.bookedOrderValueByCurrency, currency)}
            detail={data.orderSummary.bookedOrderCount.toLocaleString() + ' confirmed or closed orders'} />
          <Metric label="This month’s booked sales" value={formatCurrencyBreakdown(data.orderSummary.currentMonthOrderValueByCurrency, currency)}
            detail={orderMonthChange} />
          <Metric label="Orders needing fulfillment" value={data.orderSummary.ordersNeedingFulfillment.toLocaleString()}
            detail="Confirmed orders not fully delivered" />
          <Metric label="Orders not fully invoiced" value={data.orderSummary.ordersNotFullyInvoiced.toLocaleString()}
            detail="Confirmed orders still awaiting full invoicing" />
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <MonthlySalesChart rows={data.orderMonthly} />
          <ReportCard title="Top products by sales" rows={data.topProducts.map(item => ({
            label: item.productName + ' · ' + item.currency, primary: item.quantity.toLocaleString() + ' units · ' + item.orderCount.toLocaleString() + ' orders', secondary: formatMoney(item.amount, item.currency),
          }))} />
          <ReportCard title="Sales team performance" rows={data.teamPerformance.map(item => ({
            label: item.teamName + ' · ' + item.currency, primary: item.orderCount.toLocaleString() + ' orders', secondary: formatMoney(item.amount, item.currency),
          }))} />
        </section>
      </section>

      <SalesWeightedForecast rows={data.forecast} />

      <section className="sami-surface rounded-[24px] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-black">Quotes needing attention</h2>
            <p className="mt-1 text-xs text-slate-500">Prioritized by expiry risk, then age. Open a quote to continue the customer follow-up.</p>
          </div>
          <span className="rounded-full border border-[var(--sami-border)] px-3 py-1.5 text-xs font-black">
            {summary.followUpQuoteCount.toLocaleString()} to follow up
          </span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Count label="Expired" count={summary.expiredOpenQuoteCount} />
          <Count label="Expires within 7 days" count={summary.expiringSoonQuoteCount} />
          <Count label="No activity for 7+ days" count={summary.staleQuoteCount} />
        </div>
        <div className="mt-3 divide-y divide-[var(--sami-border)]">
          {data.followUpQueue.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No quotes need follow-up right now.</p>
          ) : data.followUpQueue.map(item => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/apps/sales/quotes/${encodeURIComponent(item.id)}`}
                  className="text-sm font-black underline decoration-[var(--sami-border)] underline-offset-4 hover:decoration-current">
                  {item.quoteNumber}
                </Link>
                <p className="mt-1 truncate text-xs text-slate-500">{item.customerName}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {item.reason === 'expired' ? 'Expired — renew or confirm the customer decision'
                    : item.reason === 'expiring' ? `Expires ${item.validUntil || 'soon'} — follow up before expiry`
                      : `No customer activity for ${item.ageDays} days`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black">{formatMoney(item.amount, item.currency)}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-slate-400">{item.status.replaceAll('_', ' ')}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ReportCard title="Quote status" rows={data.statusCounts.map(item => ({
          label: item.status.replaceAll('_', ' ') + ' · ' + item.currency, primary: String(item.count), secondary: formatMoney(item.amount, item.currency),
        }))} />
        <ReportCard title="Monthly quotation value" rows={data.monthly.map(item => ({
          label: item.month + ' · ' + item.currency, primary: `${item.quoteCount} quotes`, secondary: formatMoney(item.amount, item.currency),
        }))} />
        <ReportCard title="Top customers" rows={data.topCustomers.map(item => ({
          label: item.customerName + ' · ' + item.currency, primary: `${item.quoteCount} quotes`, secondary: formatMoney(item.amount, item.currency),
        }))} />
      </section>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="sami-surface rounded-[22px] p-4">
    <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</p>
    <p className="mt-2 break-words text-2xl font-black tracking-tight">{value}</p>
    <p className="mt-2 text-xs text-slate-500">{detail}</p>
  </div>;
}

function Count({ label, count }: { label: string; count: number }) {
  return <div className="rounded-xl border border-[var(--sami-border)] p-3">
    <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</p>
    <p className="mt-1 text-xl font-black">{count.toLocaleString()}</p>
  </div>;
}

function MonthlySalesChart({ rows }: {
  rows: Array<{ month: string; currency: string; orderCount: number; amount: number }>;
}) {
  const currencies = Array.from(new Set(rows.map(row => row.currency))).sort();

  return <div role="region" aria-label="Monthly booked sales chart" className="sami-surface rounded-[24px] p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-black">Monthly booked sales</h2>
        <p className="mt-1 text-[11px] text-slate-500">Last 12 months · grouped by recorded base currency</p>
      </div>
      <span className="rounded-full border border-[var(--sami-border)] px-2 py-1 text-[10px] font-black text-slate-500">12 months</span>
    </div>
    {rows.length === 0 ? <p className="mt-4 text-xs text-slate-500">No report data yet.</p> : (
      <div className="mt-4 space-y-5">
        {currencies.map(currency => {
          const currencyRows = rows.filter(row => row.currency === currency);
          const maxAmount = Math.max(1, ...currencyRows.map(row => row.amount));
          return <section key={currency} aria-label={currency + ' monthly booked sales'}>
            <h3 className="mb-3 text-xs font-black">{currency}</h3>
            <ol className="space-y-3" aria-label={'Monthly booked sales in ' + currency}>
              {currencyRows.map(row => {
                const width = row.amount > 0 ? Math.max(2, row.amount / maxAmount * 100) : 0;
                return <li key={row.month + '-' + row.currency} className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
                  <span className="text-[11px] font-bold text-slate-500">{row.month}</span>
                  <div className="min-w-0">
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-500/10"
                      role="img"
                      aria-label={row.month + ': ' + formatMoney(row.amount, currency) + ', ' + row.orderCount.toLocaleString() + ' orders'}
                      title={row.month + ' · ' + formatMoney(row.amount, currency)}>
                      <div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: width + '%' }} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                      <span className="text-[10px] text-slate-500">{row.orderCount.toLocaleString()} orders</span>
                      <span className="text-[11px] font-black tabular-nums">{formatMoney(row.amount, currency)}</span>
                    </div>
                  </div>
                </li>;
              })}
            </ol>
          </section>;
        })}
      </div>
    )}
  </div>;
}

function ReportCard({ title, rows }: {
  title: string;
  rows: Array<{ label: string; primary: string; secondary: string }>;
}) {
  return <div className="sami-surface rounded-[24px] p-4">
    <h2 className="text-sm font-black">{title}</h2>
    <div className="mt-3 space-y-2">
      {rows.length === 0 ? <p className="text-xs text-slate-500">No report data yet.</p> : rows.map((row, index) => (
        <div key={`${row.label}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-[var(--sami-border)] py-2 last:border-0">
          <p className="min-w-0 break-words text-xs font-black capitalize">{row.label}</p>
          <div className="min-w-0 max-w-[48%] text-right">
            <p className="break-words text-xs font-black tabular-nums">{row.primary}</p>
            <p className="break-words text-[10px] text-slate-400">{row.secondary}</p>
          </div>
        </div>
      ))}
    </div>
  </div>;
}
