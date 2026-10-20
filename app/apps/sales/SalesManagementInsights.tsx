import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarX2,
  CheckCircle2,
  CircleDashed,
  Clock3,
  FileText,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';

import type { SalesManagementInsightsData } from '@/lib/apps/sales/management-insights';
import SalesWeightedForecast from '@/app/apps/sales/SalesWeightedForecast';

type Props = {
  data: SalesManagementInsightsData;
  currency: string;
  metrics: { quoteCount: number; acceptedCount: number; convertedCount: number };
};

/* -------------------------------------------------------------------------- */
/*  Formatting                                                                */
/* -------------------------------------------------------------------------- */

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

function formatCurrencyBreakdown(
  values: Array<{ currency: string; amount: number }>,
  fallbackCurrency: string,
): string {
  const nonZero = values.filter((item) => Number(item.amount) !== 0);
  return nonZero.length
    ? nonZero.map((item) => formatMoney(item.amount, item.currency)).join(' · ')
    : formatMoney(0, fallbackCurrency);
}

type MonthComparison = {
  text: string;
  direction: 'up' | 'down' | 'flat' | 'new' | 'none';
  percent: number | null;
};

function monthComparison(
  current: Array<{ currency: string; amount: number }>,
  prior: Array<{ currency: string; amount: number }>,
  noActivityLabel: string,
): MonthComparison {
  const currentByCurrency = new Map(current.map((item) => [item.currency, item.amount] as const));
  const priorByCurrency = new Map(prior.map((item) => [item.currency, item.amount] as const));
  const currencies = Array.from(
    new Set(
      [...current, ...prior]
        .filter((item) => Number(item.amount) !== 0)
        .map((item) => item.currency),
    ),
  ).sort();

  if (currencies.length === 0) {
    return { text: noActivityLabel, direction: 'none', percent: null };
  }

  const parts: string[] = [];
  let direction: MonthComparison['direction'] = 'flat';
  let firstPercent: number | null = null;

  for (const currency of currencies) {
    const now = Number(currentByCurrency.get(currency) || 0);
    const before = Number(priorByCurrency.get(currency) || 0);
    if (before > 0) {
      const pct = Math.round((now / before - 1) * 100);
      if (firstPercent == null) {
        firstPercent = pct;
        direction = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
      }
      parts.push(`${currency}: ${pct >= 0 ? '+' : ''}${pct}% vs last month`);
    } else if (now > 0) {
      if (firstPercent == null) direction = 'new';
      parts.push(`${currency}: new this month`);
    } else {
      parts.push(`${currency}: no activity this month`);
    }
  }

  return { text: parts.join(' · '), direction, percent: firstPercent };
}

/* -------------------------------------------------------------------------- */
/*  Root                                                                      */
/* -------------------------------------------------------------------------- */

export default function SalesManagementInsights({ data, currency, metrics }: Props) {
  const { summary } = data;
  const conversionRate =
    metrics.quoteCount > 0 ? (metrics.convertedCount / metrics.quoteCount) * 100 : 0;
  const acceptanceRate =
    metrics.quoteCount > 0
      ? ((metrics.acceptedCount + metrics.convertedCount) / metrics.quoteCount) * 100
      : 0;

  const orderMonthChange = monthComparison(
    data.orderSummary.currentMonthOrderValueByCurrency,
    data.orderSummary.priorMonthOrderValueByCurrency,
    'No booked sales this month',
  );
  const monthChange = monthComparison(
    summary.currentMonthQuoteValueByCurrency,
    summary.priorMonthQuoteValueByCurrency,
    'No activity this month',
  );

  return (
    <section className="space-y-4">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <header>
        <h2 className="text-base font-black tracking-tight">Management insights</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
          Conversion, quote value and prioritized customer follow-up for your
          company. All amounts stay in their recorded currency.
        </p>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Top KPI strip                                                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
          tone="default"
          label="Quote-to-order conversion"
          value={`${Math.round(conversionRate)}%`}
          detail={`${metrics.convertedCount.toLocaleString()} converted of ${metrics.quoteCount.toLocaleString()} quotes`}
        />
        <KpiCard
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          tone="success"
          label="Acceptance rate"
          value={`${Math.round(acceptanceRate)}%`}
          detail={`${(metrics.acceptedCount + metrics.convertedCount).toLocaleString()} accepted or converted`}
        />
        <KpiCard
          icon={<FileText className="h-4 w-4" aria-hidden="true" />}
          tone="warning"
          label="Open quote value"
          value={formatCurrencyBreakdown(summary.openQuoteValueByCurrency, currency)}
          detail={`${summary.openQuoteCount.toLocaleString()} sent or viewed awaiting outcome`}
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
          tone="default"
          label="This month's quote value"
          value={formatCurrencyBreakdown(summary.currentMonthQuoteValueByCurrency, currency)}
          detail={monthChange.text}
          trend={monthChange.direction}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Sales orders & revenue                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-black">Sales orders &amp; revenue</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Booked sales grouped by each order&apos;s recorded base currency,
            with fulfillment, invoicing and product/team breakdowns.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            tone="success"
            label="Booked order value"
            value={formatCurrencyBreakdown(
              data.orderSummary.bookedOrderValueByCurrency,
              currency,
            )}
            detail={`${data.orderSummary.bookedOrderCount.toLocaleString()} confirmed or closed orders`}
          />
          <KpiCard
            icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
            tone="default"
            label="This month's booked sales"
            value={formatCurrencyBreakdown(
              data.orderSummary.currentMonthOrderValueByCurrency,
              currency,
            )}
            detail={orderMonthChange.text}
            trend={orderMonthChange.direction}
          />
          <KpiCard
            icon={<CircleDashed className="h-4 w-4" aria-hidden="true" />}
            tone="warning"
            label="Needs fulfillment"
            value={data.orderSummary.ordersNeedingFulfillment.toLocaleString()}
            detail="Confirmed orders not fully delivered"
          />
          <KpiCard
            icon={<FileText className="h-4 w-4" aria-hidden="true" />}
            tone="warning"
            label="Not fully invoiced"
            value={data.orderSummary.ordersNotFullyInvoiced.toLocaleString()}
            detail="Confirmed orders still awaiting full invoicing"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <MonthlySalesChart rows={data.orderMonthly} />
          <ReportCard
            title="Top products by sales"
            rows={data.topProducts.map((item) => ({
              label: item.productName,
              sublabel: item.currency,
              primary: `${item.quantity.toLocaleString()} units · ${item.orderCount.toLocaleString()} orders`,
              secondary: formatMoney(item.amount, item.currency),
              icon: 'product' as const,
            }))}
          />
          <ReportCard
            title="Sales team performance"
            rows={data.teamPerformance.map((item) => ({
              label: item.teamName,
              sublabel: item.currency,
              primary: `${item.orderCount.toLocaleString()} orders`,
              secondary: formatMoney(item.amount, item.currency),
              icon: 'team' as const,
            }))}
          />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Weighted forecast (unchanged, own component)                       */}
      {/* ------------------------------------------------------------------ */}
      <SalesWeightedForecast rows={data.forecast} />

      {/* ------------------------------------------------------------------ */}
      {/* Quotes needing attention                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-black">Quotes needing attention</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Prioritized by expiry risk, then age. Open a quote to continue the
              customer follow-up.
            </p>
          </div>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-amber-700 ring-1 ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-300">
            {summary.followUpQuoteCount.toLocaleString()} to follow up
          </span>
        </div>

        <div className="grid gap-2 px-5 pt-4 sm:grid-cols-3">
          <AttentionCount
            icon={<CalendarX2 className="h-3.5 w-3.5" aria-hidden="true" />}
            label="Expired"
            count={summary.expiredOpenQuoteCount}
            tone="danger"
          />
          <AttentionCount
            icon={<Clock3 className="h-3.5 w-3.5" aria-hidden="true" />}
            label="Expires within 7 days"
            count={summary.expiringSoonQuoteCount}
            tone="warning"
          />
          <AttentionCount
            icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
            label="No activity for 7+ days"
            count={summary.staleQuoteCount}
            tone="warning"
          />
        </div>

        {data.followUpQueue.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div
              aria-hidden="true"
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-black">All clear</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
              No quotes need follow-up right now.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {data.followUpQueue.map((item) => {
              const overdue = item.reason === 'expired';
              const expiring = item.reason === 'expiring';
              const stale = item.reason === 'stale';
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={
                          'h-2 w-2 shrink-0 rounded-full ' +
                          (overdue
                            ? 'bg-red-500'
                            : expiring
                              ? 'bg-amber-500'
                              : 'bg-slate-300 dark:bg-slate-600')
                        }
                      />
                      <Link
                        href={`/apps/sales/quotes/${encodeURIComponent(item.id)}`}
                        className="inline-flex items-center gap-1 text-sm font-black underline decoration-slate-300 underline-offset-4 hover:decoration-current dark:decoration-slate-600"
                      >
                        {item.quoteNumber}
                        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                      </Link>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {item.customerName}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {overdue
                        ? 'Expired — renew or confirm the customer decision'
                        : expiring
                          ? `Expires ${item.validUntil || 'soon'} — follow up before expiry`
                          : stale
                            ? `No customer activity for ${item.ageDays} days`
                            : item.reason}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black tabular-nums">
                      {formatMoney(item.amount, item.currency)}
                    </p>
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                      {item.status.replaceAll('_', ' ')}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Secondary cards                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-4 xl:grid-cols-3">
        <ReportCard
          title="Quote status"
          rows={data.statusCounts.map((item) => ({
            label: item.status.replaceAll('_', ' '),
            sublabel: item.currency,
            primary: `${item.count.toLocaleString()} quotes`,
            secondary: formatMoney(item.amount, item.currency),
            icon: 'status' as const,
          }))}
        />
        <ReportCard
          title="Monthly quotation value"
          rows={data.monthly.map((item) => ({
            label: item.month,
            sublabel: item.currency,
            primary: `${item.quoteCount.toLocaleString()} quotes`,
            secondary: formatMoney(item.amount, item.currency),
            icon: 'month' as const,
          }))}
        />
        <ReportCard
          title="Top customers"
          rows={data.topCustomers.map((item) => ({
            label: item.customerName,
            sublabel: item.currency,
            primary: `${item.quoteCount.toLocaleString()} quotes`,
            secondary: formatMoney(item.amount, item.currency),
            icon: 'customer' as const,
          }))}
        />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

type KpiTone = 'default' | 'success' | 'warning';
type TrendDirection = 'up' | 'down' | 'flat' | 'new' | 'none';

const KPI_TONES: Record<
  KpiTone,
  { bg: string; fg: string; ring: string }
> = {
  default: {
    bg: 'bg-slate-100 dark:bg-slate-800/60',
    fg: 'text-slate-600 dark:text-slate-300',
    ring: '',
  },
  success: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    fg: 'text-emerald-600 dark:text-emerald-400',
    ring: 'ring-1 ring-emerald-500/10 dark:ring-emerald-500/20',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    fg: 'text-amber-600 dark:text-amber-400',
    ring: 'ring-1 ring-amber-500/10 dark:ring-amber-500/20',
  },
};

function KpiCard({
  icon,
  tone,
  label,
  value,
  detail,
  trend,
}: {
  icon: React.ReactNode;
  tone: KpiTone;
  label: string;
  value: string;
  detail: string;
  trend?: TrendDirection;
}) {
  const palette = KPI_TONES[tone];
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
          {label}
        </p>
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${palette.bg} ${palette.fg} ${palette.ring}`}
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 break-words text-2xl font-black tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-2 flex items-center gap-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {trend && trend !== 'none' && trend !== 'flat' ? (
          <span
            aria-hidden="true"
            className={
              trend === 'up'
                ? 'text-emerald-500'
                : trend === 'down'
                  ? 'text-red-500'
                  : 'text-indigo-500'
            }
          >
            {trend === 'up' ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : trend === 'down' ? (
              <TrendingDown className="h-3.5 w-3.5" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
          </span>
        ) : null}
        <span>{detail}</span>
      </p>
    </div>
  );
}

function AttentionCount({
  icon,
  label,
  count,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  tone: 'danger' | 'warning';
}) {
  const classes =
    tone === 'danger'
      ? 'border-red-200 bg-red-50/60 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
      : 'border-amber-200 bg-amber-50/60 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300';

  return (
    <div className={`rounded-xl border ${classes} p-3`}>
      <p className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.08em]">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-xl font-black tabular-nums">
        {count.toLocaleString()}
      </p>
    </div>
  );
}

function MonthlySalesChart({
  rows,
}: {
  rows: Array<{ month: string; currency: string; orderCount: number; amount: number }>;
}) {
  const currencies = Array.from(new Set(rows.map((row) => row.currency))).sort();

  return (
    <div
      role="region"
      aria-label="Monthly booked sales chart"
      className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black">Monthly booked sales</h3>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Last 12 months · grouped by recorded base currency
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          12 months
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          No report data yet.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {currencies.map((currency) => {
            const currencyRows = rows.filter((row) => row.currency === currency);
            const maxAmount = Math.max(1, ...currencyRows.map((row) => row.amount));
            return (
              <section key={currency} aria-label={currency + ' monthly booked sales'}>
                <h4 className="mb-3 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {currency}
                </h4>
                <ol className="space-y-2.5" aria-label={'Monthly booked sales in ' + currency}>
                  {currencyRows.map((row) => {
                    const width = row.amount > 0 ? Math.max(2, (row.amount / maxAmount) * 100) : 0;
                    return (
                      <li
                        key={row.month + '-' + row.currency}
                        className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-x-3"
                      >
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                          {row.month}
                        </span>
                        <div className="min-w-0">
                          <div
                            className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                            role="img"
                            aria-label={`${row.month}: ${formatMoney(row.amount, currency)}, ${row.orderCount.toLocaleString()} orders`}
                            title={`${row.month} · ${formatMoney(row.amount, currency)}`}
                          >
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">
                              {row.orderCount.toLocaleString()} orders
                            </span>
                            <span className="text-[11px] font-black tabular-nums">
                              {formatMoney(row.amount, currency)}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

type ReportRowIcon = 'product' | 'team' | 'status' | 'month' | 'customer';

function ReportRowIcon({ kind }: { kind: ReportRowIcon }) {
  const baseClass = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg';
  switch (kind) {
    case 'product':
      return (
        <span className={`${baseClass} bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300`}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      );
    case 'team':
      return (
        <span className={`${baseClass} bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300`}>
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      );
    case 'status':
      return (
        <span className={`${baseClass} bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300`}>
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      );
    case 'month':
      return (
        <span className={`${baseClass} bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300`}>
          <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      );
    case 'customer':
      return (
        <span className={`${baseClass} bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300`}>
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      );
  }
}

function ReportCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    label: string;
    sublabel?: string;
    primary: string;
    secondary: string;
    icon?: ReportRowIcon;
  }>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <h3 className="text-sm font-black">{title}</h3>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {rows.length} row{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-xs text-slate-500 dark:text-slate-400">
          No report data yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {rows.map((row, index) => (
            <li
              key={`${row.label}-${index}`}
              className="flex items-start gap-3 px-5 py-3 transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
            >
              {row.icon ? <ReportRowIcon kind={row.icon} /> : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-black capitalize">{row.label}</p>
                {row.sublabel ? (
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
                    {row.sublabel}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-black tabular-nums">{row.primary}</p>
                <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                  {row.secondary}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}