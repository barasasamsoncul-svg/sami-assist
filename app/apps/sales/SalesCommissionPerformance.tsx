import {
  Banknote,
  CheckCircle2,
  RotateCcw,
  UserRound,
  Users,
} from 'lucide-react';

import type { SalesCommissionPerformanceRow } from '@/lib/apps/sales/commission-performance';

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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  if (parts.length === 0) return '·';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '·';
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function SalesCommissionPerformance({
  rows,
}: {
  rows: SalesCommissionPerformanceRow[];
}) {
  const currencies = Array.from(new Set(rows.map((row) => row.currency))).sort();

  const totals = rows.reduce(
    (acc, row) => ({
      entryCount: acc.entryCount + row.entryCount,
      accruedAmount: acc.accruedAmount + row.accruedAmount,
      paidAmount: acc.paidAmount + row.paidAmount,
      reversedAmount: acc.reversedAmount + row.reversedAmount,
    }),
    { entryCount: 0, accruedAmount: 0, paidAmount: 0, reversedAmount: 0 },
  );

  const topCurrency = currencies[0] ?? 'KES';

  return (
    <section className="space-y-4">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <header>
        <h2 className="text-base font-black tracking-tight">
          Commission performance
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
          Commission entries accrued in the last 90 days, grouped by salesperson,
          team and currency. Status shows the current disposition of each entry;
          currency totals are never combined.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <div
            aria-hidden="true"
            className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
          >
            <Banknote className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-black">No commission entries</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
            No commission entries are available for this period, or your access
            does not include commission reporting.
          </p>
        </div>
      ) : (
        <>
          {/* -------------------------------------------------------------- */}
          {/* Overall KPI strip (across currencies — kept as counts + a       */}
          {/* representative currency for reference only)                    */}
          {/* -------------------------------------------------------------- */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={<Banknote className="h-4 w-4" aria-hidden="true" />}
              tone="default"
              label="Entries"
              value={totals.entryCount.toLocaleString()}
              detail={`Across ${currencies.length} currenc${currencies.length === 1 ? 'y' : 'ies'}`}
            />
            <KpiCard
              icon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}
              tone="warning"
              label="Accrued (unpaid)"
              value={formatMoney(totals.accruedAmount, topCurrency)}
              detail={
                currencies.length > 1
                  ? `Primary currency shown · see per-currency below`
                  : 'Awaiting payment'
              }
            />
            <KpiCard
              icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              tone="success"
              label="Paid"
              value={formatMoney(totals.paidAmount, topCurrency)}
              detail={
                currencies.length > 1
                  ? `Primary currency shown · see per-currency below`
                  : 'Settled commission'
              }
            />
            <KpiCard
              icon={<Users className="h-4 w-4" aria-hidden="true" />}
              tone="danger"
              label="Reversed"
              value={formatMoney(totals.reversedAmount, topCurrency)}
              detail={
                currencies.length > 1
                  ? `Primary currency shown · see per-currency below`
                  : 'Reversed by returns or cancellations'
              }
            />
          </div>

          {/* -------------------------------------------------------------- */}
          {/* Per-currency tables                                            */}
          {/* -------------------------------------------------------------- */}
          {currencies.map((currency) => {
            const currencyRows = rows.filter((row) => row.currency === currency);
            const currencyTotals = currencyRows.reduce(
              (acc, row) => ({
                entries: acc.entries + row.entryCount,
                accrued: acc.accrued + row.accruedAmount,
                paid: acc.paid + row.paidAmount,
                reversed: acc.reversed + row.reversedAmount,
              }),
              { entries: 0, accrued: 0, paid: 0, reversed: 0 },
            );

            return (
              <div
                key={currency}
                className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {currency}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {currencyRows.length} salesperson row
                      {currencyRows.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <span className="text-xs font-black tabular-nums text-slate-700 dark:text-slate-300">
                    {currencyTotals.entries.toLocaleString()} entries ·{' '}
                    {formatMoney(currencyTotals.accrued, currency)} accrued
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.08em] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <th scope="col" className="px-5 py-3 font-black">
                          Salesperson
                        </th>
                        <th scope="col" className="px-3 py-3 font-black">
                          Team
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Entries
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Accrued
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-black">
                          Paid
                        </th>
                        <th scope="col" className="px-5 py-3 text-right font-black">
                          Reversed
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {currencyRows.map((row, index) => (
                        <tr
                          key={
                            (row.userId ?? 'unassigned') +
                            ':' +
                            (row.teamId ?? 'no-team') +
                            ':' +
                            currency +
                            ':' +
                            index
                          }
                          className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                        >
                          <th scope="row" className="max-w-[240px] px-5 py-3 text-left">
                            <div className="flex items-center gap-2.5">
                              <span
                                aria-hidden="true"
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                              >
                                {initials(row.salespersonName)}
                              </span>
                              <span className="truncate font-bold">
                                {row.salespersonName}
                              </span>
                            </div>
                          </th>
                          <td className="max-w-[180px] truncate px-3 py-3 text-slate-500 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1">
                              <Users
                                className="h-3 w-3 text-slate-400 dark:text-slate-500"
                                aria-hidden="true"
                              />
                              {row.teamName}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {row.entryCount.toLocaleString()}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            <span className="block font-bold">
                              {formatMoney(row.accruedAmount, currency)}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
                              {row.accruedCount.toLocaleString()} entries
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            <span className="block font-bold text-emerald-600 dark:text-emerald-400">
                              {formatMoney(row.paidAmount, currency)}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
                              {row.paidCount.toLocaleString()} entries
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums">
                            {row.reversedAmount > 0 ? (
                              <>
                                <span className="block font-bold text-red-600 dark:text-red-400">
                                  {formatMoney(row.reversedAmount, currency)}
                                </span>
                                <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
                                  {row.reversedCount.toLocaleString()} entries
                                </span>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400 dark:text-slate-500">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

type KpiTone = 'default' | 'danger' | 'warning' | 'success';

const KPI_TONES: Record<
  KpiTone,
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
  success: {
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    iconFg: 'text-emerald-600 dark:text-emerald-400',
    ring: 'ring-1 ring-emerald-500/10 dark:ring-emerald-500/20',
  },
};

function KpiCard({
  icon,
  tone,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  tone: KpiTone;
  label: string;
  value: string;
  detail: string;
}) {
  const palette = KPI_TONES[tone];
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
      <p className="mt-2 break-words text-xl font-black tabular-nums tracking-tight">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {detail}
      </p>
    </div>
  );
}