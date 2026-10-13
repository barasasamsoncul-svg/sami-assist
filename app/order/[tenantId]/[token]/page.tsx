import {
  notFound,
} from 'next/navigation';

import {
  getPublicSalesOrderPortal,
} from '@/lib/apps/sales/order-portal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Customer order tracking',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

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

function label(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function date(value: string | null) {
  if (!value) return 'Not yet recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not yet recorded' : parsed.toLocaleString();
}

export default async function PublicSalesOrderPage({
  params,
}: {
  params: Promise<{ tenantId: string; token: string }>;
}) {
  const { tenantId, token } = await params;
  const data = await getPublicSalesOrderPortal(tenantId, token).catch(() => null);
  if (!data) notFound();

  const { order, lines, shipments } = data;

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-8 text-slate-950 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">Customer order portal</p>
          <h1 className="mt-2 text-2xl font-black sm:text-3xl">Order {order.orderNumber}</h1>
          <p className="mt-2 text-sm text-slate-300">Prepared for {order.customerName} · {date(order.orderDate)}</p>
          <p className="mt-5 text-3xl font-black">{money(order.totalAmount, order.currency)}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-bold">Order: {label(order.status)}</span>
            <span className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-bold">Fulfillment: {label(order.fulfillmentStatus)}</span>
            <span className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-bold">Invoicing: {label(order.invoiceStatus)}</span>
          </div>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-black">Order items</h2>
          <p className="mt-1 text-sm text-slate-500">Progress is updated by the seller as goods are shipped and delivered.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-3 pr-3">Item</th>
                  <th className="px-3 py-3 text-right">Ordered</th>
                  <th className="px-3 py-3 text-right">Shipped</th>
                  <th className="pl-3 py-3 text-right">Delivered</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={index} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-3">
                      <p className="font-semibold">{line.description}</p>
                      <p className="mt-1 text-xs text-slate-500">{[line.sku, line.unit].filter(Boolean).join(' · ')}</p>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{line.quantity}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{line.shippedQuantity}</td>
                    <td className="pl-3 py-3 text-right tabular-nums">{line.deliveredQuantity}</td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-500">No order lines are available.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-black">Shipment tracking</h2>
          <p className="mt-1 text-sm text-slate-500">Carrier details and tracking are shown when provided by the seller.</p>
          <div className="mt-4 space-y-3">
            {shipments.map(shipment => (
              <article key={shipment.shipmentNumber} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-bold">{shipment.shipmentNumber}</p>
                    <p className="mt-1 text-sm text-slate-600">{[shipment.carrier, shipment.serviceLevel].filter(Boolean).join(' · ') || 'Carrier not specified'}</p>
                  </div>
                  <span className="inline-flex w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{label(shipment.status)}</span>
                </div>
                {shipment.trackingNumber && <p className="mt-2 text-sm">Tracking number: <span className="font-semibold">{shipment.trackingNumber}</span></p>}
                {shipment.trackingUrl && <p className="mt-2 text-sm"><a className="font-bold text-blue-700 underline" href={shipment.trackingUrl} target="_blank" rel="noreferrer">Open carrier tracking</a></p>}
                <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                  <p>Shipped: {date(shipment.shippedAt)}</p>
                  <p>Delivered: {date(shipment.deliveredAt)}</p>
                </div>
              </article>
            ))}
            {shipments.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No shipment has been recorded yet.</p>}
          </div>
        </section>

        <footer className="px-2 text-center text-xs text-slate-500">
          This private link is read-only and expires {date(order.portalExpiresAt)}. Contact the seller if order information needs correction.
        </footer>
      </div>
    </main>
  );
}
