import type {
  SalesQuotationEffectivenessReport as Report,
  SalesQuotationEffectivenessRow,
} from '@/lib/apps/sales/quotation-effectiveness';

import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Lock,
  Mail,
  ShieldAlert,
  TrendingUp,
  XCircle,
} from 'lucide-react';

function money(value: number, currency: string) {
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

function days(value: number | null) {
  return value == null
    ? '—'
    : value.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' days';
}

function percent(value: number) {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 }) + '%';
}

function rateTone(rate: number): 'good' | 'warn' | 'bad' | 'muted' {
  if (rate >= 50) return 'good';
  if (rate >= 25) return 'warn';
  if (rate > 0) return 'bad';
  return 'muted';
}

function rateClass(tone: 'good' | 'warn' | 'bad' | 'muted') {
  switch (tone) {
    case 'good':
      return 'text-emerald-700 dark:text-emerald-300';
    case 'warn':
      return 'text-amber-700 dark:text-amber-300';
    case 'bad':
      return 'text-red-700 dark:text-red-300';
    case 'muted':
      return 'text-slate-500 dark:text-slate-400';
  }
}

function rateBarClass(tone: 'good' | 'warn' | 'bad' | 'muted') {
  switch (tone) {
    case 'good':
      return 'bg-emerald-500';
    case 'warn':
      return 'bg-amber-500';
    case 'bad':
      return 'bg-red-500';
    case 'muted':
      return 'bg-slate-400';
  }
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function EffectivenessTable({
  title,
  description,
  rows,
  dimensionLabel,
}: {
  title: string;
  description: string;
  rows: SalesQuotationEffectivenessRow[];
  dimensionLabel: string;
}) {
  const currencies = Array.from(new Set(rows.map((row) => row.currency)));

  return (
    <section className="sami-surface rounded-[24px] p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-black">{title}</h3>
          <p className="mt-1 max-w-3xl text-xs text-slate-500 dark:text-slate-400">
            {description}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <FileText className="h-3 w-3" />
          {rows.length} row{rows.length === 1 ? '' : 's'}
        </span>
      </header>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--sami-border)] px-4 py-6 text-center">
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
            No quotations for this breakdown in the last 90 days.
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
            Send a quotation or convert an accepted one to a sales order to populate
            this report.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-8">
          {currencies.map((currency) => {
            const currencyRows = rows.filter((row) => row.currency === currency);
            const totals = currencyRows.reduce(
              (acc, row) => {
                acc.quoteCount += row.quoteCount;
                acc.sentCount += row.sentCount;
                acc.acceptedCount += row.acceptedCount;
                acc.convertedCount += row.convertedCount;
                acc.rejectedCount += row.rejectedCount;
                acc.expiredCount += row.expiredCount;
                acc.quotedValue += row.quotedValue;
                acc.convertedValue += row.convertedValue;
                return acc;
              },
              {
                quoteCount: 0,
                sentCount: 0,
                acceptedCount: 0,
                convertedCount: 0,
                rejectedCount: 0,
                expiredCount: 0,
                quotedValue: 0,
                convertedValue: 0,
              },
            );

            const totalSentToAccepted =
              totals.sentCount > 0 ? (totals.acceptedCount / totals.sentCount) * 100 : 0;
            const totalAcceptedToOrder =
              totals.acceptedCount > 0 ? (totals.convertedCount / totals.acceptedCount) * 100 : 0;
            const totalConversionValue =
              totals.quotedValue > 0 ? (totals.convertedValue / totals.quotedValue) * 100 : 0;

            return (
              <section key={currency} aria-label={currency + ' quotation effectiveness'}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {currency}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {currencyRows.length} {dimensionLabel.toLowerCase()}
                      {currencyRows.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <dl className="flex flex-wrap items-center gap-3 text-[11px]">
                    <SummaryStat
                      icon={<FileText className="h-3 w-3" />}
                      label="Quotes"
                      value={totals.quoteCount.toLocaleString()}
                    />
                    <SummaryStat
                      icon={<Mail className="h-3 w-3" />}
                      label="Sent"
                      value={totals.sentCount.toLocaleString()}
                    />
                    <SummaryStat
                      icon={<CheckCircle2 className="h-3 w-3" />}
                      label="Accepted"
                      value={totals.acceptedCount.toLocaleString()}
                    />
                    <SummaryStat
                      icon={<ArrowRight className="h-3 w-3" />}
                      label="Converted"
                      value={totals.convertedCount.toLocaleString()}
                      bold
                    />
                    <SummaryStat
                      icon={<TrendingUp className="h-3 w-3" />}
                      label="Quoted"
                      value={money(totals.quotedValue, currency)}
                    />
                    <SummaryStat
                      icon={<CheckCircle2 className="h-3 w-3" />}
                      label="Converted value"
                      value={money(totals.convertedValue, currency)}
                      bold
                    />
                  </dl>
                </div>

                {/* Conversion funnel strip */}
                <div className="mb-3 grid gap-2 sm:grid-cols-3">
                  <FunnelCard
                    label="Sent → accepted"
                    value={percent(totalSentToAccepted)}
                    tone={rateTone(totalSentToAccepted)}
                    width={totalSentToAccepted}
                  />
                  <FunnelCard
                    label="Accepted → order"
                    value={percent(totalAcceptedToOrder)}
                    tone={rateTone(totalAcceptedToOrder)}
                    width={totalAcceptedToOrder}
                  />
                  <FunnelCard
                    label="Value converted"
                    value={percent(totalConversionValue)}
                    tone={rateTone(totalConversionValue)}
                    width={totalConversionValue}
                  />
                </div>

                <div className="overflow-x-auto rounded-2xl border border-[var(--sami-border)]">
                  <table className="w-full min-w-[1240px] text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50/80 backdrop-blur dark:bg-slate-900/70">
                      <tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        <th scope="col" className="px-3 py-3 text-left font-black">
                          {dimensionLabel}
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Quotes
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Sent
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Accepted
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Converted
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Rejected
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Expired
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Quoted value
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Converted value
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Sent → accepted
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Accepted → order
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Days to accept
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Days to order
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--sami-border)]">
                      {currencyRows.map((row) => {
                        const sentTone = rateTone(row.sentToAcceptedRate);
                        const orderTone = rateTone(row.acceptedToOrderRate);
                        return (
                          <tr
                            key={row.dimensionKey + ':' + currency}
                            className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                          >
                            <th
                              scope="row"
                              className="max-w-[220px] truncate px-3 py-3 text-left font-bold"
                            >
                              {row.dimensionLabel}
                            </th>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {row.quoteCount.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {row.sentCount.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {row.acceptedCount.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-right font-bold tabular-nums">
                              {row.convertedCount.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums text-red-700 dark:text-red-300">
                              {row.rejectedCount > 0 ? (
                                <span className="inline-flex items-center justify-end gap-1">
                                  <XCircle className="h-3 w-3" />
                                  {row.rejectedCount.toLocaleString()}
                                </span>
                              ) : (
                                row.rejectedCount.toLocaleString()
                              )}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400">
                              {row.expiredCount > 0 ? (
                                <span className="inline-flex items-center justify-end gap-1">
                                  <Clock3 className="h-3 w-3" />
                                  {row.expiredCount.toLocaleString()}
                                </span>
                              ) : (
                                row.expiredCount.toLocaleString()
                              )}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {money(row.quotedValue, currency)}
                            </td>
                            <td className="px-3 py-3 text-right font-bold tabular-nums">
                              {money(row.convertedValue, currency)}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              <RateCell
                                rate={row.sentToAcceptedRate}
                                tone={sentTone}
                              />
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              <RateCell
                                rate={row.acceptedToOrderRate}
                                tone={orderTone}
                              />
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {days(row.sentToAcceptedDays)}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {days(row.acceptedToOrderDays)}
                            </td>
                          </tr>
                        );
                      })}
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

function RateCell({ rate, tone }: { rate: number; tone: 'good' | 'warn' | 'bad' | 'muted' }) {
  const width = clampPercent(rate);
  return (
    <div className="flex items-center justify-end gap-2">
      <div
        className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        role="img"
        aria-label={`${percent(rate)} rate`}
      >
        <div
          className={'h-full rounded-full ' + rateBarClass(tone)}
          style={{ width: `${Math.max(2, width)}%` }}
        />
      </div>
      <span className={'text-xs font-bold tabular-nums ' + rateClass(tone)}>
        {percent(rate)}
      </span>
    </div>
  );
}

function FunnelCard({
  label,
  value,
  tone,
  width,
}: {
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'bad' | 'muted';
  width: number;
}) {
  const safeWidth = clampPercent(width);
  return (
    <div className="rounded-xl border border-[var(--sami-border)] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className={'text-sm font-black tabular-nums ' + rateClass(tone)}>{value}</p>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        role="img"
        aria-label={`${label}: ${value}`}
      >
        <div
          className={'h-full rounded-full ' + rateBarClass(tone)}
          style={{ width: `${Math.max(2, safeWidth)}%` }}
        />
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  icon,
  bold,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </dt>
      <dd className={`tabular-nums ${bold ? 'text-sm font-black' : 'text-xs font-bold'}`}>
        {value}
      </dd>
    </div>
  );
}

export default function SalesQuotationEffectiveness({ report }: { report: Report }) {
  if (!report.canViewReports) {
    return (
      <section className="sami-surface rounded-[24px] p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <Lock className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-black">Quotation effectiveness</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                Quotation effectiveness is unavailable because your account does not have
                Sales report access.
              </p>
              <p className="mt-2 inline-flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
                Ask an administrator to grant Sales report permissions if you need this
                view.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-base font-black">Quotation effectiveness</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Quotations dated in the last 90 days. Accepted means customer acceptance recorded
          or an accepted/converted status; converted means a linked order exists. Amounts
          remain separated by quotation currency.
        </p>
      </header>

      <EffectivenessTable
        title="Salesperson quote effectiveness"
        description="Compares sent, accepted and ordered quotations by the currently assigned salesperson. Only active internal tenant members are named."
        rows={report.bySalesperson}
        dimensionLabel="Salesperson"
      />
      <EffectivenessTable
        title="Quotation template effectiveness"
        description="Compares template performance. Quotes without a template and quotes linked to deleted templates remain visible separately."
        rows={report.byTemplate}
        dimensionLabel="Template"
      />
    </section>
  );
}