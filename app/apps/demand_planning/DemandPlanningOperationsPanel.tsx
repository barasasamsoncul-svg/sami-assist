'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, Sparkles } from 'lucide-react';
import type { DemandPlanningOverview } from '@/lib/apps/demand_planning/service';

type Section = 'overview' | 'forecast' | 'replenishment';
type ApiResponse<T> = { success: boolean; data?: T; error?: string };
const inputClass = 'h-11 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm text-[var(--sami-text)] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15';
const cardClass = 'rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-card)] p-4 shadow-[var(--sami-shadow-sm)]';
const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-4 py-2 text-xs font-semibold text-[var(--sami-text)] disabled:opacity-50';
function quantity(value: string) { const n = Number(value); return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 4 }) : value; }
function dateLabel(value: string | null) { return value ? new Date(value).toLocaleDateString() : 'Not scheduled'; }
function Status({ value }: { value: string }) {
  const positive = value === 'accepted' || value === 'ready';
  const negative = value === 'rejected';
  const tone = positive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : negative ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
    : 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300';
  return <span className={'inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ' + tone}>{value.replaceAll('_', ' ')}</span>;
}

export default function DemandPlanningOperationsPanel({ initialSection }: { initialSection: Section }) {
  const [data, setData] = useState<DemandPlanningOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [horizonDays, setHorizonDays] = useState('30');
  const [historyDays, setHistoryDays] = useState('90');
  const [safetyStockDays, setSafetyStockDays] = useState('14');
  const [leadTimeDays, setLeadTimeDays] = useState('14');
  const [statusFilter, setStatusFilter] = useState('suggested');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/apps/demand_planning/operations', { cache: 'no-store', headers: { Accept: 'application/json' } });
      const payload = await response.json() as ApiResponse<DemandPlanningOverview>;
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error || 'Demand Planning overview could not be loaded.');
      setData(payload.data); setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Demand Planning overview could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function post<T>(body: Record<string, unknown>): Promise<T> {
    const response = await fetch('/api/apps/demand_planning/operations', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body),
    });
    const payload = await response.json() as ApiResponse<T>;
    if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error || 'Demand Planning request failed.');
    return payload.data;
  }
  function generate() {
    setError(''); setNotice('');
    startTransition(() => { void (async () => {
      try {
        const result = await post<{ productsAnalysed?: number; recommendationsCreated?: number; duplicate?: boolean }>({
          action: 'run-forecast', horizonDays: Number(horizonDays), historyDays: Number(historyDays),
          safetyStockDays: Number(safetyStockDays), leadTimeDays: Number(leadTimeDays),
          idempotencyKey: globalThis.crypto.randomUUID(),
        });
        setNotice(result.duplicate ? 'That exact forecast request was already processed.' :
          'Forecast analysed ' + (result.productsAnalysed || 0) + ' products and created ' + (result.recommendationsCreated || 0) + ' replenishment suggestions. No purchase orders were created.');
        await refresh();
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'Forecast could not be generated.'); }
    })(); });
  }
  function decide(recommendationId: string, decision: 'accept' | 'reject') {
    setError(''); setNotice('');
    startTransition(() => { void (async () => {
      try {
        const result = await post<{ status: string }>({ action: 'decide-recommendation', recommendationId, decision });
        setNotice('Recommendation marked ' + result.status + '. This does not create a purchase order.');
        await refresh();
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'Recommendation could not be updated.'); }
    })(); });
  }

  const recommendations = (data?.recommendations || []).filter((item) => statusFilter === 'all' || item.status === statusFilter);
  const showForecasts = initialSection === 'overview' || initialSection === 'forecast';
  const showReplenishment = initialSection === 'overview' || initialSection === 'replenishment';

  return (
    <div className="space-y-5" data-demand-planning-operations>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-400">Supply planning</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-[var(--sami-text)]">Demand Planning</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--sami-muted)]">Forecast from actual outbound stock movements, compare demand with available stock after reservations, and review replenishment suggestions before any procurement decision.</p>
        </div>
        <button type="button" className={buttonClass} onClick={() => void refresh()} disabled={loading || busy}><RefreshCw className="h-4 w-4" /> Refresh</button>
      </div>
      {error ? <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</div> : null}
      {notice ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{notice}</div> : null}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {[
          ['Stock-tracked products', data?.summary.productCount ?? 0, 'Inventory catalog'],
          ['Forecast runs', data?.summary.forecastCount ?? 0, 'Stored planning runs'],
          ['Suggested', data?.summary.suggestedCount ?? 0, 'Awaiting decision'],
          ['Accepted', data?.summary.acceptedCount ?? 0, 'Approved planning signal'],
          ['Stock at reorder level', data?.summary.productsAtRisk ?? 0, 'Current stock register'],
        ].map(([label, value, caption]) => (
          <div className={cardClass} key={String(label)}>
            <p className="text-xs font-semibold text-[var(--sami-muted)]">{label}</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-[var(--sami-text)]">{loading ? '—' : Number(value).toLocaleString()}</p>
            <p className="mt-1 text-[11px] text-[var(--sami-muted)]">{caption}</p>
          </div>
        ))}
      </div>

      {showForecasts ? (
        <section className={cardClass}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div><h2 className="text-lg font-bold text-[var(--sami-text)]">Generate a forecast</h2><p className="mt-1 text-sm text-[var(--sami-muted)]">A reproducible moving-average baseline from recorded outbound stock movements. It is not an AI or seasonal model.</p></div>
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--sami-muted)]"><Sparkles className="h-4 w-4" /> Transparent method</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1.5 text-xs font-semibold text-[var(--sami-text)]">Forecast horizon (days)<input className={inputClass} type="number" min="7" max="365" value={horizonDays} onChange={(event) => setHorizonDays(event.target.value)} /></label>
            <label className="space-y-1.5 text-xs font-semibold text-[var(--sami-text)]">History window (days)<input className={inputClass} type="number" min="30" max="730" value={historyDays} onChange={(event) => setHistoryDays(event.target.value)} /></label>
            <label className="space-y-1.5 text-xs font-semibold text-[var(--sami-text)]">Safety stock coverage (days)<input className={inputClass} type="number" min="0" max="180" value={safetyStockDays} onChange={(event) => setSafetyStockDays(event.target.value)} /></label>
            <label className="space-y-1.5 text-xs font-semibold text-[var(--sami-text)]">Lead-time target (days)<input className={inputClass} type="number" min="0" max="180" value={leadTimeDays} onChange={(event) => setLeadTimeDays(event.target.value)} /></label>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-3xl text-xs text-[var(--sami-muted)]">Demand uses outbound movement types out, outbound, issue and sale. Replenishment compares projected demand and safety stock with available stock after active/allocated reservations and the reorder level. Signal strength is a heuristic, not a statistical confidence interval.</p>
            <button type="button" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50 hover:bg-blue-700" onClick={generate} disabled={busy || loading}><Sparkles className="h-4 w-4" /> {busy ? 'Processing…' : 'Generate forecast'}</button>
          </div>
        </section>
      ) : null}

      {showForecasts ? (
        <section className={cardClass}>
          <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-[var(--sami-text)]">Recent forecast runs</h2><span className="text-xs text-[var(--sami-muted)]">Latest 25</span></div>
          {data?.forecasts.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
            <thead><tr className="border-b border-[var(--sami-border)] text-xs text-[var(--sami-muted)]"><th className="px-3 py-3">Forecast</th><th className="px-3 py-3">Period</th><th className="px-3 py-3">Products analysed</th><th className="px-3 py-3">Demand lines</th><th className="px-3 py-3">Status</th></tr></thead>
            <tbody>{data.forecasts.map((item) => <tr key={item.id} className="border-b border-[var(--sami-border)] last:border-0"><td className="px-3 py-3"><p className="font-semibold text-[var(--sami-text)]">{item.name}</p><p className="text-[11px] text-[var(--sami-muted)]">{dateLabel(item.createdAt)}</p></td><td className="px-3 py-3 text-[var(--sami-text)]">{dateLabel(item.horizonStart)} – {dateLabel(item.horizonEnd)}</td><td className="px-3 py-3 tabular-nums text-[var(--sami-text)]">{item.lineCount}</td><td className="px-3 py-3 tabular-nums text-[var(--sami-text)]">{item.demandLines}</td><td className="px-3 py-3"><Status value={item.status} /></td></tr>)}</tbody>
          </table></div> : <p className="mt-4 rounded-xl border border-dashed border-[var(--sami-border)] p-5 text-sm text-[var(--sami-muted)]">No forecast runs yet. Generate the first baseline to calculate product-level replenishment risk.</p>}
        </section>
      ) : null}

      {showReplenishment ? (
        <section className={cardClass}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold text-[var(--sami-text)]">Replenishment recommendations</h2><p className="mt-1 text-sm text-[var(--sami-muted)]">Accepting approves the planning signal only. Purchase orders are never created automatically.</p></div><label className="w-full max-w-[220px] text-xs font-semibold text-[var(--sami-text)]">Filter<select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="suggested">Awaiting decision</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="all">All statuses</option></select></label></div>
          {recommendations.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm">
            <thead><tr className="border-b border-[var(--sami-border)] text-xs text-[var(--sami-muted)]"><th className="px-3 py-3">Product</th><th className="px-3 py-3">Suggested qty</th><th className="px-3 py-3">Available now</th><th className="px-3 py-3">Needed by</th><th className="px-3 py-3">Status / decision</th></tr></thead>
            <tbody>{recommendations.map((item) => <tr key={item.id} className="border-b border-[var(--sami-border)] last:border-0"><td className="px-3 py-3"><p className="font-semibold text-[var(--sami-text)]">{item.productName}</p><p className="text-[11px] text-[var(--sami-muted)]">{item.sku || item.productId}</p><p className="mt-1 max-w-[420px] text-xs text-[var(--sami-muted)]">{item.reason}</p></td><td className="px-3 py-3 font-bold tabular-nums text-[var(--sami-text)]">{quantity(item.recommendedQuantity)}</td><td className="px-3 py-3 tabular-nums text-[var(--sami-text)]">{quantity(item.availableQuantity)}</td><td className="px-3 py-3 text-[var(--sami-text)]">{dateLabel(item.neededBy)}</td><td className="px-3 py-3"><div className="flex flex-col items-start gap-2"><Status value={item.status} />{item.status === 'suggested' ? <div className="flex gap-2"><button type="button" className={buttonClass} disabled={busy} onClick={() => decide(item.id, 'accept')}><CheckCircle2 className="h-4 w-4" /> Accept</button><button type="button" className={buttonClass} disabled={busy} onClick={() => decide(item.id, 'reject')}><AlertTriangle className="h-4 w-4" /> Reject</button></div> : null}</div></td></tr>)}</tbody>
          </table></div> : <p className="mt-4 rounded-xl border border-dashed border-[var(--sami-border)] p-5 text-sm text-[var(--sami-muted)]">No recommendations match this filter. Forecasting may need more outbound history, or stock may already cover projected demand.</p>}
        </section>
      ) : null}

      {initialSection === 'overview' ? <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-[var(--sami-text)]"><Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" /><div><p className="font-semibold">Planning signal, not procurement execution</p><p className="mt-1 text-[var(--sami-muted)]">This release creates reproducible baseline forecasts and human-reviewed suggestions. It does not book suppliers or create purchase orders. Seasonality, supplier lead-time history and advanced statistical forecasting remain future parity requirements.</p></div></div> : null}
    </div>
  );
}
