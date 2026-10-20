'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import {
  AlertTriangle,
  BadgeDollarSign,
  ChevronDown,
  ChevronRight,
  Copy,
  Link2,
  Loader2,
  Package,
  PackageCheck,
  Receipt,
  RotateCcw,
  Truck,
  X,
} from 'lucide-react';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import { useSaMiOverlay } from '@/app/components/useSaMiOverlay';

import type {
  SalesOrderDetail,
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';

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

function statusTone(status: string): string {
  switch (status) {
    case 'confirmed':
    case 'active':
    case 'fulfilled':
    case 'invoiced':
    case 'received':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/30';
    case 'closed':
    case 'delivered':
    case 'applied':
    case 'credited':
    case 'refunded':
      return 'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-500/30';
    case 'cancelled':
    case 'failed':
    case 'rejected':
      return 'bg-red-50 text-red-700 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-500/30';
    case 'pending':
    case 'partial':
    case 'partial_delivered':
    case 'partial_invoiced':
    case 'in_transit':
    case 'shipped':
    case 'approved':
    case 'requested':
      return 'bg-amber-50 text-amber-700 ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-500/30';
    default:
      return 'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-500/30';
  }
}

/* -------------------------------------------------------------------------- */
/*  Root                                                                      */
/* -------------------------------------------------------------------------- */

export default function SalesOrderDetailClient({
  order,
  workspace,
}: {
  order: SalesOrderDetail;
  workspace: SalesWorkspaceData;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);

  const invoiceIdempotencyKey = useRef<string | null>(null);

  const [customerPortalUrl, setCustomerPortalUrl] = useState<string | null>(null);

  const shipmentIdempotencyKey = useRef<{ orderId: string; key: string } | null>(
    null,
  );

  const { overlay, closeOverlay, showSuccess, showError, showWarning } =
    useSaMiOverlay();

  const staleCommissionWarningShownFor = useRef<string | null>(null);

  useEffect(() => {
    if (!order.marginCommissionStale) {
      if (staleCommissionWarningShownFor.current === order.id) {
        staleCommissionWarningShownFor.current = null;
      }
      return;
    }
    if (staleCommissionWarningShownFor.current === order.id) return;
    staleCommissionWarningShownFor.current = order.id;
    showWarning(
      'Commission reversal needs attention',
      'This order has a received return while commission entries remain accrued. When the return reversal is processed, those commission rows will change. Review the commission ledger after processing.',
    );
  }, [order.id, order.marginCommissionStale, showWarning]);

  const isBusy = busy || pending;

  async function run(
    payload: Record<string, unknown>,
    message: string,
  ): Promise<Record<string, unknown> | null> {
    if (inFlight.current) {
      showWarning(
        'Action already in progress',
        'Another Sales action is still being saved.',
      );
      return null;
    }
    inFlight.current = true;
    setBusy(true);

    try {
      const response = await fetch('/api/apps/sales', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        result?: Record<string, unknown>;
      };

      if (!response.ok || body.success !== true) {
        throw new Error(body.error || 'SaMi could not complete the Sales action.');
      }

      showSuccess('Action completed', message);
      startTransition(() => router.refresh());

      return body.result || {};
    } catch (error) {
      showError(
        'Sales action failed',
        error instanceof Error
          ? error.message
          : 'SaMi could not complete the Sales action.',
      );
      return null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------------------ */
  /*  Portal link                                                             */
  /* ------------------------------------------------------------------------ */

  async function createCustomerPortalLink() {
    const result = await run(
      { action: 'create_order_portal_link', orderId: order.id },
      'Customer tracking link created. Any previous link has been invalidated.',
    );
    if (!result) return;

    const tenantId = typeof result.tenantId === 'string' ? result.tenantId : '';
    const token = typeof result.token === 'string' ? result.token : '';
    if (!tenantId || !token) {
      showError(
        'Link unavailable',
        'SaMi did not return a valid customer portal link. Please try again.',
      );
      return;
    }

    setCustomerPortalUrl(
      new URL(
        '/order/' +
          encodeURIComponent(tenantId) +
          '/' +
          encodeURIComponent(token),
        window.location.origin,
      ).toString(),
    );
  }

  async function copyCustomerPortalLink() {
    if (!customerPortalUrl) return;
    try {
      await navigator.clipboard.writeText(customerPortalUrl);
      showSuccess(
        'Link copied',
        'The customer order tracking link is ready to share.',
      );
    } catch {
      showWarning('Copy unavailable', 'Select the link field and copy it manually.');
    }
  }

  async function revokeCustomerPortalLink() {
    const result = await run(
      { action: 'revoke_order_portal_link', orderId: order.id },
      'Customer order tracking link revoked.',
    );
    if (result) setCustomerPortalUrl(null);
  }

  /* ------------------------------------------------------------------------ */
  /*  Render                                                                  */
  /* ------------------------------------------------------------------------ */

  return (
    <>
      <SaMiOverlay {...overlay} onClose={closeOverlay} />

      <section className="space-y-4">
        {/* ------------------------------------------------------------------ */}
        {/* Page header                                                        */}
        {/* ------------------------------------------------------------------ */}
        <header className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                Sales · Order
              </p>
              <h1 className="mt-1 text-xl font-black tracking-tight">
                {order.orderNumber}
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {order.customerName}
                {' · '}
                {formatMoney(order.totalAmount, order.currency)}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <StateChip label="Order" value={order.status} />
                <StateChip label="Fulfillment" value={order.fulfillmentStatus} />
                <StateChip label="Invoice" value={order.invoiceStatus} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/apps/sales"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Back to Sales
              </Link>
              {order.quoteId ? (
                <Link
                  href={'/apps/sales/quotes/' + order.quoteId}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Source quotation
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              ) : null}
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Order date" value={order.orderDate} />
            <Kpi
              label="Delivered"
              value={`${order.deliveredPercent}%`}
              tone={order.deliveredPercent === 100 ? 'success' : 'warning'}
            />
            <Kpi
              label="Invoiced"
              value={`${order.invoicedPercent}%`}
              tone={order.invoicedPercent === 100 ? 'success' : 'warning'}
            />
            <Kpi
              label="Deposit"
              value={order.depositStatus.replaceAll('_', ' ')}
              tone={order.depositStatus === 'received' ? 'success' : 'default'}
            />
          </div>
        </header>

        {order.marginCommissionStale ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-black">
                Received return with accrued commissions
              </p>
              <p className="mt-1 text-xs leading-5">
                This order has a received return while commission entries remain
                accrued. Processing the reversal will change those commission
                rows; review the commission ledger after the reversal completes.
              </p>
            </div>
          </div>
        ) : null}

        {/* ------------------------------------------------------------------ */}
        {/* Customer portal                                                    */}
        {/* ------------------------------------------------------------------ */}
        {workspace.capabilities.canManageOrders ? (
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                  <Link2 className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-sm font-black">Customer tracking portal</h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Read-only order and shipment status page. Links expire after
                    90 days; rotating a link invalidates the previous one.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void createCustomerPortalLink()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                >
                  <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {customerPortalUrl ? 'Rotate link' : 'Generate link'}
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void revokeCustomerPortalLink()}
                  className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Revoke link
                </button>
              </div>
            </div>

            {customerPortalUrl ? (
              <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row">
                <input
                  aria-label="Customer order tracking link"
                  readOnly
                  value={customerPortalUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
                <button
                  type="button"
                  onClick={() => void copyCustomerPortalLink()}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copy link
                </button>
              </div>
            ) : (
              <p className="px-5 pb-4 text-xs text-slate-500 dark:text-slate-400">
                No active tracking link. Generate one to share status with the
                customer.
              </p>
            )}
          </div>
        ) : null}

        {/* ------------------------------------------------------------------ */}
        {/* Main two-column layout                                             */}
        {/* ------------------------------------------------------------------ */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* ------------------------ Left column ------------------------ */}
          <div className="space-y-4">
            {/* Fulfillment */}
            <Section title="Order fulfillment" icon={<Truck className="h-4 w-4" />}>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  await run(
                    {
                      action: 'update_fulfillment',
                      orderId: order.id,
                      lines: order.lines.map((line) => ({
                        lineId: line.id,
                        deliveredQuantity: form.get('delivered-' + line.id),
                      })),
                    },
                    'Fulfillment quantities updated.',
                  );
                }}
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.08em] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <th className="px-3 py-3 font-black">Item</th>
                        <th className="px-2 py-3 text-right font-black">Ordered</th>
                        <th className="px-2 py-3 text-right font-black">Shipped</th>
                        <th className="px-2 py-3 text-right font-black">Delivered</th>
                        <th className="px-2 py-3 text-right font-black">Invoiced</th>
                        <th className="px-2 py-3 text-right font-black">Returned</th>
                        <th className="px-2 py-3 text-right font-black">Invoiceable</th>
                        <th className="px-3 py-3 text-right font-black">Line total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {order.lines.map((line) => (
                        <tr key={line.id}>
                          <td className="px-3 py-3">
                            <p className="font-bold">{line.description}</p>
                            <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                              {[line.sku, line.unit].filter(Boolean).join(' · ')}
                            </p>
                          </td>
                          <td className="px-2 py-3 text-right tabular-nums">
                            {line.quantity}
                          </td>
                          <td className="px-2 py-3 text-right tabular-nums">
                            {line.shippedQuantity}
                          </td>
                          <td className="px-2 py-3 text-right tabular-nums">
                            {workspace.capabilities.canManageOrders &&
                            !['cancelled', 'closed'].includes(order.status) ? (
                              <input
                                name={'delivered-' + line.id}
                                type="number"
                                min={line.deliveredQuantity}
                                max={line.quantity}
                                step="0.0001"
                                defaultValue={line.deliveredQuantity}
                                className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-right text-xs tabular-nums focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
                              />
                            ) : (
                              line.deliveredQuantity
                            )}
                          </td>
                          <td className="px-2 py-3 text-right tabular-nums">
                            {line.invoicedQuantity}
                          </td>
                          <td className="px-2 py-3 text-right tabular-nums">
                            {line.returnedQuantity}
                          </td>
                          <td className="px-2 py-3 text-right font-black tabular-nums text-indigo-700 dark:text-indigo-300">
                            {line.invoiceableQuantity}
                          </td>
                          <td className="px-3 py-3 text-right font-bold tabular-nums">
                            {formatMoney(line.lineTotal, order.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {workspace.capabilities.canManageOrders &&
                !['cancelled', 'closed'].includes(order.status) ? (
                  <div className="flex justify-end border-t border-slate-200 px-4 py-3 dark:border-slate-800">
                    <button
                      type="submit"
                      disabled={isBusy}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Package className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Save fulfillment
                    </button>
                  </div>
                ) : null}
              </form>
            </Section>

            {/* Create shipment */}
            {workspace.capabilities.canManageShipping &&
            order.status !== 'cancelled' ? (
              <Section
                title="Create shipment"
                icon={<PackageCheck className="h-4 w-4" />}
                subtitle="Split an order across multiple carrier shipments. Inventory posts when the shipment is dispatched."
              >
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const lines = order.lines
                      .map((line) => ({
                        lineId: line.id,
                        quantity: Number(form.get('ship-' + line.id) || 0),
                      }))
                      .filter((line) => line.quantity > 0);

                    const idempotencyKey =
                      shipmentIdempotencyKey.current?.orderId === order.id
                        ? shipmentIdempotencyKey.current.key
                        : globalThis.crypto?.randomUUID?.() ||
                          'sales-shipment-' +
                            order.id +
                            '-' +
                            Date.now().toString(36) +
                            '-' +
                            Math.random().toString(36).slice(2);

                    shipmentIdempotencyKey.current = {
                      orderId: order.id,
                      key: idempotencyKey,
                    };

                    const result = await run(
                      {
                        action: 'create_shipment',
                        orderId: order.id,
                        idempotencyKey,
                        carrier: form.get('carrier'),
                        serviceLevel: form.get('serviceLevel'),
                        trackingNumber: form.get('trackingNumber'),
                        trackingUrl: form.get('trackingUrl'),
                        lines,
                      },
                      'Shipment created. Mark it dispatched when goods leave Inventory.',
                    );

                    if (result) {
                      shipmentIdempotencyKey.current = null;
                      event.currentTarget.reset();
                    }
                  }}
                >
                  <div className="grid gap-3 p-5 sm:grid-cols-2">
                    <FieldInput name="carrier" label="Carrier" />
                    <FieldInput name="serviceLevel" label="Service level" />
                    <FieldInput name="trackingNumber" label="Tracking number" />
                    <FieldInput name="trackingUrl" label="Tracking URL" />
                  </div>

                  <ul className="divide-y divide-slate-200 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                    {order.lines.map((line) => {
                      const remaining = Math.max(
                        0,
                        line.quantity - line.shippedQuantity - line.plannedQuantity,
                      );
                      return (
                        <li
                          key={line.id}
                          className="flex items-center justify-between gap-3 px-5 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold">
                              {line.description}
                            </p>
                            <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                              Up to {remaining} {line.unit} unassigned
                            </p>
                          </div>
                          <input
                            name={'ship-' + line.id}
                            type="number"
                            min="0"
                            max={remaining}
                            step="0.0001"
                            defaultValue="0"
                            className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-2 text-right text-xs tabular-nums focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
                          />
                        </li>
                      );
                    })}
                  </ul>

                  <div className="flex justify-end border-t border-slate-200 px-4 py-3 dark:border-slate-800">
                    <button
                      type="submit"
                      disabled={isBusy}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                    >
                      Create shipment
                    </button>
                  </div>
                </form>
              </Section>
            ) : null}

            {/* Shipments list */}
            {order.shipments.length > 0 ? (
              <Section
                title="Shipments & tracking"
                icon={<Truck className="h-4 w-4" />}
              >
                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                  {order.shipments.map((shipment) => (
                    <li key={shipment.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-black">
                            {shipment.shipmentNumber}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {[shipment.carrier, shipment.serviceLevel, shipment.trackingNumber]
                              .filter(Boolean)
                              .join(' · ') || 'No tracking details'}
                          </p>
                        </div>
                        <StateChip label="Shipment" value={shipment.status} />
                      </div>

                      {workspace.capabilities.canManageShipping &&
                      !['delivered', 'cancelled'].includes(shipment.status) ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {shipment.status === 'ready' ? (
                            <SmallAction
                              disabled={isBusy}
                              onClick={() =>
                                void run(
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
                            </SmallAction>
                          ) : null}

                          {['ready', 'shipped'].includes(shipment.status) ? (
                            <SmallAction
                              disabled={isBusy}
                              onClick={() =>
                                void run(
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
                            </SmallAction>
                          ) : null}

                          {['ready', 'shipped', 'in_transit'].includes(
                            shipment.status,
                          ) ? (
                            <SmallAction
                              disabled={isBusy}
                              onClick={() =>
                                void run(
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
                            </SmallAction>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {/* Returns */}
            {order.returns.length > 0 ? (
              <Section
                title="Returns, credits & refunds"
                icon={<RotateCcw className="h-4 w-4" />}
              >
                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                  {order.returns.map((item) => (
                    <li key={item.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-black">{item.returnNumber}</p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {item.reason}
                          </p>
                        </div>
                        <StateChip label="Return" value={item.status} />
                      </div>

                      {workspace.capabilities.canManageReturns ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.status === 'requested' ? (
                            <SmallAction
                              disabled={isBusy}
                              onClick={() =>
                                void run(
                                  { action: 'approve_return', returnId: item.id },
                                  'Return approved.',
                                )
                              }
                            >
                              Approve
                            </SmallAction>
                          ) : null}
                          {item.status === 'approved' ? (
                            <SmallAction
                              disabled={isBusy}
                              onClick={() =>
                                void run(
                                  { action: 'receive_return', returnId: item.id },
                                  'Returned stock received and Inventory reversed.',
                                )
                              }
                            >
                              Receive stock
                            </SmallAction>
                          ) : null}
                          {item.status === 'received' ? (
                            <SmallAction
                              disabled={isBusy}
                              onClick={() =>
                                void run(
                                  { action: 'issue_return_credit', returnId: item.id },
                                  'Credit note created for invoiced returned quantities.',
                                )
                              }
                            >
                              Issue credit
                            </SmallAction>
                          ) : null}
                        </div>
                      ) : null}

                      {item.credits.length > 0 ? (
                        <ul className="mt-3 space-y-2">
                          {item.credits.map((credit) => (
                            <li
                              key={credit.id}
                              className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/40 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div>
                                <p className="text-[11px] font-black">
                                  {credit.creditNoteNumber}
                                </p>
                                <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                                  Available refund{' '}
                                  {formatMoney(credit.availableCredit, order.currency)}
                                </p>
                              </div>

                              {workspace.capabilities.canManageReturns &&
                              credit.availableCredit > 0 ? (
                                <SmallAction
                                  disabled={isBusy}
                                  onClick={() =>
                                    void run(
                                      {
                                        action: 'refund_return_credit',
                                        returnCreditId: credit.id,
                                        amount: credit.availableCredit,
                                        method: 'bank',
                                        reason: 'Refund for Sales return',
                                        idempotencyKey:
                                          globalThis.crypto?.randomUUID?.(),
                                      },
                                      'Available customer credit refunded.',
                                    )
                                  }
                                >
                                  Refund
                                </SmallAction>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {/* Create return */}
            {workspace.capabilities.canManageReturns &&
            order.status !== 'cancelled' &&
            order.lines.some((line) => line.deliveredQuantity > 0) ? (
              <Section
                title="Create return"
                icon={<RotateCcw className="h-4 w-4" />}
                subtitle="Receiving the return reverses Inventory; invoice credits are created separately."
              >
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const lines = order.lines
                      .map((line) => ({
                        lineId: line.id,
                        quantity: Number(form.get('return-' + line.id) || 0),
                      }))
                      .filter((line) => line.quantity > 0);

                    const result = await run(
                      {
                        action: 'create_return',
                        orderId: order.id,
                        reason: form.get('returnReason'),
                        lines,
                      },
                      'Return request created.',
                    );
                    if (result) event.currentTarget.reset();
                  }}
                >
                  <div className="px-5 py-4">
                    <label className="block">
                      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        Return reason
                      </span>
                      <textarea
                        name="returnReason"
                        required
                        rows={3}
                        placeholder="Reason for return"
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
                      />
                    </label>
                  </div>

                  <ul className="divide-y divide-slate-200 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                    {order.lines
                      .filter((line) => line.deliveredQuantity > 0)
                      .map((line) => (
                        <li
                          key={line.id}
                          className="flex items-center justify-between gap-3 px-5 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold">
                              {line.description}
                            </p>
                            <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                              Delivered {line.deliveredQuantity} {line.unit}
                            </p>
                          </div>
                          <input
                            name={'return-' + line.id}
                            type="number"
                            min="0"
                            max={line.deliveredQuantity}
                            step="0.0001"
                            defaultValue="0"
                            className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-2 text-right text-xs tabular-nums focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
                          />
                        </li>
                      ))}
                  </ul>

                  <div className="flex justify-end border-t border-slate-200 px-4 py-3 dark:border-slate-800">
                    <button
                      type="submit"
                      disabled={isBusy}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Create return request
                    </button>
                  </div>
                </form>
              </Section>
            ) : null}

            {/* Addresses & notes */}
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoCard title="Billing address" value={order.billingAddress} />
              <InfoCard title="Shipping address" value={order.shippingAddress} />
              <InfoCard title="Notes" value={order.notes} />
              <InfoCard title="Terms" value={order.terms} />
            </div>

            {/* History */}
            <Section title="Order history" icon={<ChevronRight className="h-4 w-4" />}>
              {order.history.length === 0 ? (
                <p className="px-5 py-6 text-xs text-slate-500 dark:text-slate-400">
                  No status history yet.
                </p>
              ) : (
                <ol className="divide-y divide-slate-200 dark:divide-slate-800">
                  {order.history.map((item) => (
                    <li key={item.id} className="flex items-start gap-3 px-5 py-3">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-black">
                          {item.fromStatus ? item.fromStatus + ' → ' : ''}
                          {item.toStatus}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                          {item.createdAt}
                          {item.reason ? ' · ' + item.reason : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </div>

          {/* ------------------------ Right rail ------------------------ */}
          <aside className="space-y-4">
            {/* Summary */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-sm font-black">Order summary</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <SummaryRow label="Subtotal" value={formatMoney(order.subtotal, order.currency)} />
                <SummaryRow label="Discount" value={'− ' + formatMoney(order.discountTotal, order.currency)} />
                <SummaryRow label="Tax" value={formatMoney(order.taxTotal, order.currency)} />
                <SummaryRow label="Shipping" value={formatMoney(order.shippingTotal, order.currency)} />
                <div className="flex items-baseline justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
                  <dt className="text-xs font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                    Total
                  </dt>
                  <dd className="text-lg font-black tabular-nums text-slate-900 dark:text-slate-100">
                    {formatMoney(order.totalAmount, order.currency)}
                  </dd>
                </div>
              </dl>

              {workspace.capabilities.canViewMargin ? (
                <dl className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
                  <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                    Cost &amp; margin
                  </p>
                  <SummaryRow
                    label="Cost total"
                    value={order.costTotal == null ? '—' : formatMoney(order.costTotal, order.currency)}
                  />
                  <SummaryRow
                    label="Margin"
                    value={order.marginAmount == null ? '—' : formatMoney(order.marginAmount, order.currency)}
                  />
                  <SummaryRow
                    label="Margin %"
                    value={order.marginPercent == null ? '—' : order.marginPercent.toFixed(1) + '%'}
                  />
                </dl>
              ) : null}
            </div>

            {/* Deposit */}
            {workspace.capabilities.canManageDeposits ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300">
                    <BadgeDollarSign className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h2 className="text-sm font-black">Customer deposit</h2>
                </div>

                <dl className="mt-3 space-y-2 text-sm">
                  <SummaryRow
                    label="Required"
                    value={formatMoney(order.depositRequiredAmount, order.currency)}
                  />
                  <SummaryRow
                    label="Received"
                    value={formatMoney(order.depositReceivedAmount, order.currency)}
                  />
                  <SummaryRow label="Status" value={order.depositStatus.replaceAll('_', ' ')} />
                </dl>

                {order.depositReceivedAmount <= 0 ? (
                  <>
                    <form
                      className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        await run(
                          {
                            action: 'set_deposit_requirement',
                            orderId: order.id,
                            depositType: form.get('depositType'),
                            depositValue: form.get('depositValue'),
                          },
                          'Deposit requirement updated.',
                        );
                      }}
                    >
                      <label className="block">
                        <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                          Requirement
                        </span>
                        <div className="relative mt-1">
                          <select
                            name="depositType"
                            defaultValue={order.depositType}
                            className="h-9 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-xs font-bold focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
                          >
                            <option value="none">No deposit</option>
                            <option value="percent">Percentage</option>
                            <option value="fixed">Fixed amount</option>
                          </select>
                          <ChevronDown
                            aria-hidden="true"
                            className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                          />
                        </div>
                      </label>
                      <FieldInput
                        name="depositValue"
                        label="Percent or fixed amount"
                        type="number"
                        step="0.01"
                        defaultValue={String(order.depositValue)}
                      />
                      <button
                        type="submit"
                        disabled={isBusy}
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Save deposit requirement
                      </button>
                    </form>

                    {order.depositRequiredAmount > 0 ? (
                      <form
                        className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800"
                        onSubmit={async (event) => {
                          event.preventDefault();
                          const form = new FormData(event.currentTarget);
                          await run(
                            {
                              action: 'record_order_deposit',
                              orderId: order.id,
                              amount: form.get('depositAmount'),
                              method: form.get('depositMethod'),
                              reference: form.get('depositReference'),
                              idempotencyKey: globalThis.crypto?.randomUUID?.(),
                            },
                            'Customer deposit recorded through Invoicing.',
                          );
                        }}
                      >
                        <FieldInput
                          name="depositAmount"
                          label="Amount received"
                          type="number"
                          step="0.01"
                          defaultValue={String(order.depositRequiredAmount)}
                          required
                        />
                        <FieldInput
                          name="depositMethod"
                          label="Payment method"
                          defaultValue="bank"
                          required
                        />
                        <FieldInput name="depositReference" label="Payment reference" />
                        <button
                          type="submit"
                          disabled={isBusy}
                          className="h-9 w-full rounded-xl bg-slate-950 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                        >
                          Record deposit
                        </button>
                      </form>
                    ) : null}
                  </>
                ) : null}

                {order.depositPaymentId &&
                order.invoices.some((item) => Boolean(item.invoiceId)) &&
                order.depositStatus !== 'applied' ? (
                  <form
                    className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      await run(
                        {
                          action: 'apply_order_deposit',
                          orderId: order.id,
                          invoiceId: form.get('depositInvoiceId'),
                          amount: form.get('depositApplyAmount') || undefined,
                        },
                        'Deposit allocated to the selected invoice.',
                      );
                    }}
                  >
                    <p className="text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                      Confirm the invoice in Invoicing first, then apply the
                      customer deposit against its open balance.
                    </p>
                    <div className="relative">
                      <select
                        name="depositInvoiceId"
                        required
                        className="h-9 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-xs font-bold focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
                      >
                        <option value="">Choose invoice</option>
                        {order.invoices
                          .filter((item) => Boolean(item.invoiceId))
                          .map((item) => (
                            <option key={item.batchId} value={item.invoiceId || ''}>
                              {item.sourceReference}
                            </option>
                          ))}
                      </select>
                      <ChevronDown
                        aria-hidden="true"
                        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                      />
                    </div>
                    <FieldInput
                      name="depositApplyAmount"
                      label="Amount to apply (blank = maximum)"
                      type="number"
                      step="0.01"
                    />
                    <button
                      type="submit"
                      disabled={isBusy}
                      className="h-9 w-full rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Apply deposit to invoice
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}

            {/* Invoice creation */}
            {workspace.capabilities.canManageOrders &&
            order.status !== 'cancelled' &&
            order.lines.some((line) => line.invoiceableQuantity > 0) ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                    <Receipt className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h2 className="text-sm font-black">Create invoice</h2>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Choose remaining invoiceable quantities. SaMi prevents
                  duplicate batches and over-invoicing.
                </p>

                <form
                  className="mt-3 space-y-3"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const lines = order.lines
                      .map((line) => ({
                        lineId: line.id,
                        quantity: Number(form.get('invoice-' + line.id) || 0),
                      }))
                      .filter((line) => line.quantity > 0);

                    const idempotencyKey =
                      invoiceIdempotencyKey.current ||
                      globalThis.crypto?.randomUUID?.() ||
                      'sales-invoice-' +
                        order.id +
                        '-' +
                        Date.now().toString(36) +
                        '-' +
                        Math.random().toString(36).slice(2);

                    invoiceIdempotencyKey.current = idempotencyKey;

                    const result = await run(
                      {
                        action: 'create_order_invoice',
                        orderId: order.id,
                        idempotencyKey,
                        exchangeRate:
                          order.currency === workspace.company.currency
                            ? 1
                            : Number(form.get('exchangeRate') || 0),
                        lines,
                      },
                      'Draft invoice created from the sales order.',
                    );

                    if (result) invoiceIdempotencyKey.current = null;
                  }}
                >
                  <ul className="space-y-2">
                    {order.lines
                      .filter((line) => line.invoiceableQuantity > 0)
                      .map((line) => (
                        <li
                          key={line.id}
                          className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                        >
                          <p className="text-[10px] font-black">
                            {line.description}
                          </p>
                          <input
                            name={'invoice-' + line.id}
                            type="number"
                            min={workspace.settings.allowPartialInvoicing ? '0' : String(line.invoiceableQuantity)}
                            max={line.invoiceableQuantity}
                            step="0.0001"
                            defaultValue={line.invoiceableQuantity}
                            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs tabular-nums focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
                          />
                        </li>
                      ))}
                  </ul>

                  {order.currency !== workspace.company.currency ? (
                    <label className="block rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        Exchange rate
                      </span>
                      <input
                        name="exchangeRate"
                        type="number"
                        min="0.00000001"
                        step="0.00000001"
                        required
                        placeholder={
                          '1 ' + order.currency + ' in ' + workspace.company.currency
                        }
                        className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs tabular-nums focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
                      />
                      <span className="mt-1 block text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                        The rate is snapshotted on the invoice and used for
                        accounting postings.
                      </span>
                    </label>
                  ) : null}

                  <button
                    type="submit"
                    disabled={isBusy}
                    className="h-10 w-full rounded-xl bg-slate-950 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                  >
                    Create draft invoice
                  </button>
                </form>
              </div>
            ) : null}

            {/* Invoice batches */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-sm font-black">Invoice batches</h2>
              {order.invoices.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  No invoices created from this order yet.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {order.invoices.map((batch) => (
                    <li
                      key={batch.batchId}
                      className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                    >
                      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        {batch.status}
                      </p>
                      <p className="mt-1 text-xs font-bold">
                        {batch.sourceReference}
                      </p>
                      {batch.invoiceId ? (
                        <Link
                          href={'/apps/invoicing/' + batch.invoiceId}
                          className="mt-1 inline-flex items-center gap-1 text-xs font-black text-indigo-700 hover:underline dark:text-indigo-300"
                        >
                          Open invoice
                          <ChevronRight className="h-3 w-3" aria-hidden="true" />
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Cancel order */}
            {workspace.capabilities.canManageOrders &&
            order.status !== 'cancelled' &&
            order.invoicedPercent === 0 ? (
              <div className="rounded-2xl border border-red-200 bg-white p-5 dark:border-red-900/60 dark:bg-slate-900">
                <h2 className="text-sm font-black text-red-700 dark:text-red-300">
                  Cancel sales order
                </h2>
                <form
                  className="mt-3 space-y-3"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    await run(
                      {
                        action: 'cancel_order',
                        orderId: order.id,
                        reason: form.get('reason'),
                      },
                      'Sales order cancelled.',
                    );
                  }}
                >
                  <textarea
                    name="reason"
                    required
                    rows={3}
                    placeholder="Cancellation reason"
                    className="w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200 dark:border-red-900 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-red-300 bg-red-50 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Cancel order
                  </button>
                </form>
              </div>
            ) : null}
          </aside>
        </div>
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function Kpi({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning';
}) {
  const valueTone =
    tone === 'success'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'warning'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-slate-900 dark:text-slate-100';

  return (
    <div className="min-w-0">
      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className={`mt-1 text-sm font-black capitalize tabular-nums ${valueTone}`}>
        {value.replaceAll('_', ' ')}
      </p>
    </div>
  );
}

function Section({
  title,
  icon,
  subtitle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          {icon}
        </span>
        <div>
          <h2 className="text-sm font-black">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function FieldInput({
  name,
  label,
  type = 'text',
  defaultValue,
  required = false,
  step,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        min={type === 'number' ? '0' : undefined}
        step={type === 'number' ? step ?? '0.01' : undefined}
        className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs tabular-nums focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
      />
    </label>
  );
}

function SmallAction({
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

function StateChip({ label, value }: { label: string; value: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] ring-1 ${statusTone(value)}`}
    >
      <span className="opacity-70">{label}</span>
      <span aria-hidden="true">·</span>
      <span>{value.replaceAll('_', ' ')}</span>
    </span>
  );
}

function InfoCard({
  title,
  value,
}: {
  title: string;
  value: string | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {title}
      </p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">
        {value || '—'}
      </p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="font-bold tabular-nums">{value}</dd>
    </div>
  );
}