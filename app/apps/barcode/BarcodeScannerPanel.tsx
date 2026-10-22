'use client';

import { useCallback, useEffect, useState, useTransition, type FormEvent } from 'react';
import { CheckCircle2, CircleAlert, History, LoaderCircle, RefreshCw, ScanLine, Search } from 'lucide-react';
import type { BarcodeWorkspaceOverview } from '@/lib/apps/barcode/service';

type Section = 'overview' | 'scanner' | 'history';
type ApiResponse<T> = { success: boolean; data?: T; error?: string };
type ScanResult = {
  scan: BarcodeWorkspaceOverview['recentScans'][number];
  product: { id: string; name: string; sku: string | null; barcode: string | null } | null;
  message: string;
};
const inputClass = 'h-11 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm text-[var(--sami-text)] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15';
const cardClass = 'rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-card)] p-4 shadow-[var(--sami-shadow-sm)]';
const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-4 py-2 text-xs font-semibold text-[var(--sami-text)] disabled:opacity-50';
const intents = [
  { value: 'lookup', label: 'Product lookup' }, { value: 'receive', label: 'Receiving reference' },
  { value: 'pick', label: 'Picking reference' }, { value: 'count', label: 'Stock-count reference' },
  { value: 'pack', label: 'Packing reference' }, { value: 'dispatch', label: 'Dispatch reference' },
  { value: 'return', label: 'Returns reference' },
];
function humanize(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function StatusPill({ status }: { status: string }) {
  const color = status === 'matched' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : status === 'ambiguous' ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
    : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300';
  return <span className={'inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ' + color}>{humanize(status)}</span>;
}

export default function BarcodeScannerPanel({ initialSection }: { initialSection: Section }) {
  const [data, setData] = useState<BarcodeWorkspaceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [barcode, setBarcode] = useState('');
  const [operation, setOperation] = useState('lookup');
  const [deviceReference, setDeviceReference] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [search, setSearch] = useState('');
  const [busy, startTransition] = useTransition();
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/apps/barcode/scans', { cache: 'no-store', headers: { Accept: 'application/json' } });
      const payload = await response.json() as ApiResponse<BarcodeWorkspaceOverview>;
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error || 'Barcode overview could not be loaded.');
      setData(payload.data); setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Barcode overview could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const submitScan = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setNotice('');
    startTransition(async () => {
      try {
        const response = await fetch('/api/apps/barcode/scans', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ barcode, operation, deviceReference }),
        });
        const payload = await response.json() as ApiResponse<ScanResult>;
        if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error || 'Scan could not be recorded.');
        setLastResult(payload.data); setNotice(payload.data.message); setBarcode(''); await refresh();
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'Scan could not be recorded.'); }
    });
  };
  const scans = (data?.recentScans || []).filter((scan) => {
    const q = search.trim().toLowerCase();
    return !q || [scan.barcode, scan.productName || '', scan.sku || '', scan.operation, scan.matchStatus, scan.deviceReference || ''].some((value) => value.toLowerCase().includes(q));
  });
  return (
    <div className="space-y-5 text-[var(--sami-text)]" data-barcode-workspace="specialist">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--sami-muted)]">Inventory operations</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{initialSection === 'history' ? 'Scan history' : initialSection === 'scanner' ? 'Barcode scanner' : 'Barcode command center'}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--sami-muted)]">Capture product identifiers, resolve matches and audit scan activity for the selected company.</p>
        </div>
        <button type="button" className={buttonClass} onClick={() => void refresh()} disabled={loading || busy}><RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} /> Refresh</button>
      </header>
      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-4 text-sm leading-6">
        <strong>Operational safety:</strong> recording a scan does not change stock quantities. Use Inventory or Warehouse execution workflows to post receives, picks, counts or movements; this workspace records scan intent and matching results.
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Scans today', value: data?.summary.scansToday ?? 0, detail: 'Since midnight' },
          { label: 'All scans', value: data?.summary.totalScans ?? 0, detail: 'Company scan history' },
          { label: 'Matched', value: data?.summary.matchedScans ?? 0, detail: 'Unique product matches' },
          { label: 'Unmatched', value: data?.summary.unmatchedScans ?? 0, detail: 'Needs identifier review' },
          { label: 'Products coded', value: data?.summary.productsWithBarcode ?? 0, detail: 'Active products with an identifier' },
        ].map((item) => <article key={item.label} className={cardClass}><p className="text-xs font-medium text-[var(--sami-muted)]">{item.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{loading ? '—' : item.value.toLocaleString()}</p><p className="mt-1 text-[11px] text-[var(--sami-muted)]">{item.detail}</p></article>)}
      </section>
      {error ? <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</div> : null}
      {notice ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">{notice}</div> : null}
      {initialSection !== 'history' ? <section className={cardClass}>
        <div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-300"><ScanLine className="h-5 w-5" /></div><div><h2 className="text-base font-semibold">Capture a scan</h2><p className="mt-1 text-xs leading-5 text-[var(--sami-muted)]">Works with handheld scanners that type a decoded value and send Enter.</p></div></div>
        <form className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto]" onSubmit={submitScan}>
          <label className="block text-xs font-semibold">Barcode or SKU<input autoFocus={initialSection === 'scanner'} className={inputClass + ' mt-2'} value={barcode} onChange={(event) => setBarcode(event.target.value)} maxLength={255} placeholder="Scan or type a product identifier" autoComplete="off" required /></label>
          <label className="block text-xs font-semibold">Scan intent<select className={inputClass + ' mt-2'} value={operation} onChange={(event) => setOperation(event.target.value)}>{intents.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="block text-xs font-semibold">Device / station (optional)<input className={inputClass + ' mt-2'} value={deviceReference} onChange={(event) => setDeviceReference(event.target.value)} maxLength={255} placeholder="e.g. receiving-desk-1" /></label>
          <div className="flex items-end"><button className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white disabled:opacity-50" type="submit" disabled={busy || !barcode.trim()}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />} Record scan</button></div>
        </form>
        {lastResult ? <div className="mt-4 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold">Latest scan: {lastResult.scan.barcode}</span><StatusPill status={lastResult.scan.matchStatus} /></div>{lastResult.product ? <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-xs text-[var(--sami-muted)]">Product</dt><dd className="mt-1 font-medium">{lastResult.product.name}</dd></div><div><dt className="text-xs text-[var(--sami-muted)]">SKU</dt><dd className="mt-1 font-medium">{lastResult.product.sku || '—'}</dd></div><div><dt className="text-xs text-[var(--sami-muted)]">Master barcode</dt><dd className="mt-1 font-medium">{lastResult.product.barcode || '—'}</dd></div></dl> : <p className="mt-2 text-sm text-[var(--sami-muted)]">No unique product record was selected by the matcher.</p>}</div> : null}
      </section> : null}
      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><History className="h-4 w-4 text-[var(--sami-muted)]" /><h2 className="text-base font-semibold">Recent scans</h2><p className="hidden text-xs text-[var(--sami-muted)] sm:block">Latest 50 company scan events</p></div><label className="relative block w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sami-muted)]" /><input className={inputClass + ' pl-9'} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter barcode, product, device…" /></label></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead><tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-wide text-[var(--sami-muted)]"><th className="px-3 py-3">Scanned at</th><th className="px-3 py-3">Barcode / SKU</th><th className="px-3 py-3">Product</th><th className="px-3 py-3">Intent</th><th className="px-3 py-3">Result</th><th className="px-3 py-3">Device</th></tr></thead><tbody>
          {scans.map((scan) => <tr key={scan.id} className="border-b border-[var(--sami-border)]/70 last:border-0"><td className="whitespace-nowrap px-3 py-3 text-xs text-[var(--sami-muted)]">{new Date(scan.scannedAt).toLocaleString()}</td><td className="px-3 py-3 font-mono text-xs">{scan.barcode}</td><td className="px-3 py-3">{scan.productName ? <div className="font-medium">{scan.productName}<div className="mt-1 text-[11px] text-[var(--sami-muted)]">{scan.sku || 'No SKU'}</div></div> : <span className="text-xs text-[var(--sami-muted)]">No unique match</span>}</td><td className="px-3 py-3 text-xs">{humanize(scan.operation)}</td><td className="px-3 py-3"><StatusPill status={scan.matchStatus} /></td><td className="px-3 py-3 text-xs text-[var(--sami-muted)]">{scan.deviceReference || '—'}</td></tr>)}
          {!loading && scans.length === 0 ? <tr><td colSpan={6} className="px-4 py-12 text-center"><CircleAlert className="mx-auto h-5 w-5 text-[var(--sami-muted)]" /><p className="mt-2 text-sm font-medium">No scan events found</p><p className="mt-1 text-xs text-[var(--sami-muted)]">Record a scan or clear the current filter.</p></td></tr> : null}
        </tbody></table></div>
        <p className="mt-3 flex items-center gap-2 text-[11px] text-[var(--sami-muted)]"><CheckCircle2 className="h-3.5 w-3.5" /> Product matching is restricted to active records within the selected company.</p>
      </section>
    </div>
  );
}
