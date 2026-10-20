import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Percent,
  ShoppingCart,
  Sparkles,
  TrendingDown,
} from 'lucide-react';
import Link from 'next/link';

import type {
  SalesCommercialMarginQualityReport,
  SalesCommercialQualityRiskRow,
  SalesCommercialQualitySummary,
} from '@/lib/apps/sales/commercial-margin-quality';

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
    return currency + ' ' + value.toLocaleString();
  }
}

function formatPercent(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 }) + '%';
}

function label(value: string): string {
  return value.replace(/_/g, ' ');
}

function riskTone(percent: number, threshold: number): 'danger' | 'warning' {
  return percent < threshold / 2 ? 'danger' : 'warning';
}

function documentHref(row: SalesCommercialQualityRiskRow): string {
  return row.documentType === 'quotation'
    ? `/apps/sales/quotes/${row.id}`
    : `/apps/sales/orders/${row.id}`;
}

/* -------------------------------------------------------------------------- */
/*  Root                                                                      */
/* -------------------------------------------------------------------------- */

export default function SalesCommercialMarginQuality({
  report,
}: {
  report: SalesCommercialMarginQualityReport;
}) {
  if (!report.canViewCommercialQuality) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-black">Margin and discount quality</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          This report requires both Sales report access and margin-view
          permission.
        </p>
      </section>
    );
  }

  const currencies = Array.from(
    new Set(report.summaries.map((row) => row.currency)),
  ).sort();

  const totalDocs = report.summaries.reduce(
    (sum, row) => sum + row.documentCount,
    0,
  );
  const totalLowMargin = report.summaries.reduce(
    (sum, row) => sum + row.lowMarginCount,
    0,
  );
  const totalHighDiscount = report.summaries.reduce(
    (sum, row) => sum + row.highDiscountCount,
    0,
  );

  return (
    <section className="space-y-4">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-black tracking-tight">
            Margin and discount quality
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Quotations and confirmed or closed orders from the last{' '}
            {report.windowDays} days. The review queue flags documents below{' '}
            {report.marginThresholdPercent}% margin or at/above{' '}
            {report.discountThresholdPercent}% discount. Values stay in their
            original currency; returns and later credit notes are not netted into
            order margin.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          Last {report.windowDays} days
        </span>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Hero KPIs                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-3 sm:grid-cols-3">
        <HeroCard
          icon={<FileText className="h-4 w-4" aria-hidden="true" />}
          tone="default"
          label="Documents in scope"
          value={totalDocs.toLocaleString()}
          detail={`Across ${currencies.length} currenc${currencies.length === 1 ? 'y' : 'ies'}`}
        />
        <HeroCard
          icon={<TrendingDown className="h-4 w-4" aria-hidden="true" />}
          tone="danger"
          label="Below margin threshold"
          value={totalLowMargin.toLocaleString()}
          detail={`Margin under ${report.marginThresholdPercent}%`}
        />
        <HeroCard
          icon={<Percent className="h-4 w-4" aria-hidden="true" />}
          tone="warning"
          label="Above discount threshold"
          value={totalHighDiscount.toLocaleString()}
          detail={`Discount at/above ${report.discountThresholdPercent}%`}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Summary by currency                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-black">Commercial performance</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Weighted by document totals, grouped by currency and document type.
            </p>
          </div>
        </div>

        {report.summaries.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div
              aria-hidden="true"
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
            >
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-black">No documents in scope</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
              No quotations or confirmed orders were dated in the last{' '}
              {report.windowDays} days.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {currencies.map((currency) => {
              const rows = report.summaries.filter(
                (row) => row.currency === currency,
              );
              return (
                <section key={currency} className="px-5 py-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {currency}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {rows.length} document type{rows.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {rows.map((row) => (
                      <SummaryCard key={row.documentType} row={row} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Risk queue                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-black">Commercial review queue</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Open quotations and confirmed orders that cross either review
              threshold. Review before approving further discounts or terms.
            </p>
          </div>
          <span
            className={
              report.risks.length === 0
                ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700 ring-1 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-red-700 ring-1 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300'
            }
          >
            {report.risks.length} flagged
          </span>
        </div>

        {report.risks.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div
              aria-hidden="true"
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-black">All clear</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
              No documents met the commercial review thresholds in this period.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {currencies
              .filter((currency) =>
                report.risks.some((row) => row.currency === currency),
              )
              .map((currency) => {
                const rows = report.risks.filter(
                  (row) => row.currency === currency,
                );
                return (
                  <section key={currency} className="px-5 py-4">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {currency}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {rows.length} flagged document
                        {rows.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {rows.map((row) => (
                        <RiskCard
                          key={row.documentType + ':' + row.id}
                          row={row}
                          marginThreshold={report.marginThresholdPercent}
                          discountThreshold={report.discountThresholdPercent}
                        />
                      ))}
                    </ul>
                  </section>
                );
              })}
          </div>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

type HeroTone = 'default' | 'danger' | 'warning';

const HERO_TONES: Record<
  HeroTone,
  { iconBg: string; iconFg: string; ring: string }
> = {
  default: {
    iconBg: 'bg-slate-100 dark:bg-slate-800/60',
    iconFg: 'text-slate-600 dark:text-slate-300',
    ring: '',
  },
  danger: {
    iconBg: 'bg-red-50 dark:bg-red-950/40',
    iconFg: 'text-red-600 dark:text-red-400',
    ring: 'ring-1 ring-red-500/10 dark:ring-red-500/20',
  },
  warning: {
    iconBg: 'bg-amber-50 dark:bg-amber-950/40',
    iconFg: 'text-amber-600 dark:text-amber-400',
    ring: 'ring-1 ring-amber-500/10 dark:ring-amber-500/20',
  },
};

function HeroCard({
  icon,
  tone,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  tone: HeroTone;
  label: string;
  value: string;
  detail: string;
}) {
  const palette = HERO_TONES[tone];
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
          {label}
        </p>
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${palette.iconBg} ${palette.iconFg} ${palette.ring}`}
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 text-2xl font-black tabular-nums tracking-tight">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {detail}
      </p>
    </div>
  );
}

function SummaryCard({ row }: { row: SalesCommercialQualitySummary }) {
  const lowMargin = row.marginPercent < 10;
  const highDiscount = row.averageDiscountPercent >= 20;
  const isQuotation = row.documentType === 'quotation';

  return (
    <li className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 dark:border-slate-800 dark:bg-slate-950/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={
              isQuotation
                ? 'inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300'
                : 'inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300'
            }
          >
            {isQuotation ? (
              <FileText className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            )}
          </span>
          <span className="text-sm font-black capitalize">
            {row.documentType}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {row.documentCount.toLocaleString()} document
            {row.documentCount === 1 ? '' : 's'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {lowMargin ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-red-700 ring-1 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300">
              <TrendingDown className="h-3 w-3" aria-hidden="true" />
              {row.lowMarginCount} low margin
            </span>
          ) : null}
          {highDiscount ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-amber-700 ring-1 ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-300">
              <Percent className="h-3 w-3" aria-hidden="true" />
              {row.highDiscountCount} high discount
            </span>
          ) : null}
          {!lowMargin && !highDiscount ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700 ring-1 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              Within threshold
            </span>
          ) : null}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Net value" value={formatMoney(row.netValue, row.currency)} />
        <Stat
          label="Discount"
          value={formatMoney(row.discountAmount, row.currency)}
          hint={formatPercent(row.averageDiscountPercent)}
          highlight={highDiscount ? 'warning' : undefined}
        />
        <Stat label="Margin" value={formatMoney(row.marginAmount, row.currency)} />
        <Stat
          label="Margin rate"
          value={formatPercent(row.marginPercent)}
          highlight={lowMargin ? 'danger' : undefined}
        />
      </dl>
    </li>
  );
}

function RiskCard({
  row,
  marginThreshold,
  discountThreshold,
}: {
  row: SalesCommercialQualityRiskRow;
  marginThreshold: number;
  discountThreshold: number;
}) {
  const marginFlagged = row.marginPercent < marginThreshold;
  const discountFlagged = row.discountPercent >= discountThreshold;
  const marginTone = marginFlagged
    ? riskTone(row.marginPercent, marginThreshold)
    : null;
  const discountTone = discountFlagged
    ? riskTone(row.discountPercent, discountThreshold * 2)
    : null;

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:border-slate-700 dark:text-slate-300">
              {row.documentType === 'quotation' ? 'Quote' : 'Order'}
            </span>
            <Link
              href={documentHref(row)}
              className="inline-flex items-center gap-1 text-sm font-black underline decoration-slate-300 underline-offset-4 hover:decoration-current dark:decoration-slate-600"
            >
              {row.documentNumber}
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </Link>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
              {label(row.status)}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
            {row.customerName}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {marginFlagged ? (
            <span
              className={
                marginTone === 'danger'
                  ? 'inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-red-700 ring-1 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300'
                  : 'inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-amber-700 ring-1 ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-300'
              }
            >
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Margin {formatPercent(row.marginPercent)}
            </span>
          ) : null}
          {discountFlagged ? (
            <span
              className={
                discountTone === 'danger'
                  ? 'inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-red-700 ring-1 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300'
                  : 'inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-amber-700 ring-1 ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-300'
              }
            >
              <Percent className="h-3 w-3" aria-hidden="true" />
              Discount {formatPercent(row.discountPercent)}
            </span>
          ) : null}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Net value" value={formatMoney(row.netValue, row.currency)} />
        <Stat
          label="Discount"
          value={formatMoney(row.discountAmount, row.currency)}
          hint={formatPercent(row.discountPercent)}
          highlight={discountFlagged ? 'warning' : undefined}
        />
        <Stat label="Margin" value={formatMoney(row.marginAmount, row.currency)} />
        <Stat
          label="Margin rate"
          value={formatPercent(row.marginPercent)}
          highlight={marginFlagged ? 'danger' : undefined}
        />
      </dl>

      <p className="mt-3 inline-flex items-start gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{row.riskReason}</span>
      </p>
    </li>
  );
}

function Stat({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: 'danger' | 'warning';
}) {
  const valueTone =
    highlight === 'danger'
      ? 'text-red-600 dark:text-red-400'
      : highlight === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-slate-900 dark:text-slate-100';

  return (
    <div>
      <dt className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className={`mt-0.5 text-sm font-black tabular-nums ${valueTone}`}>
        {value}
      </dd>
      {hint ? (
        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}