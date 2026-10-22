'use client';

import { useCallback, useEffect, useState, useTransition, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Package, RefreshCw, Search, Truck } from 'lucide-react';
import type { ShippingOverview, ShippingStatus } from '@/lib/apps/shipping/service';

type Section = 'overview' | 'shipments' | 'tracking';
type ApiResponse<T> = { success: boolean; data?: T; error?: string };
const inputClass = 'h-11 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm text-[var(--sami-text)] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15';
const cardClass = 'rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-card)] p-4 shadow-[var(--sami-shadow-sm)]';
const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-4 py-2 text-xs font-semibold text-[var(--sami-text)] disabled:opacity-50';
const nextStatus: Record<ShippingStatus, ShippingStatus[]> = {
  draft: ['ready', 'cancelled'],
  ready: ['in_transit', 'exception', 'cancelled'],
  in_transit: ['delivered', 'exception'],
  delivered: [],
  exception: ['in_transit', 'delivered', 'cancelled'],
  cancelled: [],
};
const milestones = [
  { value: 'carrier_handoff', label: 'Carrier hand-off' },
  { value: 'carrier_scan', label: 'Carrier scan' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivery_attempt', label: 'Delivery attempt' },
  { value: 'delay', label: 'Delay' },
  { value: 'customer_contacted', label: 'Customer contacted' },
  { value: 'label_registered', label: 'Label reference registered' },
];
function pretty(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (v) => v.toUpperCase()); }
function StatusPill({ status }: { status: string }) {
  const tone = status === 'delivered' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : status === 'exception' || status === 'cancelled' ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
    : status === 'in_transit' ? 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300'
    : 'border-[var(--sami-border)] bg-[var(--sami-surface)] text-[var(--sami-muted)]';
  return <span className={'inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ' + tone}>{pretty(status)}</span>;
}
function numberOrNull(value: string) { return value.trim() ? Number(value) : null; }

export default function ShippingOperationsPanel({ initialSection, warehouseAvailable }: { initialSection: Section; warehouseAvailable: boolean }) {
  const [data, setData] = useState<ShippingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedShipmentId, setSelectedShipmentId] = useState('');
  const [shipmentNumber, setShipmentNumber] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [carrierId, setCarrierId] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [sourceReference, setSourceReference] = useState('');
  const [trackingIntent, setTrackingIntent] = useState('manual');
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [contents, setContents] = useState('');
  const [nextState, setNextState] = useState<ShippingStatus | ''>('');
  const [milestoneType, setMilestoneType] = useState('carrier_scan');
  const [milestoneLocation, setMilestoneLocation] = useState('');
  const [milestoneMessage, setMilestoneMessage] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/apps/shipping/operations', { cache: 'no-store', headers: { Accept: 'application/json' } });
      const payload = await response.json() as ApiResponse<ShippingOverview>;
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error || 'Shipping overview could not be loaded.');
      setData(payload.data);
      setError('');
      setSelectedShipmentId((current) => current || payload.data!.shipments[0]?.id || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Shipping overview could not be loaded.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function post<T>(body: Record<string, unknown>): Promise<T> {
    const response = await fetch('/api/apps/shipping/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as ApiResponse<T>;
    if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error || 'Shipping request failed.');
    return payload.data;
  }

  const createShipment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setNotice('');
    const hasParcel = [weight, length, width, height, contents].some((value) => value.trim());
    startTransition(async () => {
      try {
        const result = await post<{ id: string; shipmentNumber: string; packageCount: number }>({
          action: 'create',
          shipmentNumber,
          recipientName,
          recipientAddress: { line1: addressLine1, city, region, postalCode, country },
          carrierId: carrierId || null,
          trackingNumber,
          sourceReference,
          trackingIntent,
          packages: hasParcel ? [{
            weight: numberOrNull(weight), length: numberOrNull(length), width: numberOrNull(width),
            height: numberOrNull(height), contents,
          }] : [],
        });
        setNotice('Shipment ' + result.shipmentNumber + ' created with ' + result.packageCount + ' parcel(s). Carrier booking and label purchase remain an explicit external-provider action.');
        setShipmentNumber(''); setRecipientName(''); setAddressLine1(''); setCity(''); setRegion('');
        setPostalCode(''); setCountry(''); setCarrierId(''); setTrackingNumber(''); setSourceReference('');
        setWeight(''); setLength(''); setWidth(''); setHeight(''); setContents('');
        setSelectedShipmentId(result.id);
        await refresh();
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'Shipment could not be created.'); }
    });
  };

  const updateStatus = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedShipmentId || !nextState) return;
    setError(''); setNotice('');
    startTransition(async () => {
      try {
        const result = await post<{ shipmentNumber: string; status: ShippingStatus }>({
          action: 'transition', shipmentId: selectedShipmentId, status: nextState, location: milestoneLocation, message: milestoneMessage,
        });
        setNotice(result.shipmentNumber + ' moved to ' + pretty(result.status) + '. A shipment milestone was recorded.');
        setNextState(''); setMilestoneLocation(''); setMilestoneMessage('');
        await refresh();
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'Shipment status could not be updated.'); }
    });
  };

  const addMilestone = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedShipmentId) return;
    setError(''); setNotice('');
    startTransition(async () => {
      try {
        await post({ action: 'milestone', shipmentId: selectedShipmentId, eventType: milestoneType, location: milestoneLocation, message: milestoneMessage });
        setNotice('Tracking milestone recorded.');
        setMilestoneLocation(''); setMilestoneMessage('');
        await refresh();
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'Milestone could not be recorded.'); }
    });
  };

  const filtered = (data?.shipments || []).filter((shipment) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [shipment.shipmentNumber, shipment.recipientName || '', shipment.city || '', shipment.country || '', shipment.trackingNumber || '', shipment.carrierName || '', shipment.sourceReference || ''].some((value) => value.toLowerCase().includes(query));
    return matchesSearch && (statusFilter === 'all' || shipment.status === statusFilter);
  });
  const selected = data?.shipments.find((shipment) => shipment.id === selectedShipmentId) || null;

  return (
    <div className="space-y-5 text-[var(--sami-text)]" data-shipping-workspace="specialist">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--sami-muted)]">Fulfillment operations</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{initialSection === 'tracking' ? 'Delivery tracking' : initialSection === 'shipments' ? 'Shipment desk' : 'Shipping command center'}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--sami-muted)]">Prepare shipment records, capture parcel details, maintain tracking milestones and control delivery status by company.</p>
        </div>
        <button type="button" className={buttonClass} onClick={() => void refresh()} disabled={loading || busy}><RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} /> Refresh</button>
      </header>

      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-sm leading-6">
        <strong>Carrier boundary:</strong> SaMi records shipments and tracking events. It does not book a carrier, purchase a label or change inventory automatically. Carrier API credentials and label-purchase integrations must be configured separately.
      </div>
      {error ? <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</div> : null}
      {notice ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">{notice}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Total shipments', value: data?.summary.totalShipments ?? 0, detail: 'Company shipment register', icon: Package },
          { label: 'In transit', value: data?.summary.inTransitShipments ?? 0, detail: 'Carrier hand-off recorded', icon: Truck },
          { label: 'Delivery exceptions', value: data?.summary.exceptions ?? 0, detail: 'Needs fulfillment follow-up', icon: AlertTriangle },
          { label: 'Active carriers', value: data?.summary.activeCarriers ?? 0, detail: 'Available for shipment records', icon: CheckCircle2 },
          { label: 'Label records', value: data?.summary.activeLabels ?? 0, detail: 'Externally generated label references', icon: Package },
        ].map((item) => <article key={item.label} className={cardClass}><div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-[var(--sami-muted)]">{item.label}</p><item.icon className="h-4 w-4 text-[var(--sami-muted)]" /></div><p className="mt-2 text-2xl font-semibold tabular-nums">{loading ? '—' : item.value.toLocaleString()}</p><p className="mt-1 text-[11px] text-[var(--sami-muted)]">{item.detail}</p></article>)}
      </section>

      {initialSection !== 'tracking' ? <section className={cardClass}>
        <div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-300"><Package className="h-5 w-5" /></div><div><h2 className="text-base font-semibold">Prepare a shipment</h2><p className="mt-1 text-xs leading-5 text-[var(--sami-muted)]">Create the operational shipment record, recipient, carrier reference and optional parcel dimensions.</p></div></div>
        <form className="mt-5 space-y-4" onSubmit={createShipment}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="block text-xs font-semibold">Shipment number (optional)<input className={inputClass + ' mt-2'} value={shipmentNumber} onChange={(e) => setShipmentNumber(e.target.value)} maxLength={100} placeholder="Generated if empty" /></label>
            <label className="block text-xs font-semibold">Recipient name<input className={inputClass + ' mt-2'} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} maxLength={255} required /></label>
            <label className="block text-xs font-semibold">Carrier (optional)<select className={inputClass + ' mt-2'} value={carrierId} onChange={(e) => setCarrierId(e.target.value)}><option value="">Not assigned</option>{(data?.carriers || []).map((carrier) => <option key={carrier.id} value={carrier.id}>{carrier.name}</option>)}</select></label>
            <label className="block text-xs font-semibold">Tracking number (optional)<input className={inputClass + ' mt-2'} value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} maxLength={255} /></label>
          </div>
          <div><p className="mb-2 text-xs font-semibold">Recipient address</p><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="block text-xs">Address line 1<input className={inputClass + ' mt-2'} value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} maxLength={255} required /></label>
            <label className="block text-xs">City / town<input className={inputClass + ' mt-2'} value={city} onChange={(e) => setCity(e.target.value)} maxLength={120} required /></label>
            <label className="block text-xs">Country<input className={inputClass + ' mt-2'} value={country} onChange={(e) => setCountry(e.target.value)} maxLength={120} required /></label>
            <label className="block text-xs">Region / county<input className={inputClass + ' mt-2'} value={region} onChange={(e) => setRegion(e.target.value)} maxLength={120} /></label>
            <label className="block text-xs">Postal code<input className={inputClass + ' mt-2'} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} maxLength={32} /></label>
            <label className="block text-xs">Source reference (optional)<input className={inputClass + ' mt-2'} value={sourceReference} onChange={(e) => setSourceReference(e.target.value)} maxLength={128} placeholder="Sales order / warehouse ref" /></label>
            <label className="block text-xs">Origin workspace<select className={inputClass + ' mt-2'} value={trackingIntent} onChange={(e) => setTrackingIntent(e.target.value)}><option value="manual">Manual shipment</option><option value="sales">Sales order reference</option>{warehouseAvailable ? <option value="warehouse">Warehouse package hand-off</option> : null}<option value="ecommerce">E-commerce order reference</option></select></label>
          </div></div>
          <div><p className="mb-2 text-xs font-semibold">Parcel details (optional)</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="block text-xs">Weight<input type="number" min="0" step="0.001" className={inputClass + ' mt-2'} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Weight in configured unit" /></label>
            <label className="block text-xs">Length<input type="number" min="0" step="0.1" className={inputClass + ' mt-2'} value={length} onChange={(e) => setLength(e.target.value)} /></label>
            <label className="block text-xs">Width<input type="number" min="0" step="0.1" className={inputClass + ' mt-2'} value={width} onChange={(e) => setWidth(e.target.value)} /></label>
            <label className="block text-xs">Height<input type="number" min="0" step="0.1" className={inputClass + ' mt-2'} value={height} onChange={(e) => setHeight(e.target.value)} /></label>
            <label className="block text-xs">Contents / package note<input className={inputClass + ' mt-2'} value={contents} onChange={(e) => setContents(e.target.value)} maxLength={500} /></label>
          </div></div>
          <div className="flex justify-end"><button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !recipientName.trim() || !addressLine1.trim() || !city.trim() || !country.trim()}>{busy ? <Clock3 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />} Create shipment</button></div>
        </form>
      </section> : null}

      {initialSection !== 'tracking' ? <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Shipment register</h2><p className="mt-1 text-xs text-[var(--sami-muted)]">Latest 50 shipments; select a row to manage its delivery state.</p></div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sami-muted)]" /><input className={inputClass + ' pl-9 sm:w-64'} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search shipment, recipient…" /></label>
            <select className={inputClass + ' sm:w-44'} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All statuses</option>{['draft','ready','in_transit','delivered','exception','cancelled'].map((value) => <option key={value} value={value}>{pretty(value)}</option>)}</select>
          </div></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[920px] border-collapse text-left text-sm"><thead><tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-wide text-[var(--sami-muted)]"><th className="px-3 py-3">Shipment</th><th className="px-3 py-3">Recipient</th><th className="px-3 py-3">Carrier / tracking</th><th className="px-3 py-3">Parcels</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Created</th><th className="px-3 py-3">Action</th></tr></thead><tbody>
          {filtered.map((shipment) => <tr key={shipment.id} className={'border-b border-[var(--sami-border)]/70 last:border-0 ' + (selectedShipmentId === shipment.id ? 'bg-blue-500/[0.05]' : '')}>
            <td className="px-3 py-3"><div className="font-mono text-xs font-semibold">{shipment.shipmentNumber}</div><div className="mt-1 text-[11px] text-[var(--sami-muted)]">{shipment.sourceReference || 'No source reference'}</div></td>
            <td className="px-3 py-3"><div className="font-medium">{shipment.recipientName || '—'}</div><div className="mt-1 text-xs text-[var(--sami-muted)]">{[shipment.city, shipment.country].filter(Boolean).join(', ') || 'No destination'}</div></td>
            <td className="px-3 py-3"><div>{shipment.carrierName || 'Unassigned'}</div>{shipment.trackingNumber ? <div className="mt-1 font-mono text-[11px] text-[var(--sami-muted)]">{shipment.trackingUrl ? <a href={shipment.trackingUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">{shipment.trackingNumber}</a> : shipment.trackingNumber}</div> : <div className="mt-1 text-[11px] text-[var(--sami-muted)]">Tracking pending</div>}</td>
            <td className="px-3 py-3 tabular-nums">{shipment.packageCount}</td><td className="px-3 py-3"><StatusPill status={shipment.status} /></td>
            <td className="whitespace-nowrap px-3 py-3 text-xs text-[var(--sami-muted)]">{new Date(shipment.createdAt).toLocaleDateString()}</td>
            <td className="px-3 py-3"><button type="button" className={buttonClass} onClick={() => { setSelectedShipmentId(shipment.id); setNextState(''); }}>Manage</button></td>
          </tr>)}
          {!loading && filtered.length === 0 ? <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-[var(--sami-muted)]">No shipments match this filter.</td></tr> : null}
        </tbody></table></div>
      </section> : null}

      {initialSection !== 'tracking' && selected ? <section className="grid gap-4 xl:grid-cols-2">
        <div className={cardClass}><h2 className="text-base font-semibold">Update shipment status</h2><p className="mt-1 text-xs text-[var(--sami-muted)]">Selected: {selected.shipmentNumber} · {pretty(selected.status)}</p>
          <form className="mt-4 space-y-3" onSubmit={updateStatus}>
            <label className="block text-xs font-semibold">Next status<select className={inputClass + ' mt-2'} value={nextState} onChange={(e) => setNextState(e.target.value as ShippingStatus | '')} required><option value="">Choose an allowed next step</option>{nextStatus[selected.status].map((value) => <option key={value} value={value}>{pretty(value)}</option>)}</select></label>
            <label className="block text-xs font-semibold">Milestone location (optional)<input className={inputClass + ' mt-2'} value={milestoneLocation} onChange={(e) => setMilestoneLocation(e.target.value)} maxLength={255} /></label>
            <label className="block text-xs font-semibold">Status note (optional)<textarea className="mt-2 min-h-20 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-3 text-sm text-[var(--sami-text)] outline-none focus:border-blue-500" value={milestoneMessage} onChange={(e) => setMilestoneMessage(e.target.value)} maxLength={1000} /></label>
            <button type="submit" className={buttonClass} disabled={busy || !nextState}><CheckCircle2 className="h-4 w-4" /> Apply status transition</button>
          </form>
        </div>
        <div className={cardClass}><h2 className="text-base font-semibold">Record a carrier milestone</h2><p className="mt-1 text-xs text-[var(--sami-muted)]">Add a scan/update without silently changing the shipment status.</p>
          <form className="mt-4 space-y-3" onSubmit={addMilestone}>
            <label className="block text-xs font-semibold">Milestone<select className={inputClass + ' mt-2'} value={milestoneType} onChange={(e) => setMilestoneType(e.target.value)}>{milestones.map((value) => <option key={value.value} value={value.value}>{value.label}</option>)}</select></label>
            <label className="block text-xs font-semibold">Location (optional)<input className={inputClass + ' mt-2'} value={milestoneLocation} onChange={(e) => setMilestoneLocation(e.target.value)} maxLength={255} /></label>
            <label className="block text-xs font-semibold">Event note<input className={inputClass + ' mt-2'} value={milestoneMessage} onChange={(e) => setMilestoneMessage(e.target.value)} maxLength={1000} placeholder="Carrier scan received at depot…" /></label>
            <button type="submit" className={buttonClass} disabled={busy}><Clock3 className="h-4 w-4" /> Record milestone</button>
          </form>
        </div>
      </section> : null}

      <section className={cardClass}>
        <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-[var(--sami-muted)]" /><h2 className="text-base font-semibold">{initialSection === 'tracking' ? 'Tracking timeline' : 'Latest delivery milestones'}</h2></div>
        <div className="mt-4 space-y-0">
          {(data?.recentEvents || []).map((event, index) => <article key={event.id} className="relative grid grid-cols-[18px_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
            <div className="flex h-full flex-col items-center"><span className={'mt-1.5 h-2.5 w-2.5 rounded-full ' + (event.eventType === 'status_delivered' ? 'bg-emerald-500' : event.eventType === 'status_exception' ? 'bg-rose-500' : 'bg-blue-500')} />{index < (data?.recentEvents.length || 0) - 1 ? <span className="mt-1 w-px flex-1 bg-[var(--sami-border)]" /> : null}</div>
            <div className="min-w-0"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{pretty(event.eventType)} <span className="font-normal text-[var(--sami-muted)]">· {event.shipmentNumber}</span></p><time className="text-[10px] text-[var(--sami-muted)]">{new Date(event.occurredAt).toLocaleString()}</time></div>{event.message ? <p className="mt-1 text-sm leading-5 text-[var(--sami-muted)]">{event.message}</p> : null}{event.location ? <p className="mt-1 text-[11px] text-[var(--sami-muted)]">{event.location}</p> : null}</div>
          </article>)}
          {!loading && (data?.recentEvents || []).length === 0 ? <p className="py-8 text-center text-sm text-[var(--sami-muted)]">No delivery milestones recorded yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
