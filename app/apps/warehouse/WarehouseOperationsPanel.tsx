'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  LoaderCircle,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  ScanLine,
  Truck,
  Warehouse as WarehouseIcon,
  XCircle,
} from 'lucide-react';

import type { WarehouseWorkspaceOverview } from '@/lib/apps/warehouse/service';

type WarehouseSection = 'overview' | 'locations' | 'operations' | 'putaway' | 'picking' | 'packages';

type ApiResponse<T> = { success: boolean; data?: T; error?: string; code?: string };

type Props = { initialSection?: WarehouseSection };

const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 py-2 text-xs font-semibold text-[var(--sami-text)] transition hover:border-blue-400/60 hover:bg-blue-500/5 disabled:cursor-not-allowed disabled:opacity-50';
const inputClass = 'h-10 w-full rounded-lg border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm text-[var(--sami-text)] outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15';
const panelClass = 'rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-card)] shadow-[var(--sami-shadow-sm)]';
const mutedClass = 'text-xs text-[var(--sami-muted)]';

function humanize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatusPill({ status }: { status: string }) {
  const success = ['completed', 'delivered', 'packed', 'ready'].includes(status);
  const warning = ['active', 'in_progress', 'open', 'draft', 'in_transit'].includes(status);
  return (
    <span className={[
      'inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide',
      success ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        : warning ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : 'border-[var(--sami-border)] bg-[var(--sami-surface)] text-[var(--sami-muted)]',
    ].join(' ')}>
      {status === 'active' ? 'Planned' : humanize(status)}
    </span>
  );
}

function MetricCard({ label, value, hint, icon: Icon }: {
  label: string; value: number; hint: string; icon: typeof Boxes;
}) {
  return (
    <div className={panelClass + ' p-4'}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-[var(--sami-muted)]">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-300">
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-black tracking-tight text-[var(--sami-text)]">{value.toLocaleString()}</p>
      <p className={mutedClass + ' mt-1'}>{hint}</p>
    </div>
  );
}

function SectionHeading({ kicker, title, description, action }: {
  kicker: string; title: string; description: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">{kicker}</p>
        <h2 className="mt-1 text-xl font-black tracking-tight text-[var(--sami-text)]">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--sami-muted)]">{description}</p>
      </div>
      {action}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-xs font-semibold text-[var(--sami-muted)]">{label}</span>{children}</label>;
}

export default function WarehouseOperationsPanel({ initialSection = 'overview' }: Props) {
  const [activeSection, setActiveSection] = useState<WarehouseSection>(initialSection);
  const [data, setData] = useState<WarehouseWorkspaceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, startTransition] = useTransition();
  const [locationName, setLocationName] = useState('');
  const [locationCode, setLocationCode] = useState('');
  const [locationType, setLocationType] = useState('storage');
  const [parentLocationId, setParentLocationId] = useState('');
  const [operationType, setOperationType] = useState('putaway');
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [productReference, setProductReference] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [operationReference, setOperationReference] = useState('');
  const [putawaySource, setPutawaySource] = useState('');
  const [putawayDestination, setPutawayDestination] = useState('');
  const [putawayProduct, setPutawayProduct] = useState('');
  const [putawayPriority, setPutawayPriority] = useState('100');
  const [batchAssignedUser, setBatchAssignedUser] = useState('');
  const [batchScheduledAt, setBatchScheduledAt] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedPickOperationId, setSelectedPickOperationId] = useState('');
  const [packageNumber, setPackageNumber] = useState('');
  const [packageWeight, setPackageWeight] = useState('0');
  const [packageLocationId, setPackageLocationId] = useState('');
  const [search, setSearch] = useState('');

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch('/api/apps/warehouse/operations', {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json() as ApiResponse<WarehouseWorkspaceOverview>;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'Warehouse data could not be loaded.');
      }
      setData(payload.data);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Warehouse data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const submitAction = useCallback((action: string, values: Record<string, unknown> = {}) => {
    setNotice('');
    setError('');
    startTransition(async () => {
      try {
        const response = await fetch('/api/apps/warehouse/operations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ action, ...values }),
        });
        const payload = await response.json() as ApiResponse<unknown>;
        if (!response.ok || !payload.success) throw new Error(payload.error || 'Warehouse action failed.');
        setNotice('Warehouse update saved.');
        await refresh(true);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Warehouse action failed.');
      }
    });
  }, [refresh]);

  const locations = data?.locations || [];
  const pickOperations = useMemo(
    () => (data?.operations || []).filter((operation) => operation.operationType === 'pick' && !['completed', 'cancelled'].includes(operation.status)),
    [data?.operations],
  );
  const filteredOperations = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.operations || []).filter((operation) => !term || [
      operation.operationType, operation.status, operation.reference, operation.sourceName,
      operation.destinationName, operation.operationNumber,
    ].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [data?.operations, search]);

  useEffect(() => {
    if (locations.length) {
      setSourceLocationId((current) => current || locations[0].id);
      setDestinationLocationId((current) => current || locations.find((location) => location.id !== locations[0]?.id)?.id || '');
      setPackageLocationId((current) => current || locations[0].id);
      setPutawayDestination((current) => current || locations.find((location) => location.status === 'active')?.id || '');
      setPutawaySource((current) => current || locations.find((location) => location.status === 'active')?.id || '');
      setParentLocationId((current) => current || '');
    }
    if (data?.products.length) setProductReference((current) => current || data.products[0].id);
  }, [locations, data?.products]);

  const locationOptions = (includeBlank = false) => (
    <>
      {includeBlank ? <option value="">No location selected</option> : null}
      {locations.filter((location) => location.status === 'active').map((location) => (
        <option key={location.id} value={location.id}>{location.code} · {location.name}</option>
      ))}
    </>
  );

  return (
    <div className="min-w-0 space-y-6" data-warehouse-operations>
      <section className={panelClass + ' overflow-hidden'}>
        <div className="flex flex-col gap-4 border-b border-[var(--sami-border)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
              <WarehouseIcon size={24} aria-hidden="true" />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">Supply chain execution</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-[var(--sami-text)]">Warehouse control</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--sami-muted)]">Manage bins, put-away, internal movements, picking waves and packages against the active company’s Inventory records.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={buttonClass} onClick={() => void refresh()} disabled={loading || busy}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Refresh
            </button>
            <button type="button" className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50" onClick={() => document.getElementById('warehouse-new-location')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
              <Plus size={14} aria-hidden="true" /> Add location
            </button>
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto px-4 pt-3 sm:px-6">
          {([
            ['overview', 'Overview', Boxes],
            ['locations', 'Locations', MapPin],
            ['operations', 'Operations', ArrowLeftRight],
            ['putaway', 'Put-away rules', ArrowDownToLine],
            ['picking', 'Picking waves', ClipboardList],
            ['packages', 'Packages', Package],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} type="button" onClick={() => setActiveSection(key)} className={[
              'inline-flex min-h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-xs font-bold transition',
              activeSection === key ? 'border-blue-600 text-blue-700 dark:text-blue-300' : 'border-transparent text-[var(--sami-muted)] hover:text-[var(--sami-text)]',
            ].join(' ')}>
              <Icon size={14} aria-hidden="true" />{label}
            </button>
          ))}
        </div>
      </section>

      {notice ? <div role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{notice}</div> : null}
      {error ? <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"><XCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" /><span>{error}</span></div> : null}

      {loading && !data ? (
        <div className={panelClass + ' flex min-h-52 items-center justify-center gap-3 p-8 text-sm text-[var(--sami-muted)]'}><LoaderCircle className="animate-spin" size={20} /> Loading live warehouse records…</div>
      ) : null}

      {activeSection === 'overview' ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Active locations" value={data?.summary.activeLocations || 0} hint="Bins and zones" icon={MapPin} />
            <MetricCard label="Open operations" value={data?.summary.openOperations || 0} hint="Waiting or underway" icon={ArrowLeftRight} />
            <MetricCard label="Active pick waves" value={data?.summary.activePickingBatches || 0} hint="Released or in progress" icon={ClipboardList} />
            <MetricCard label="Open packages" value={data?.summary.openPackages || 0} hint="Pack, dispatch or deliver" icon={Package} />
            <MetricCard label="Put-away rules" value={data?.summary.activePutawayRules || 0} hint="Active location guidance" icon={ArrowDownToLine} />
          </div>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.8fr)]">
            <div className={panelClass + ' p-5 sm:p-6'}>
              <SectionHeading kicker="Operational queue" title="Recent warehouse work" description="Start and complete the location-level operations here. Stock totals remain authoritative in Inventory." action={<button className={buttonClass} onClick={() => setActiveSection('operations')}>View operations</button>} />
              <div className="mt-5 space-y-3">
                {(data?.operations || []).slice(0, 5).map((operation) => (
                  <div key={operation.id} className="flex flex-col gap-3 rounded-xl border border-[var(--sami-border)] p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-black text-[var(--sami-text)]">{humanize(operation.operationType)}</span><StatusPill status={operation.status} /></div>
                      <p className="mt-1 truncate text-sm font-semibold text-[var(--sami-text)]">{operation.sourceName || 'Inbound'} <span className="text-[var(--sami-muted)]">→</span> {operation.destinationName || 'Outbound'}</p>
                      <p className={mutedClass + ' mt-1'}>{operation.reference || 'No reference'} · {operation.lineCount} line{operation.lineCount === 1 ? '' : 's'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {operation.status === 'active' ? <button className={buttonClass} disabled={busy} onClick={() => submitAction('start-operation', { operationId: operation.id })}>Start</button> : null}
                      {operation.status === 'in_progress' ? <button className={buttonClass} disabled={busy} onClick={() => submitAction('complete-operation', { operationId: operation.id })}>Complete</button> : null}
                    </div>
                  </div>
                ))}
                {!data?.operations.length ? <div className="rounded-xl border border-dashed border-[var(--sami-border)] px-4 py-9 text-center"><ArrowLeftRight className="mx-auto text-[var(--sami-muted)]" size={24} /><p className="mt-2 text-sm font-bold text-[var(--sami-text)]">No operations recorded</p><p className={mutedClass + ' mt-1'}>Create the first put-away, relocation or pick task to begin.</p></div> : null}
              </div>
            </div>
            <div className={panelClass + ' p-5 sm:p-6'}>
              <SectionHeading kicker="Daily readiness" title="Warehouse footprint" description="A quick view of active storage points." />
              <div className="mt-5 space-y-3">
                {(data?.locations || []).slice(0, 6).map((location) => (
                  <div key={location.id} className="flex items-center justify-between gap-3 border-b border-[var(--sami-border)] pb-3 last:border-0 last:pb-0">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sami-surface)] text-[var(--sami-muted)]"><MapPin size={16} /></span>
                      <div className="min-w-0"><p className="truncate text-sm font-bold text-[var(--sami-text)]">{location.name}</p><p className={mutedClass}>{location.code} · {humanize(location.locationType)}</p></div>
                    </div>
                    <StatusPill status={location.status} />
                  </div>
                ))}
                {!data?.locations.length ? <p className={mutedClass}>Add the first bin or zone to start setting up Warehouse.</p> : null}
              </div>
              <button className={buttonClass + ' mt-5 w-full'} onClick={() => setActiveSection('locations')}>Manage locations</button>
            </div>
          </div>
        </>
      ) : null}

      {activeSection === 'locations' ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
          <section className={panelClass + ' p-5 sm:p-6'}>
            <SectionHeading kicker="Storage map" title="Locations and bins" description="Organize receiving, quality, bulk storage, picking and packing locations in a parent-child hierarchy." />
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[580px] text-left text-sm">
                <thead><tr className="border-b border-[var(--sami-border)] text-[10px] font-black uppercase tracking-wider text-[var(--sami-muted)]"><th className="pb-3 pr-3">Location</th><th className="pb-3 pr-3">Type</th><th className="pb-3 pr-3">Parent</th><th className="pb-3">Status</th></tr></thead>
                <tbody>{(data?.locations || []).map((location) => <tr key={location.id} className="border-b border-[var(--sami-border)] last:border-0"><td className="py-3 pr-3"><p className="font-bold text-[var(--sami-text)]">{location.name}</p><p className={mutedClass}>{location.code}</p></td><td className="py-3 pr-3 text-[var(--sami-muted)]">{humanize(location.locationType)}</td><td className="py-3 pr-3 text-[var(--sami-muted)]">{location.parentName || 'Top level'}</td><td className="py-3"><StatusPill status={location.status} /></td></tr>)}</tbody>
              </table>
              {!data?.locations.length ? <p className={mutedClass + ' py-8 text-center'}>No warehouse locations yet.</p> : null}
            </div>
          </section>
          <section id="warehouse-new-location" className={panelClass + ' p-5 sm:p-6'}>
            <SectionHeading kicker="Storage setup" title="Add a location" description="Location codes must be unique within the active company." />
            <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); submitAction('create-location', { name: locationName, code: locationCode, locationType, parentLocationId: parentLocationId || null }); if (!busy) { setLocationName(''); setLocationCode(''); } }}>
              <Field label="Location name"><input className={inputClass} required maxLength={200} value={locationName} onChange={(event) => setLocationName(event.target.value)} placeholder="e.g. Aisle 01 · Rack B" /></Field>
              <Field label="Location code"><input className={inputClass} required maxLength={80} value={locationCode} onChange={(event) => setLocationCode(event.target.value)} placeholder="e.g. A01-RB" /></Field>
              <Field label="Location type"><select className={inputClass} value={locationType} onChange={(event) => setLocationType(event.target.value)}>{['receiving','quality','storage','picking','packing','output','internal','virtual'].map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select></Field>
              <Field label="Parent location (optional)"><select className={inputClass} value={parentLocationId} onChange={(event) => setParentLocationId(event.target.value)}><option value="">Top-level location</option>{locationOptions()}</select></Field>
              <button disabled={busy || !locationName.trim() || !locationCode.trim()} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"><Plus size={15} /> Create location</button>
            </form>
          </section>
        </div>
      ) : null}

      {activeSection === 'operations' ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.8fr)]">
          <section className={panelClass + ' p-5 sm:p-6'}>
            <SectionHeading kicker="Execution queue" title="Warehouse operations" description="Plan a move between bins, receive to a staging location, or create a pick task. Every line must reference an active product in this company." />
            <div className="mt-5"><label className="relative block"><ScanLine className="absolute left-3 top-3 text-[var(--sami-muted)]" size={15} /><input className={inputClass + ' pl-9'} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search operation, location or reference" /></label></div>
            <div className="mt-4 space-y-3">{filteredOperations.map((operation) => <div key={operation.id} className="rounded-xl border border-[var(--sami-border)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-black text-[var(--sami-text)]">{humanize(operation.operationType)}</p><StatusPill status={operation.status} /></div><span className={mutedClass}>{operation.lineCount} line{operation.lineCount === 1 ? '' : 's'}</span></div><p className="mt-2 text-sm font-semibold text-[var(--sami-text)]">{operation.sourceName || 'Inbound'} <span className="mx-1 text-[var(--sami-muted)]">→</span> {operation.destinationName || 'Outbound'}</p><p className={mutedClass + ' mt-1'}>{operation.reference || 'No reference'} · {new Date(operation.createdAt).toLocaleString()}</p><div className="mt-3 flex flex-wrap gap-2">{operation.status === 'active' ? <button className={buttonClass} disabled={busy} onClick={() => submitAction('start-operation', { operationId: operation.id })}>Start work</button> : null}{operation.status === 'in_progress' ? <button className={buttonClass} disabled={busy} onClick={() => submitAction('complete-operation', { operationId: operation.id })}><CheckCircle2 size={14} /> Mark complete</button> : null}{['active','in_progress'].includes(operation.status) ? <button className={buttonClass} disabled={busy} onClick={() => submitAction('cancel-operation', { operationId: operation.id })}>Cancel</button> : null}</div></div>)}</div>
          </section>
          <section className={panelClass + ' p-5 sm:p-6'}>
            <SectionHeading kicker="New work" title="Create operation" description="A warehouse operation tracks location-level work. Inventory quantities remain controlled by Inventory workflows." />
            <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); submitAction('create-operation', { operationType, sourceLocationId: sourceLocationId || null, destinationLocationId: destinationLocationId || null, reference: operationReference || null, lines: [{ productReference, quantity }] }); }}>
              <Field label="Operation type"><select className={inputClass} value={operationType} onChange={(event) => setOperationType(event.target.value)}>{['putaway','relocate','pick','receive','replenish','pack','count'].map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select></Field>
              <Field label="From location"><select className={inputClass} value={sourceLocationId} onChange={(event) => setSourceLocationId(event.target.value)}><option value="">Not applicable / inbound</option>{locationOptions()}</select></Field>
              <Field label="To location"><select className={inputClass} value={destinationLocationId} onChange={(event) => setDestinationLocationId(event.target.value)}><option value="">Not applicable / outbound</option>{locationOptions()}</select></Field>
              <Field label="Product"><select className={inputClass} value={productReference} onChange={(event) => setProductReference(event.target.value)} required><option value="">Choose product</option>{(data?.products || []).map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ' · ' + product.sku : ''}</option>)}</select></Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Quantity"><input className={inputClass} required min="0.0001" step="0.0001" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></Field><Field label="Reference (optional)"><input className={inputClass} maxLength={255} value={operationReference} onChange={(event) => setOperationReference(event.target.value)} placeholder="PO, SO or move ref" /></Field></div>
              <button disabled={busy || !productReference || (!sourceLocationId && !destinationLocationId)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"><Plus size={15} /> Create operation</button>
            </form>
          </section>
        </div>
      ) : null}

      {activeSection === 'putaway' ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <section className={panelClass + ' p-5 sm:p-6'}>
            <SectionHeading kicker="Placement policy" title="Put-away rules" description="Prioritize destination bins by product or source area to standardize how stock is stored." />
            <div className="mt-5 space-y-3">{(data?.putawayRules || []).map((rule) => <div key={rule.id} className="flex flex-col gap-3 rounded-xl border border-[var(--sami-border)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-black text-[var(--sami-text)]">{rule.productName || 'All products'}</p><StatusPill status={rule.status} /></div><p className="mt-1 text-sm text-[var(--sami-muted)]">{rule.sourceName || 'Any source'} <span className="mx-1">→</span> {rule.destinationName}</p></div><span className={mutedClass}>Priority {rule.priority}</span></div>)}{!data?.putawayRules.length ? <p className={mutedClass + ' py-6'}>No put-away rules are configured. Add one to give operators a consistent destination recommendation.</p> : null}</div>
          </section>
          <section className={panelClass + ' p-5 sm:p-6'}>
            <SectionHeading kicker="Rule configuration" title="Add a put-away rule" description="Lower priority values are applied first." />
            <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); submitAction('create-putaway-rule', { sourceLocationId: putawaySource || null, destinationLocationId: putawayDestination, productReference: putawayProduct || null, priority: putawayPriority }); }}>
              <Field label="Product (optional)"><select className={inputClass} value={putawayProduct} onChange={(event) => setPutawayProduct(event.target.value)}><option value="">All products</option>{(data?.products || []).map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ' · ' + product.sku : ''}</option>)}</select></Field>
              <Field label="Source location (optional)"><select className={inputClass} value={putawaySource} onChange={(event) => setPutawaySource(event.target.value)}><option value="">Any source</option>{locationOptions()}</select></Field>
              <Field label="Destination location"><select className={inputClass} required value={putawayDestination} onChange={(event) => setPutawayDestination(event.target.value)}><option value="">Choose destination</option>{locationOptions()}</select></Field>
              <Field label="Priority (lower runs first)"><input className={inputClass} type="number" min="0" max="1000000" step="1" value={putawayPriority} onChange={(event) => setPutawayPriority(event.target.value)} /></Field>
              <button disabled={busy || !putawayDestination} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"><Plus size={15} /> Save rule</button>
            </form>
          </section>
        </div>
      ) : null}

      {activeSection === 'picking' ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <section className={panelClass + ' p-5 sm:p-6'}>
            <SectionHeading kicker="Wave planning" title="Picking batches" description="Bundle pick operations into waves, release the batch, start execution and close only after every linked operation is complete." />
            <div className="mt-5 space-y-3">{(data?.pickingBatches || []).map((batch) => <div key={batch.id} className="rounded-xl border border-[var(--sami-border)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-black text-[var(--sami-text)]">{batch.batchNumber}</p><StatusPill status={batch.status} /></div><p className={mutedClass + ' mt-1'}>{batch.operationCount} pick operations · {batch.completedOperationCount} completed{batch.scheduledAt ? ' · Scheduled ' + new Date(batch.scheduledAt).toLocaleString() : ''}</p></div><select aria-label="Select picking batch" className={inputClass + ' max-w-[180px]'} value={selectedBatchId} onChange={(event) => setSelectedBatchId(event.target.value)}><option value="">Select batch</option><option value={batch.id}>{batch.batchNumber}</option></select></div><div className="mt-3 flex flex-wrap gap-2">{batch.status === 'draft' ? <button className={buttonClass} disabled={busy} onClick={() => submitAction('ready-batch', { batchId: batch.id })}>Release wave</button> : null}{batch.status === 'ready' ? <button className={buttonClass} disabled={busy} onClick={() => submitAction('start-batch', { batchId: batch.id })}>Start wave</button> : null}{batch.status === 'in_progress' ? <button className={buttonClass} disabled={busy} onClick={() => submitAction('complete-batch', { batchId: batch.id })}>Complete wave</button> : null}{['draft','ready'].includes(batch.status) ? <button className={buttonClass} disabled={busy} onClick={() => submitAction('cancel-batch', { batchId: batch.id })}>Cancel</button> : null}</div></div>)}{!data?.pickingBatches.length ? <p className={mutedClass + ' py-6'}>No picking waves created yet.</p> : null}</div>
            <div className="mt-6 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4"><p className="text-sm font-black text-[var(--sami-text)]">Add pick work to a wave</p><div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Picking batch"><select className={inputClass} value={selectedBatchId} onChange={(event) => setSelectedBatchId(event.target.value)}><option value="">Choose batch</option>{(data?.pickingBatches || []).filter((batch) => ['draft','ready'].includes(batch.status)).map((batch) => <option key={batch.id} value={batch.id}>{batch.batchNumber}</option>)}</select></Field><Field label="Pick operation"><select className={inputClass} value={selectedPickOperationId} onChange={(event) => setSelectedPickOperationId(event.target.value)}><option value="">Choose pick operation</option>{pickOperations.map((operation) => <option key={operation.id} value={operation.id}>{operation.reference || operation.operationNumber} · {operation.sourceName || 'Pick'}</option>)}</select></Field></div><button className={buttonClass + ' mt-3'} disabled={busy || !selectedBatchId || !selectedPickOperationId} onClick={() => submitAction('link-picking-operation', { batchId: selectedBatchId, operationId: selectedPickOperationId })}><Plus size={14} /> Link operation</button></div>
          </section>
          <section className={panelClass + ' p-5 sm:p-6'}>
            <SectionHeading kicker="New wave" title="Create picking batch" description="Use a batch to coordinate several pick tasks with one release and completion control." />
            <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); submitAction('create-picking-batch', { assignedUserId: batchAssignedUser || null, scheduledAt: batchScheduledAt || null }); setBatchAssignedUser(''); setBatchScheduledAt(''); }}>
              <Field label="Assigned user ID (optional)"><input className={inputClass} value={batchAssignedUser} onChange={(event) => setBatchAssignedUser(event.target.value)} placeholder="Workspace user UUID" /></Field>
              <Field label="Scheduled at (optional)"><input className={inputClass} type="datetime-local" value={batchScheduledAt} onChange={(event) => setBatchScheduledAt(event.target.value)} /></Field>
              <button disabled={busy} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"><Plus size={15} /> Create picking batch</button>
            </form>
          </section>
        </div>
      ) : null}

      {activeSection === 'packages' ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
          <section className={panelClass + ' p-5 sm:p-6'}>
            <SectionHeading kicker="Packing and hand-off" title="Packages" description="Track packages through open, packed, in-transit and delivered states. Carrier labels and external tracking belong to the optional Shipping integration." />
            <div className="mt-5 space-y-3">{(data?.packages || []).map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-[var(--sami-border)] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-300"><Package size={18} /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-black text-[var(--sami-text)]">{item.packageNumber}</p><StatusPill status={item.status} /></div><p className={mutedClass + ' mt-1'}>{item.weight} kg · {item.currentLocationName || 'Location not assigned'}</p></div></div><div className="flex flex-wrap gap-2">{item.status === 'open' ? <button className={buttonClass} disabled={busy} onClick={() => submitAction('transition-package', { packageId: item.id, status: 'packed' })}>Mark packed</button> : null}{item.status === 'packed' ? <button className={buttonClass} disabled={busy} onClick={() => submitAction('transition-package', { packageId: item.id, status: 'in_transit' })}><Truck size={14} /> Dispatch</button> : null}{item.status === 'in_transit' ? <button className={buttonClass} disabled={busy} onClick={() => submitAction('transition-package', { packageId: item.id, status: 'delivered' })}><CheckCircle2 size={14} /> Delivered</button> : null}{['open','packed'].includes(item.status) ? <button className={buttonClass} disabled={busy} onClick={() => submitAction('transition-package', { packageId: item.id, status: 'cancelled' })}>Cancel</button> : null}</div></div>)}{!data?.packages.length ? <p className={mutedClass + ' py-6'}>No packages have been created yet.</p> : null}</div>
          </section>
          <section className={panelClass + ' p-5 sm:p-6'}>
            <SectionHeading kicker="Packing desk" title="Create package" description="Create the physical package record before sealing or dispatching it." />
            <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); submitAction('create-package', { packageNumber: packageNumber || null, weight: packageWeight, currentLocationId: packageLocationId || null }); setPackageNumber(''); setPackageWeight('0'); }}>
              <Field label="Package number (optional)"><input className={inputClass} maxLength={120} value={packageNumber} onChange={(event) => setPackageNumber(event.target.value)} placeholder="Auto-generated when blank" /></Field>
              <Field label="Weight (kg)"><input className={inputClass} type="number" min="0" step="0.0001" value={packageWeight} onChange={(event) => setPackageWeight(event.target.value)} /></Field>
              <Field label="Current location (optional)"><select className={inputClass} value={packageLocationId} onChange={(event) => setPackageLocationId(event.target.value)}><option value="">Not assigned</option>{locationOptions()}</select></Field>
              <button disabled={busy} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"><Plus size={15} /> Create package</button>
            </form>
          </section>
        </div>
      ) : null}

      <p className={mutedClass + ' flex items-center gap-2'}><ScanLine size={14} aria-hidden="true" /> Warehouse actions are company-scoped and audited with the authenticated user. Inventory remains the source of truth for on-hand stock totals.</p>
      {busy ? <div role="status" className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-card)] px-4 py-3 text-xs font-bold text-[var(--sami-text)] shadow-xl"><LoaderCircle className="animate-spin" size={15} /> Saving Warehouse update…</div> : null}
    </div>
  );
}
