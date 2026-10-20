import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CornerDownLeft,
  Info,
  Package,
  ShieldAlert,
  Truck,
} from 'lucide-react';

import type { SalesReturnFulfillmentQualityReport } from '@/lib/apps/sales/return-fulfillment-quality';

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

type Tone = 'emerald' | 'amber' | 'red' | 'blue' | 'slate';

function statusTone(value: string): Tone {
  const v = value.toLowerCase();
  if (['delivered', 'completed', 'refunded', 'closed', 'approved'].includes(v)) return 'emerald';
  if (['cancelled', 'rejected', 'failed', 'lost'].includes(v)) return 'red';
  if (['pending', 'processing', 'in_transit', 'requested', 'shipped'].includes(v)) return 'amber';
  if (['draft', 'new', 'open'].includes(v)) return 'slate';
  return 'blue';
}

function toneClass(tone: Tone) {
  switch (tone) {
    case 'emerald':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/30';
    case 'amber':
      return 'bg-amber-50 text-amber-700 ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-500/30';
    case 'red':
      return 'bg-red-50 text-red-700 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-500/30';
    case 'slate':
      return 'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-500/30';
    case 'blue':
      return 'bg-blue-50 text-blue-700 ring-blue-500/20 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-500/30';
  }
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] capitalize ring-1 ${toneClass(statusTone(value))}`}
    >
      {statusLabel(value)}
    </span>
  );
}

export default function SalesReturnFulfillmentQuality({
  report,
}: {
  report: SalesReturnFulfillmentQualityReport;
}) {
  const currencies = Array.from(new Set(report.returnsByStatus.map((row) => row.currency)));
  const reasonCurrencies = Array.from(
    new Set(report.returnReasons.map((row) => row.currency)),
  );

  const hasAnyPermission = report.canViewShipping || report.canViewReturns;

  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-base font-black">Returns and delivery quality</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Return requests and shipments from the last 90 days. Return credits use the
          associated order currency. Shipment timing is based on recorded timestamps, not
          promised delivery dates.
        </p>
      </header>

      {!hasAnyPermission ? (
        <div className="sami-surface rounded-[24px] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-black">Reporting access required</p>
              <p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400">
                Your Sales Reports access does not include shipment or return reporting
                permissions.
              </p>
              <p className="mt-2 inline-flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                Ask an administrator to grant shipping and returns reporting permissions if
                you need this view.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {report.canViewShipping ? (
        <section className="sami-surface rounded-[24px] p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                <Truck className="h-3.5 w-3.5" />
              </span>
              <div>
                <h3 className="text-sm font-black">Shipment execution</h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Dispatch and delivery duration excludes records with missing or invalid
                  timestamps.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <Package className="h-3 w-3" />
              {report.shipmentsByStatus.length} status
              {report.shipmentsByStatus.length === 1 ? '' : 'es'}
            </span>
          </div>

          {report.shipmentsByStatus.length === 0 ? (
            <EmptyBlock
              icon={<Truck className="h-5 w-5" />}
              title="No shipments yet"
              description="No shipments were created in the last 90 days. Dispatch a shipment to populate this report."
            />
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--sami-border)]">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="sticky top-0 bg-slate-50/80 backdrop-blur dark:bg-slate-900/70">
                  <tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                    <th scope="col" className="px-3 py-3 text-left font-black">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-black">
                      Shipments
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-black">
                      Orders
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-black">
                      Units on shipments
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-black">
                      Avg. time to ship
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-black">
                      Avg. transit time
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--sami-border)]">
                  {report.shipmentsByStatus.map((row) => (
                    <tr
                      key={row.status}
                      className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                    >
                      <th scope="row" className="px-3 py-3 text-left">
                        <StatusBadge value={row.status} />
                      </th>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {row.shipmentCount.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {row.orderCount.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {quantity(row.itemQuantity)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {duration(row.averageHoursToShip)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {duration(row.averageHoursToDeliver)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {report.canViewReturns ? (
        <>
          <section className="sami-surface rounded-[24px] p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300">
                  <CornerDownLeft className="h-3.5 w-3.5" />
                </span>
                <div>
                  <h3 className="text-sm font-black">Return lifecycle by status</h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Cancelled sales orders are excluded; status counts retain cancelled
                    returns. Credit, available credit, and refunds are kept separate by
                    currency.
                  </p>
                </div>
              </div>
            </div>

            {report.returnsByStatus.length === 0 ? (
              <EmptyBlock
                icon={<CornerDownLeft className="h-5 w-5" />}
                title="No return requests"
                description="No returns were requested in the last 90 days. A return request will appear here once recorded."
              />
            ) : (
              <div className="mt-5 space-y-8">
                {currencies.map((currency) => {
                  const rows = report.returnsByStatus.filter(
                    (row) => row.currency === currency,
                  );
                  const totals = rows.reduce(
                    (acc, row) => {
                      acc.returnCount += row.returnCount;
                      acc.orderCount += row.orderCount;
                      acc.itemQuantity += row.itemQuantity;
                      acc.creditAmount += row.creditAmount;
                      acc.availableCredit += row.availableCredit;
                      acc.refundedAmount += row.refundedAmount;
                      return acc;
                    },
                    {
                      returnCount: 0,
                      orderCount: 0,
                      itemQuantity: 0,
                      creditAmount: 0,
                      availableCredit: 0,
                      refundedAmount: 0,
                    },
                  );

                  return (
                    <section
                      key={currency}
                      aria-label={currency + ' return status'}
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {currency}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {rows.length} status
                            {rows.length === 1 ? '' : 'es'}
                          </span>
                        </div>
                        <dl className="flex flex-wrap items-center gap-3 text-[11px]">
                          <SummaryStat
                            icon={<CornerDownLeft className="h-3 w-3" />}
                            label="Returns"
                            value={totals.returnCount.toLocaleString()}
                          />
                          <SummaryStat
                            icon={<Package className="h-3 w-3" />}
                            label="Units"
                            value={quantity(totals.itemQuantity)}
                          />
                          <SummaryStat
                            icon={<CheckCircle2 className="h-3 w-3" />}
                            label="Credit"
                            value={money(totals.creditAmount, currency)}
                          />
                          <SummaryStat
                            icon={<Info className="h-3 w-3" />}
                            label="Available"
                            value={money(totals.availableCredit, currency)}
                          />
                          <SummaryStat
                            icon={<ArrowRight className="h-3 w-3" />}
                            label="Refunded"
                            value={money(totals.refundedAmount, currency)}
                            bold
                          />
                        </dl>
                      </div>

                      <div className="overflow-x-auto rounded-2xl border border-[var(--sami-border)]">
                        <table className="w-full min-w-[940px] text-left text-sm">
                          <thead className="sticky top-0 bg-slate-50/80 backdrop-blur dark:bg-slate-900/70">
                            <tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                              <th scope="col" className="px-3 py-3 text-left font-black">
                                Status
                              </th>
                              <th scope="col" className="px-3 py-3 text-right font-black">
                                Returns
                              </th>
                              <th scope="col" className="px-3 py-3 text-right font-black">
                                Orders
                              </th>
                              <th scope="col" className="px-3 py-3 text-right font-black">
                                Units returned
                              </th>
                              <th scope="col" className="px-3 py-3 text-right font-black">
                                Credit notes
                              </th>
                              <th scope="col" className="px-3 py-3 text-right font-black">
                                Available credit
                              </th>
                              <th scope="col" className="px-3 py-3 text-right font-black">
                                Refunded
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--sami-border)]">
                            {rows.map((row) => (
                              <tr
                                key={row.status + ':' + currency}
                                className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                              >
                                <th scope="row" className="px-3 py-3 text-left">
                                  <StatusBadge value={row.status} />
                                </th>
                                <td className="px-3 py-3 text-right tabular-nums">
                                  {row.returnCount.toLocaleString()}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums">
                                  {row.orderCount.toLocaleString()}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums">
                                  {quantity(row.itemQuantity)}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums">
                                  {money(row.creditAmount, currency)}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums">
                                  {money(row.availableCredit, currency)}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums">
                                  {money(row.refundedAmount, currency)}
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
            )}
          </section>

          <section className="sami-surface rounded-[24px] p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>
                <div>
                  <h3 className="text-sm font-black">Return reasons</h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Recorded reasons can be free-form, so similar explanations may appear
                    as separate rows.
                  </p>
                </div>
              </div>
            </div>

            {report.returnReasons.length === 0 ? (
              <EmptyBlock
                icon={<AlertTriangle className="h-5 w-5" />}
                title="No return reasons recorded"
                description="No return reasons are available for this period."
              />
            ) : (
              <div className="mt-5 space-y-8">
                {reasonCurrencies.map((currency) => {
                  const rows = report.returnReasons.filter(
                    (row) => row.currency === currency,
                  );
                  return (
                    <section
                      key={currency}
                      aria-label={currency + ' return reasons'}
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {currency}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {rows.length} reason{rows.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="overflow-x-auto rounded-2xl border border-[var(--sami-border)]">
                        <table className="w-full min-w-[640px] text-left text-sm">
                          <thead className="sticky top-0 bg-slate-50/80 backdrop-blur dark:bg-slate-900/70">
                            <tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                              <th scope="col" className="px-3 py-3 text-left font-black">
                                Recorded reason
                              </th>
                              <th scope="col" className="px-3 py-3 text-right font-black">
                                Returns
                              </th>
                              <th scope="col" className="px-3 py-3 text-right font-black">
                                Units
                              </th>
                              <th scope="col" className="px-3 py-3 text-right font-black">
                                Credit notes
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--sami-border)]">
                            {rows.map((row) => (
                              <tr
                                key={row.reason + ':' + currency}
                                className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                              >
                                <th
                                  scope="row"
                                  className="max-w-[520px] truncate px-3 py-3 text-left font-bold"
                                  title={row.reason}
                                >
                                  {row.reason}
                                </th>
                                <td className="px-3 py-3 text-right tabular-nums">
                                  {row.returnCount.toLocaleString()}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums">
                                  {quantity(row.itemQuantity)}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums">
                                  {money(row.creditAmount, currency)}
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
            )}
          </section>
        </>
      ) : null}
    </section>
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

function EmptyBlock({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-[var(--sami-border)] px-4 py-8 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        {icon}
      </div>
      <p className="mt-3 text-sm font-black">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}