'use client';

import { useEffect, useState } from 'react';
import {
  BadgeDollarSign,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  PackageCheck,
  RotateCcw,
  TrendingUp,
  Truck,
  Wallet,
} from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type OperationsData = {
  capabilities: {
    canViewShipping: boolean;
    canManageShipping: boolean;
    canViewReturns: boolean;
    canManageReturns: boolean;
    canManageDeposits: boolean;
    canViewForecast: boolean;
  };
  shipments: Array<{
    id: string;
    sales_order_id: string;
    order_number: string;
    shipment_number: string;
    status: string;
    carrier: string | null;
    service_level: string | null;
    tracking_number: string | null;
    tracking_url: string | null;
    recipient_name: string | null;
    proof_note: string | null;
    shipped_at: string | null;
    delivered_at: string | null;
    inventory_posted_at: string | null;
  }>;
  returns: Array<{
    id: string;
    sales_order_id: string;
    order_number: string;
    return_number: string;
    status: string;
    reason: string;
    credits: Array<{
      id: string;
      invoiceId: string;
      creditNoteId: string;
      creditNoteNumber: string;
      currency: string;
      amount: number | string;
      availableCredit: number | string;
      refundedAmount: number | string;
    }>;
  }>;
  deposits: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    currency: string;
    totalAmount: number;
    depositType: string;
    depositValue: number;
    requiredAmount: number;
    receivedAmount: number;
    status: string;
    retainerId: string | null;
    paymentId: string | null;
  }>;
  forecast: {
    horizonDays: number;
    baseCurrency: string;
    openPipeline: number;
    weightedPipeline: number;
    committedOrders: number;
    expectedRevenue: number;
    currencyBreakdown: Array<{
      currency: string;
      openPipeline: number;
      weightedPipeline: number;
      committedOrders: number;
      expectedRevenue: number;
      expiring7Days: number;
      committedOrderCount: number;
    }>;
    expiring7Days: number;
    committedOrderCount: number;
  };
};

type ForecastMetric =
  | 'expectedRevenue'
  | 'weightedPipeline'
  | 'committedOrders';

const HORIZONS: Array<[string, string]> = [
  ['30', '30 days'],
  ['60', '60 days'],
  ['90', '90 days'],
  ['180', '180 days'],
  ['365', '365 days'],
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatMoney(value: number | string, currency = 'KES'): string {
  const numeric = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return currency + ' ' + numeric.toLocaleString();
  }
}

function shipmentStatusTone(status: string): string {
  switch (status) {
    case 'ready':
      return 'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-500/30';
    case 'shipped':
    case 'in_transit':
      return 'bg-blue-50 text-blue-700 ring-blue-500/20 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-500/30';
    case 'delivered':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/30';
    case 'cancelled':
    case 'failed':
      return 'bg-red-50 text-red-700 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-500/30';
    default:
      return 'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-500/30';
  }
}

function returnStatusTone(status: string): string {
  switch (status) {
    case 'requested':
      return 'bg-amber-50 text-amber-700 ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-500/30';
    case 'approved':
      return 'bg-blue-50 text-blue-700 ring-blue-500/20 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-500/30';
    case 'received':
      return 'bg-indigo-50 text-indigo-700 ring-indigo-500/20 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-500/30';
    case 'credited':
    case 'refunded':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/30';
    default:
      return 'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-500/30';
  }
}

function depositStatusTone(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-amber-50 text-amber-700 ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-500/30';
    case 'received':
    case 'applied':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/30';
    case 'partially_applied':
      return 'bg-blue-50 text-blue-700 ring-blue-500/20 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-500/30';
    default:
      return 'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-500/30';
  }
}

/* -------------------------------------------------------------------------- */
/*  Root                                                                      */
/* -------------------------------------------------------------------------- */

export default function SalesOperationsManager({
  busy,
  request,
  showSuccess,
  showError,
}: {
  busy: boolean;
  request: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
}) {
  const [data, setData] = useState<OperationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [horizon, setHorizon] = useState('90');

  function forecastValue(metric: ForecastMetric): string {
    const breakdown = data?.forecast.currencyBreakdown || [];
    const applicable = breakdown.filter(
      (item) => Number(item[metric] || 0) !== 0,
    );
    if (applicable.length === 0) {
      const currency = data?.forecast.baseCurrency || breakdown[0]?.currency || 'KES';
      return formatMoney(data?.forecast[metric] || 0, currency);
    }
    return applicable.map((item) => formatMoney(item[metric], item.currency)).join(' · ');
  }

  async function refresh(nextHorizon = horizon) {
    setLoading(true);
    try {
      const response = await fetch(
        '/api/apps/sales?operations=1&horizon=' + encodeURIComponent(nextHorizon),
        { cache: 'no-store', credentials: 'same-origin' },
      );
      const body = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        operations?: OperationsData;
      };
      if (!response.ok || body.success !== true || !body.operations) {
        throw new Error(body.error || 'SaMi could not load Sales operations.');
      }
      setData(body.operations);
    } catch (error) {
      showError(
        'Sales operations unavailable',
        error instanceof Error ? error.message : 'SaMi could not load Sales operations.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh('90');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function action(payload: Record<string, unknown>, message: string) {
    try {
      await request(payload);
      showSuccess('Sales operation completed', message);
      await refresh();
    } catch (error) {
      showError(
        'Sales operation failed',
        error instanceof Error
          ? error.message
          : 'SaMi could not complete the Sales operation.',
      );
    }
  }

  if (loading && !data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading Sales operations…
        </span>
      </div>
    );
  }

  if (!data) return null;

  /* ------------------------------------------------------------------------ */
  /*  Render                                                                 */
  /* ------------------------------------------------------------------------ */

  return (
    <section className="space-y-4">
      {/* ------------------------------------------------------------------ */}
      {/* Forecast                                                           */}
      {/* ------------------------------------------------------------------ */}
      {data.capabilities.canViewForecast ? (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                  <TrendingUp className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-sm font-black">Revenue outlook</h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Weighted quotations plus confirmed orders that remain uninvoiced.
                  </p>
                </div>
              </div>

              <label className="relative inline-flex items-center text-xs font-black">
                <span className="mr-2 text-slate-500 dark:text-slate-400">Horizon</span>
                <div className="relative">
                  <select
                    value={horizon}
                    onChange={(event) => {
                      const value = event.target.value;
                      setHorizon(value);
                      void refresh(value);
                    }}
                    className="h-9 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-xs font-black focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
                  >
                    {HORIZONS.map(([value, text]) => (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                  />
                </div>
              </label>
            </div>

            <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
              <ForecastKpi
                icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
                label="Expected revenue"
                value={forecastValue('expectedRevenue')}
              />
              <ForecastKpi
                icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
                label="Weighted pipeline"
                value={forecastValue('weightedPipeline')}
              />
              <ForecastKpi
                icon={<PackageCheck className="h-4 w-4" aria-hidden="true" />}
                label="Committed orders"
                value={forecastValue('committedOrders')}
              />
              <ForecastKpi
                icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
                label="Quotes expiring"
                value={String(data.forecast.expiring7Days) + ' in 7 days'}
                tone="warning"
              />
            </div>
          </div>
        </>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Shipments                                                          */}
      {/* ------------------------------------------------------------------ */}
      {data.capabilities.canViewShipping ? (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
                <Truck className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-black">Shipments &amp; tracking</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Dispatch and delivery across sales orders.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {data.shipments.length} shipment{data.shipments.length === 1 ? '' : 's'}
            </span>
          </div>

          {data.shipments.length === 0 ? (
            <EmptyState
              icon={<Truck className="h-5 w-5" />}
              title="No shipments yet"
              description="Create one from a sales order to start dispatch tracking."
            />
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.shipments.map((shipment) => (
                <li key={shipment.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black">
                          {shipment.shipment_number}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          · {shipment.order_number}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ring-1 ${shipmentStatusTone(shipment.status)}`}
                        >
                          {shipment.status.replaceAll('_', ' ')}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {[shipment.carrier, shipment.service_level, shipment.tracking_number]
                          .filter(Boolean)
                          .join(' · ') || 'No carrier details yet'}
                      </p>
                    </div>
                  </div>

                  {data.capabilities.canManageShipping &&
                  !['delivered', 'cancelled'].includes(shipment.status) ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {shipment.status === 'ready' ? (
                        <ActionButton
                          disabled={busy}
                          onClick={() =>
                            void action(
                              {
                                action: 'update_shipment_status',
                                shipmentId: shipment.id,
                                status: 'shipped',
                              },
                              'Shipment posted to Inventory and marked shipped.',
                            )
                          }
                        >
                          Mark shipped
                        </ActionButton>
                      ) : null}

                      {['shipped', 'ready'].includes(shipment.status) ? (
                        <ActionButton
                          disabled={busy}
                          onClick={() =>
                            void action(
                              {
                                action: 'update_shipment_status',
                                shipmentId: shipment.id,
                                status: 'in_transit',
                              },
                              'Shipment marked in transit.',
                            )
                          }
                        >
                          In transit
                        </ActionButton>
                      ) : null}

                      {['shipped', 'in_transit', 'ready'].includes(shipment.status) ? (
                        <ActionButton
                          disabled={busy}
                          onClick={() =>
                            void action(
                              {
                                action: 'update_shipment_status',
                                shipmentId: shipment.id,
                                status: 'delivered',
                              },
                              'Shipment marked delivered.',
                            )
                          }
                        >
                          Delivered
                        </ActionButton>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Returns                                                            */}
      {/* ------------------------------------------------------------------ */}
      {data.capabilities.canViewReturns ? (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-black">Returns, credits &amp; refunds</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Approve, receive, credit and refund customer returns.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {data.returns.length} return{data.returns.length === 1 ? '' : 's'}
            </span>
          </div>

          {data.returns.length === 0 ? (
            <EmptyState
              icon={<RotateCcw className="h-5 w-5" />}
              title="No returns yet"
              description="Create a return from a sales order to reverse stock and issue credits."
            />
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.returns.map((item) => (
                <li key={item.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black">{item.return_number}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          · {item.order_number}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ring-1 ${returnStatusTone(item.status)}`}
                        >
                          {item.status.replaceAll('_', ' ')}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {item.reason || 'No reason recorded'}
                      </p>
                    </div>
                  </div>

                  {data.capabilities.canManageReturns ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.status === 'requested' ? (
                        <ActionButton
                          disabled={busy}
                          onClick={() =>
                            void action(
                              { action: 'approve_return', returnId: item.id },
                              'Sales return approved.',
                            )
                          }
                        >
                          Approve
                        </ActionButton>
                      ) : null}

                      {item.status === 'approved' ? (
                        <ActionButton
                          disabled={busy}
                          onClick={() =>
                            void action(
                              { action: 'receive_return', returnId: item.id },
                              'Returned stock received and Inventory reversed.',
                            )
                          }
                        >
                          Receive stock
                        </ActionButton>
                      ) : null}

                      {item.status === 'received' ? (
                        <ActionButton
                          disabled={busy}
                          onClick={() =>
                            void action(
                              { action: 'issue_return_credit', returnId: item.id },
                              'Invoice credit notes created for invoiced return quantities.',
                            )
                          }
                        >
                          Issue credit
                        </ActionButton>
                      ) : null}
                    </div>
                  ) : null}

                  {Array.isArray(item.credits) && item.credits.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {item.credits.map((credit) => (
                        <div
                          key={credit.id}
                          className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/40 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <p className="text-[11px] font-black">
                              {credit.creditNoteNumber}
                            </p>
                            <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                              Credit {formatMoney(credit.amount, credit.currency)} ·
                              Available {formatMoney(credit.availableCredit, credit.currency)}
                            </p>
                          </div>

                          {data.capabilities.canManageReturns &&
                          Number(credit.availableCredit || 0) > 0 ? (
                            <ActionButton
                              disabled={busy}
                              onClick={() =>
                                void action(
                                  {
                                    action: 'refund_return_credit',
                                    returnCreditId: credit.id,
                                    amount: Number(credit.availableCredit),
                                    method: 'bank',
                                    reason: 'Refund for Sales return',
                                    idempotencyKey: globalThis.crypto?.randomUUID?.(),
                                  },
                                  'Customer credit refunded.',
                                )
                              }
                            >
                              Refund available credit
                            </ActionButton>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Deposits                                                           */}
      {/* ------------------------------------------------------------------ */}
      {data.capabilities.canManageDeposits ? (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300">
                <BadgeDollarSign className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-black">Customer deposits</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Required vs received for each sales order holding a deposit.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {data.deposits.length} order{data.deposits.length === 1 ? '' : 's'}
            </span>
          </div>

          {data.deposits.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-5 w-5" />}
              title="No deposits on file"
              description="No sales orders currently require or hold a deposit."
            />
          ) : (
            <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
              {data.deposits.map((deposit) => {
                const progress =
                  deposit.requiredAmount > 0
                    ? Math.min(
                        100,
                        Math.round(
                          (deposit.receivedAmount / deposit.requiredAmount) * 100,
                        ),
                      )
                    : 0;

                return (
                  <div
                    key={deposit.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4 dark:border-slate-800 dark:bg-slate-950/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black">
                          {deposit.orderNumber}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {deposit.customerName}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ring-1 ${depositStatusTone(deposit.status)}`}
                      >
                        {deposit.status.replaceAll('_', ' ')}
                      </span>
                    </div>

                    <div className="mt-3 space-y-2">
                      <div className="flex items-baseline justify-between text-[11px]">
                        <span className="font-bold text-slate-600 dark:text-slate-300">
                          {formatMoney(deposit.receivedAmount, deposit.currency)}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          of {formatMoney(deposit.requiredAmount, deposit.currency)}
                        </span>
                      </div>
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
                        role="progressbar"
                        aria-valuenow={progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className={
                            progress >= 100
                              ? 'h-full rounded-full bg-emerald-500'
                              : progress > 0
                                ? 'h-full rounded-full bg-amber-500'
                                : 'h-full rounded-full bg-slate-400'
                          }
                          style={{ width: Math.max(2, progress) + '%' }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {deposit.depositType === 'percent'
                          ? `${deposit.depositValue}% deposit`
                          : deposit.depositType === 'fixed'
                            ? `Fixed ${formatMoney(deposit.depositValue, deposit.currency)}`
                            : 'No deposit requirement'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function ForecastKpi({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'default' | 'warning';
}) {
  const iconClass =
    tone === 'warning'
      ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300'
      : 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300';

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
          {label}
        </p>
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${iconClass}`}
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 break-words text-lg font-black tabular-nums tracking-tight">
        {value}
      </p>
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <div
        aria-hidden="true"
        className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
      >
        {icon}
      </div>
      <p className="mt-3 text-sm font-black">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}