'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowRight, ChevronLeft, ChevronRight, CircleDollarSign, Clock3,
  Plus, RefreshCw, Save, Search, Target, TrendingUp, X,
} from 'lucide-react';
import type { SalesWorkspaceData } from '@/lib/apps/sales/types';

type Props = {
  data: SalesWorkspaceData;
  busy: boolean;
  request: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
};
type PipelineOption = { id: string; name: string; sequence: number; is_default: boolean; is_active: boolean };
type PipelineStage = {
  id: string; pipeline_id: string; name: string; sequence: number;
  probability: number | string; stage_type: 'open' | 'won' | 'lost' | string; is_active: boolean;
};
type Opportunity = {
  id: string; opportunity_number: string; name: string; stage_id: string;
  stage_type: 'open' | 'won' | 'lost' | string; stage_name: string;
  customer_name: string | null; contact_name: string | null; email: string | null;
  phone: string | null; currency: string; expected_value: number | string;
  probability: number | string; expected_close_date: string | null;
  source: string | null; latest_quote_id: string | null; lost_reason: string | null;
};
type PipelinePayload = {
  pipelines: PipelineOption[]; activePipelineId: string;
  stages: PipelineStage[]; opportunities: Opportunity[];
};
type StageDraft = { id: string | null; name: string; probability: string };
type PendingMove = { opportunity: Opportunity; stageId: string; reason: string };

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: currency || 'KES', maximumFractionDigits: 2 }).format(value);
  } catch {
    return (currency || 'KES') + ' ' + value.toLocaleString('en-KE', { maximumFractionDigits: 2 });
  }
}
// Never combine amounts from different transaction currencies in one total.
function totalsByCurrency(rows: Opportunity[], weighted = false) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = (row.currency || 'KES').toUpperCase();
    const amount = numeric(row.expected_value) * (weighted ? numeric(row.probability) / 100 : 1);
    totals.set(currency, (totals.get(currency) || 0) + amount);
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => formatMoney(amount, currency)).join(' · ') || '—';
}
function dateLabel(value: string | null) {
  if (!value) return 'No close date';
  const date = new Date(String(value).slice(0, 10) + 'T00:00:00');
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10)
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function SalesPipelineBoard({ data, busy, request, showSuccess, showError }: Props) {
  const [board, setBoard] = useState<PipelinePayload | null>(null);
  const [selectedPipelineId, setSelectedPipelineId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [stageDraft, setStageDraft] = useState<StageDraft | null>(null);
  const [savingStage, setSavingStage] = useState(false);
  const [archivingStageId, setArchivingStageId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    try {
      const query = selectedPipelineId
        ? '/api/apps/sales?pipeline=1&pipelineId=' + encodeURIComponent(selectedPipelineId)
        : '/api/apps/sales?pipeline=1';
      const response = await fetch(query, {
        method: 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const body = await response.json().catch(() => ({})) as {
        success?: boolean; pipeline?: PipelinePayload; error?: string;
      };
      if (!response.ok || body.success !== true || !body.pipeline) {
        throw new Error(body.error || 'SaMi could not load the opportunity pipeline.');
      }
      setBoard(body.pipeline);
      if (!selectedPipelineId && body.pipeline.activePipelineId) {
        setSelectedPipelineId(body.pipeline.activePipelineId);
      }
    } catch (error) {
      showError('Pipeline could not load', error instanceof Error ? error.message : 'SaMi could not load the opportunity pipeline.');
    } finally {
      setLoading(false);
    }
  }, [selectedPipelineId, showError]);

  useEffect(() => { void loadBoard(); }, [loadBoard]);

  const stages = useMemo(
    () => [...(board?.stages || [])].sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name)),
    [board],
  );
  const openStages = useMemo(() => stages.filter(stage => stage.stage_type === 'open'), [stages]);
  const opportunities = useMemo(() => board?.opportunities || [], [board]);
  const filteredOpportunities = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return opportunities;
    return opportunities.filter(item => [
      item.opportunity_number, item.name, item.customer_name, item.contact_name,
      item.email, item.phone, item.source, item.stage_name,
    ].some(value => String(value || '').toLowerCase().includes(query)));
  }, [opportunities, search]);
  const opportunitiesByStage = useMemo(() => {
    const grouped = new Map<string, Opportunity[]>();
    for (const stage of stages) grouped.set(stage.id, []);
    for (const opportunity of filteredOpportunities) grouped.get(opportunity.stage_id)?.push(opportunity);
    return grouped;
  }, [filteredOpportunities, stages]);

  const openOpportunities = opportunities.filter(item => item.stage_type === 'open');
  const overdueCount = openOpportunities.filter(item =>
    item.expected_close_date && item.expected_close_date.slice(0, 10) < new Date().toISOString().slice(0, 10),
  ).length;
  const isBusy = busy || loading || savingStage;

  async function commitMove(opportunity: Opportunity, stageId: string, reason = '') {
    try {
      await request({ action: 'move_opportunity', opportunityId: opportunity.id, stageId, reason });
      setPendingMove(null);
      showSuccess('Opportunity moved', 'The stage change and opportunity audit history have been saved.');
      await loadBoard();
    } catch (error) {
      showError('Stage could not change', error instanceof Error ? error.message : 'SaMi could not move this opportunity.');
    }
  }

  function onStageChange(opportunity: Opportunity, stageId: string) {
    if (!stageId || stageId === opportunity.stage_id) return;
    const target = stages.find(stage => stage.id === stageId);
    if (!target) return;
    if (target.stage_type === 'lost') {
      setPendingMove({ opportunity, stageId, reason: '' });
      return;
    }
    void commitMove(opportunity, stageId);
  }

  async function saveStage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stageDraft || !board) return;
    const name = stageDraft.name.trim();
    const probability = Number(stageDraft.probability);
    if (!name || !Number.isFinite(probability) || probability < 0 || probability > 100) {
      showError('Stage details are invalid', 'Enter a stage name and a probability from 0 to 100.');
      return;
    }
    setSavingStage(true);
    try {
      await request(stageDraft.id
        ? { action: 'update_pipeline_stage', stageId: stageDraft.id, name, probability }
        : { action: 'create_pipeline_stage', pipelineId: board.activePipelineId, name, probability });
      showSuccess(stageDraft.id ? 'Stage updated' : 'Stage created',
        stageDraft.id ? 'The stage settings have been saved.' : 'The new stage is ready for opportunities.');
      setStageDraft(null);
      await loadBoard();
    } catch (error) {
      showError('Stage could not be saved', error instanceof Error ? error.message : 'SaMi could not save this stage.');
    } finally {
      setSavingStage(false);
    }
  }

  async function archiveStage(stage: PipelineStage) {
    try {
      const result = await request({ action: 'archive_pipeline_stage', stageId: stage.id });
      const moved = Number(result.movedOpportunities || 0);
      showSuccess('Stage archived', moved
        ? moved + ' opportunity record(s) moved to the next active stage; transition history was recorded.'
        : 'The stage is archived and no longer available for new opportunities.');
      setArchivingStageId(null);
      await loadBoard();
    } catch (error) {
      showError('Stage could not be archived', error instanceof Error ? error.message : 'SaMi could not archive this stage.');
    }
  }

  async function reorderStages(stageId: string, direction: -1 | 1) {
    if (!board) return;
    const index = openStages.findIndex(stage => stage.id === stageId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= openStages.length) return;
    const ordered = [...openStages];
    [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
    try {
      await request({ action: 'reorder_pipeline_stages', pipelineId: board.activePipelineId, stageIds: ordered.map(stage => stage.id) });
      await loadBoard();
    } catch (error) {
      showError('Stage order could not change', error instanceof Error ? error.message : 'SaMi could not reorder these stages.');
    }
  }

  return (
    <div className="space-y-4">
      <header className="sami-surface rounded-[26px] p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">Sales workspace · opportunity management</p>
            <h1 className="mt-1 text-xl font-black sm:text-2xl">Pipeline board</h1>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">Work real opportunities by stage, monitor weighted value and keep each move in the opportunity audit trail.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/apps/sales/opportunities" className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black transition hover:bg-[var(--sami-surface-soft)]">
              Manage leads & opportunities <ArrowRight className="h-4 w-4" />
            </Link>
            <button type="button" disabled={isBusy} onClick={() => void loadBoard()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="sami-surface rounded-[22px] p-4">
          <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Open opportunities</p><Target className="h-4 w-4 text-blue-600" /></div>
          <p className="mt-2 text-2xl font-black tabular-nums">{openOpportunities.length}</p>
          <p className="mt-1 text-[11px] text-slate-500">Deals still in progress</p>
        </article>
        <article className="sami-surface rounded-[22px] p-4">
          <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Open pipeline</p><CircleDollarSign className="h-4 w-4 text-blue-600" /></div>
          <p className="mt-2 text-lg font-black leading-6">{totalsByCurrency(openOpportunities)}</p>
          <p className="mt-1 text-[11px] text-slate-500">Amounts grouped by transaction currency</p>
        </article>
        <article className="sami-surface rounded-[22px] p-4">
          <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Weighted pipeline</p><TrendingUp className="h-4 w-4 text-emerald-600" /></div>
          <p className="mt-2 text-lg font-black leading-6">{totalsByCurrency(openOpportunities, true)}</p>
          <p className="mt-1 text-[11px] text-slate-500">Expected value × probability</p>
        </article>
        <article className="sami-surface rounded-[22px] p-4">
          <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Past close date</p><Clock3 className={`h-4 w-4 ${overdueCount ? 'text-amber-600' : 'text-slate-500'}`} /></div>
          <p className="mt-2 text-2xl font-black tabular-nums">{overdueCount}</p>
          <p className="mt-1 text-[11px] text-slate-500">Open deals with overdue close dates</p>
        </article>
      </section>

      <section className="sami-surface rounded-[22px] p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor="sales-pipeline-select">Select pipeline</label>
            <select id="sales-pipeline-select" value={selectedPipelineId || board?.activePipelineId || ''}
              onChange={event => setSelectedPipelineId(event.target.value)} disabled={isBusy || (board?.pipelines.length || 0) < 2}
              className="h-10 min-w-[220px] rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs font-bold disabled:opacity-60">
              {(board?.pipelines || []).map(pipeline => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}{pipeline.is_default ? ' · Default' : ''}</option>)}
            </select>
            <label className="relative block min-w-0 sm:min-w-[260px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search opportunities" aria-label="Search opportunities on pipeline board"
                className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent pl-9 pr-3 text-xs" />
            </label>
          </div>
          {data.capabilities.canManagePipelineStages ? <button type="button" disabled={isBusy || !board?.activePipelineId}
            onClick={() => setStageDraft({ id: null, name: '', probability: '20' })}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-black text-white disabled:opacity-60">
            <Plus className="h-4 w-4" /> New stage
          </button> : null}
        </div>
      </section>

      {stageDraft ? <section className="sami-surface rounded-[22px] p-4 sm:p-5">
        <form onSubmit={saveStage} className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="text-sm font-black">{stageDraft.id ? 'Edit pipeline stage' : 'Create pipeline stage'}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Won and Lost remain protected terminal stages. Reorder open stages from the board.</p></div>
            <button type="button" onClick={() => setStageDraft(null)} aria-label="Close stage editor" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--sami-border)]"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end">
            <label className="block text-xs font-bold">Stage name *
              <input value={stageDraft.name} onChange={event => setStageDraft(current => current ? { ...current, name: event.target.value } : current)}
                required maxLength={120} autoFocus placeholder="e.g. Proposal review" className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm" />
            </label>
            <label className="block text-xs font-bold">Default probability (%)
              <input type="number" value={stageDraft.probability} onChange={event => setStageDraft(current => current ? { ...current, probability: event.target.value } : current)}
                min={0} max={100} step={1} required className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm" />
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={isBusy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:opacity-60"><Save className="h-4 w-4" /> {savingStage ? 'Saving…' : 'Save stage'}</button>
              <button type="button" disabled={isBusy} onClick={() => setStageDraft(null)} className="h-10 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-bold">Cancel</button>
            </div>
          </div>
        </form>
      </section> : null}

      {pendingMove ? <section role="dialog" aria-labelledby="lost-stage-title" className="sami-surface rounded-[22px] border-amber-300/70 p-4 dark:border-amber-500/30">
        <h2 id="lost-stage-title" className="text-sm font-black">Record the loss reason</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">Moving “{pendingMove.opportunity.name}” to Lost requires an auditable reason.</p>
        <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); if (pendingMove.reason.trim()) void commitMove(pendingMove.opportunity, pendingMove.stageId, pendingMove.reason.trim()); }}>
          <textarea value={pendingMove.reason} onChange={event => setPendingMove(current => current ? { ...current, reason: event.target.value } : current)}
            required maxLength={2000} rows={3} placeholder="Explain why the deal was lost." aria-label="Reason for losing opportunity"
            className="w-full rounded-xl border border-[var(--sami-border)] bg-transparent p-3 text-sm" />
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !pendingMove.reason.trim()} className="h-10 rounded-xl bg-rose-700 px-3.5 text-xs font-black text-white disabled:opacity-60">Confirm lost stage</button>
            <button type="button" onClick={() => setPendingMove(null)} className="h-10 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-bold">Cancel</button>
          </div>
        </form>
      </section> : null}

      <section className="sami-surface overflow-hidden rounded-[26px] p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
          <div><h2 className="text-sm font-black">Opportunity stages</h2><p className="mt-1 text-[11px] text-slate-500">{filteredOpportunities.length} of {opportunities.length} opportunities shown</p></div>
          <span className="text-[11px] font-semibold text-slate-500">Move a deal by selecting a destination stage on its card.</span>
        </div>
        {loading ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">{[1,2,3,4,5].map(item => <div key={item} className="h-60 animate-pulse rounded-2xl bg-[var(--sami-surface-soft)]" />)}</div>
        : stages.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--sami-border-strong)] p-8 text-center"><p className="text-sm font-black">No active pipeline stages</p><p className="mt-1 text-xs text-slate-500">Create an open stage to start organizing opportunities.</p></div>
        : <div className="sami-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
          {stages.map((stage, stageIndex) => {
            const cards = opportunitiesByStage.get(stage.id) || [];
            const isOpen = stage.stage_type === 'open';
            return <section key={stage.id} className="flex w-[min(84vw,330px)] shrink-0 flex-col rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface-soft)]/70 p-3">
              <header className="mb-3 border-b border-[var(--sami-border)] pb-3">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-black">{stage.name}</h3><span className="rounded-full border border-[var(--sami-border)] bg-[var(--sami-surface)] px-2 py-0.5 text-[10px] font-black tabular-nums">{cards.length}</span></div>
                  <p className="mt-1 text-[10px] font-semibold text-slate-500">{isOpen ? Number(stage.probability).toFixed(0) + '% default probability' : stage.stage_type === 'won' ? 'Closed won' : 'Closed lost'}</p>
                </div>
                {data.capabilities.canManagePipelineStages && isOpen ? <div className="flex shrink-0 items-center gap-1">
                  <button type="button" disabled={isBusy || stageIndex === 0} onClick={() => void reorderStages(stage.id, -1)} aria-label={'Move ' + stage.name + ' earlier'} title="Move stage earlier" className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--sami-border)] disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" /></button>
                  <button type="button" disabled={isBusy || stageIndex >= openStages.length - 1} onClick={() => void reorderStages(stage.id, 1)} aria-label={'Move ' + stage.name + ' later'} title="Move stage later" className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--sami-border)] disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5" /></button>
                  <button type="button" disabled={isBusy} onClick={() => setStageDraft({ id: stage.id, name: stage.name, probability: String(stage.probability) })} aria-label={'Edit ' + stage.name} title="Edit stage" className="inline-flex h-7 items-center rounded-lg border border-[var(--sami-border)] px-2 text-[10px] font-black">Edit</button>
                  {archivingStageId === stage.id
                    ? <button type="button" disabled={isBusy} onClick={() => void archiveStage(stage)} className="inline-flex h-7 items-center rounded-lg bg-rose-700 px-2 text-[10px] font-black text-white disabled:opacity-60">Confirm archive</button>
                    : <button type="button" disabled={isBusy || openStages.length <= 1} onClick={() => setArchivingStageId(stage.id)} aria-label={'Archive ' + stage.name} title="Archive stage" className="inline-flex h-7 items-center rounded-lg border border-rose-500/30 px-2 text-[10px] font-black text-rose-700 disabled:opacity-30 dark:text-rose-300">Archive</button>}
                </div> : null}</div>
                {archivingStageId === stage.id ? <div className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/5 p-2"><p className="text-[10px] leading-4 text-slate-600 dark:text-slate-300">Opportunities in this stage move to the next active open stage, and each transition is recorded.</p><button type="button" onClick={() => setArchivingStageId(null)} className="mt-1 text-[10px] font-black underline">Cancel archive</button></div> : null}
                <p className="mt-2 text-[10px] leading-4 text-slate-500">Stage value · {totalsByCurrency(cards)}</p>
                {isOpen ? <p className="mt-0.5 text-[10px] leading-4 text-slate-500">Weighted · {totalsByCurrency(cards.filter(item => item.stage_type === 'open'), true)}</p> : null}
              </header>
              <div className="flex-1 space-y-2">
                {cards.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--sami-border)] px-3 py-6 text-center text-[11px] text-slate-500">No opportunities in this stage</div>
                : cards.map(opportunity => <article key={opportunity.id} className="rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-3 shadow-[var(--sami-shadow-sm)]">
                  <div className="flex items-start justify-between gap-2"><div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.08em] text-blue-600 dark:text-blue-300">{opportunity.opportunity_number}</p>
                    <h4 className="mt-1 break-words text-xs font-black leading-5">{opportunity.name}</h4>
                  </div><span className="shrink-0 rounded-full bg-slate-500/10 px-2 py-1 text-[10px] font-black">{Number(opportunity.probability).toFixed(0)}%</span></div>
                  <p className="mt-1 truncate text-[11px] text-slate-500">{opportunity.customer_name || opportunity.contact_name || 'Customer not specified'}</p>
                  <p className="mt-2 text-sm font-black tabular-nums">{formatMoney(numeric(opportunity.expected_value), opportunity.currency)}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500"><span>{dateLabel(opportunity.expected_close_date)}</span><span>{opportunity.source || 'No source'}</span></div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className="min-w-0 flex-1"><span className="sr-only">Move {opportunity.name} to stage</span>
                      <select aria-label={'Move ' + opportunity.name + ' to stage'} value={opportunity.stage_id} onChange={event => onStageChange(opportunity, event.target.value)}
                        disabled={isBusy || !data.capabilities.canMovePipeline} className="h-9 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-[10px] font-bold disabled:opacity-50">
                        {stages.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                      </select>
                    </label>
                    {opportunity.latest_quote_id ? <Link href={'/apps/sales/quotes/' + encodeURIComponent(opportunity.latest_quote_id)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--sami-border)] px-2 text-[10px] font-black">Quote <ArrowRight className="h-3 w-3" /></Link> : null}
                  </div>
                </article>)}
              </div>
            </section>;
          })}
        </div>}
      </section>
    </div>
  );
}
