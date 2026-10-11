import Link from 'next/link';
import type { SalesManagementInsightsData } from '@/lib/apps/sales/management-insights';

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

export default function SalesManagementInsights({ data, currency, metrics }: Props) {
  const { summary } = data;
  const conversionRate = metrics.quoteCount > 0 ? metrics.convertedCount / metrics.quoteCount * 100 : 0;
  const orderMonthChange = data.orderSummary.priorMonthOrderValue > 0
    ? Math.round((data.orderSummary.currentMonthOrderValue / data.orderSummary.priorMonthOrderValue - 1) * 100) + '% vs last month'
    : data.orderSummary.currentMonthOrderValue > 0 ? 'New booked sales this month' : 'No booked sales this month';
  const acceptanceRate = metrics.quoteCount > 0
    ? (metrics.acceptedCount + metrics.convertedCount) / metrics.quoteCount * 100
    : 0;
  const monthChange = summary.priorMonthQuoteValue > 0
    ? `${Math.round((summary.currentMonthQuoteValue / summary.priorMonthQuoteValue - 1) * 100)}% vs last month`
    : summary.currentMonthQuoteValue > 0 ? 'New activity this month' : 'No activity this month';

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
        <Metric label="Open quote value" value={formatMoney(summary.openQuoteValue, currency)}
          detail={`${summary.openQuoteCount.toLocaleString()} sent or viewed quotes awaiting outcome`} />
        <Metric label="This month’s quote value" value={formatMoney(summary.currentMonthQuoteValue, currency)} detail={monthChange} />
      </section>

      <section className="space-y-4">
        <header>
          <h2 className="text-base font-black">Sales orders &amp; revenue</h2>
          <p className="mt-1 text-sm text-slate-500">Booked sales in your company currency, with fulfillment, invoicing and product/team breakdowns.</p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Booked order value" value={formatMoney(data.orderSummary.bookedOrderValue, currency)}
            detail={data.orderSummary.bookedOrderCount.toLocaleString() + ' confirmed or closed orders'} />
          <Metric label="This month’s booked sales" value={formatMoney(data.orderSummary.currentMonthOrderValue, currency)}
            detail={orderMonthChange} />
          <Metric label="Orders needing fulfillment" value={data.orderSummary.ordersNeedingFulfillment.toLocaleString()}
            detail="Confirmed orders not fully delivered" />
          <Metric label="Orders not fully invoiced" value={data.orderSummary.ordersNotFullyInvoiced.toLocaleString()}
            detail="Confirmed orders still awaiting full invoicing" />
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <ReportCard title="Monthly booked sales" rows={data.orderMonthly.map(item => ({
            label: item.month, primary: item.orderCount.toLocaleString() + ' orders', secondary: formatMoney(item.amount, currency),
          }))} />
          <ReportCard title="Top products by sales" rows={data.topProducts.map(item => ({
            label: item.productName, primary: item.quantity.toLocaleString() + ' units · ' + item.orderCount.toLocaleString() + ' orders', secondary: formatMoney(item.amount, currency),
          }))} />
          <ReportCard title="Sales team performance" rows={data.teamPerformance.map(item => ({
            label: item.teamName, primary: item.orderCount.toLocaleString() + ' orders', secondary: formatMoney(item.amount, currency),
          }))} />
        </section>
      </section>

      <section className="sami-surface rounded-[24px] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-black">Quotes needing attention</h2>
            <p className="mt-1 text-xs text-slate-500">Prioritized by expiry risk, then quote value. Open a quote to continue the customer follow-up.</p>
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
                <p className="text-sm font-black">{formatMoney(item.amount, currency)}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-slate-400">{item.status.replaceAll('_', ' ')}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ReportCard title="Quote status" rows={data.statusCounts.map(item => ({
          label: item.status.replaceAll('_', ' '), primary: String(item.count), secondary: formatMoney(item.amount, currency),
        }))} />
        <ReportCard title="Monthly quotation value" rows={data.monthly.map(item => ({
          label: item.month, primary: `${item.quoteCount} quotes`, secondary: formatMoney(item.amount, currency),
        }))} />
        <ReportCard title="Top customers" rows={data.topCustomers.map(item => ({
          label: item.customerName, primary: `${item.quoteCount} quotes`, secondary: formatMoney(item.amount, currency),
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

function ReportCard({ title, rows }: {
  title: string;
  rows: Array<{ label: string; primary: string; secondary: string }>;
}) {
  return <div className="sami-surface rounded-[24px] p-4">
    <h2 className="text-sm font-black">{title}</h2>
    <div className="mt-3 space-y-2">
      {rows.length === 0 ? <p className="text-xs text-slate-500">No report data yet.</p> : rows.map((row, index) => (
        <div key={`${row.label}-${index}`} className="flex items-center justify-between gap-3 border-b border-[var(--sami-border)] py-2 last:border-0">
          <p className="text-xs font-black capitalize">{row.label}</p>
          <div className="text-right">
            <p className="text-xs font-black">{row.primary}</p>
            <p className="text-[10px] text-slate-400">{row.secondary}</p>
          </div>
        </div>
      ))}
    </div>
  </div>;
}
