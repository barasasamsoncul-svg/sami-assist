'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Target,
  TrendingUp,
  Trash2,
  X,
} from 'lucide-react';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import { useSaMiOverlay } from '@/app/components/useSaMiOverlay';

import type { SalesWorkspaceData } from '@/lib/apps/sales/types';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type Props = {
  data: SalesWorkspaceData;
  busy: boolean;
  request: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
};

type PipelineOption = {
  id: string;
  name: string;
  sequence: number;
  is_default: boolean;
  is_active: boolean;
};

type PipelineStage = {
  id: string;
  pipeline_id: string;
  name: string;
  sequence: number;
  probability: number | string;
  stage_type: 'open' | 'won' | 'lost' | string;
  is_active: boolean;
};

type Opportunity = {
  id: string;
  opportunity_number: string;
  name: string;
  stage_id: string;
  stage_type: 'open' | 'won' | 'lost' | string;
  stage_name: string;
  customer_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  currency: string;
  expected_value: number | string;
  probability: number | string;
  expected_close_date: string | null;
  source: string | null;
  latest_quote_id: string | null;
  lost_reason: string | null;
};

type PipelinePayload = {
  pipelines: PipelineOption[];
  activePipelineId: string;
  stages: PipelineStage[];
  opportunities: Opportunity[];
};

type StageDraft = {
  id: string | null;
  name: string;
  probability: string;
};

type PendingMove = {
  opportunity: Opportunity;
  stageId: string;
  reason: string;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function numeric(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: currency || 'KES',
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return (
      (currency || 'KES') +
      ' ' +
      value.toLocaleString('en-KE', { maximumFractionDigits: 2 })
    );
  }
}

function totalsByCurrency(rows: Opportunity[], weighted = false): string {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = (row.currency || 'KES').toUpperCase();
    const amount =
      numeric(row.expected_value) *
      (weighted ? numeric(row.probability) / 100 : 1);
    totals.set(currency, (totals.get(currency) || 0) + amount);
  }
  return (
    [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => formatMoney(amount, currency))
      .join(' · ') || '—'
  );
}

function dateLabel(value: string | null): string {
  if (!value) return 'No close date';
  const date = new Date(String(value).slice(0, 10) + 'T00:00:00');
  return Number.isNaN(date.getTime())
    ? String(value).slice(0, 10)
    : date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function SalesPipelineBoard({
  data,
  busy,
  request,
  showSuccess,
  showError,
}: Props) {
  const [board, setBoard] = useState<PipelinePayload | null>(null);
  const [selectedPipelineId, setSelectedPipelineId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [stageDraft, setStageDraft] = useState<StageDraft | null>(null);
  const [savingStage, setSavingStage] = useState(false);
  const [archivingStageId, setArchivingStageId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

  const { overlay, closeOverlay, showSuccess: showOverlaySuccess, showWarning } =
    useSaMiOverlay();

  const loadBoard = useCallback(async () => {
    setLoading(true);
    try {
      const query = selectedPipelineId
        ? '/api/apps/sales?pipeline=1&pipelineId=' +
          encodeURIComponent(selectedPipelineId)
        : '/api/apps/sales?pipeline=1';
      const response = await fetch(query, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const body = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        pipeline?: PipelinePayload;
        error?: string;
      };
      if (!response.ok || body.success !== true || !body.pipeline) {
        throw new Error(
          body.error || 'SaMi could not load the opportunity pipeline.',
        );
      }
      setBoard(body.pipeline);
      if (!selectedPipelineId && body.pipeline.activePipelineId) {
        setSelectedPipelineId(body.pipeline.activePipelineId);
      }
    } catch (error) {
      showError(
        'Pipeline could not load',
        error instanceof Error
          ? error.message
          : 'SaMi could not load the opportunity pipeline.',
      );
    } finally {
      setLoading(false);
    }
  }, [selectedPipelineId, showError]);

  useEffect(() => {
    void loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadBoard]);

  const stages = useMemo(
    () =>
      [...(board?.stages || [])].sort(
        (a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name),
      ),
    [board],
  );
  const openStages = useMemo(
    () => stages.filter((stage) => stage.stage_type === 'open'),
    [stages],
  );
  const opportunities = useMemo(() => board?.opportunities || [], [board]);

  const filteredOpportunities = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return opportunities;
    return opportunities.filter((item) =>
      [
        item.opportunity_number,
        item.name,
        item.customer_name,
        item.contact_name,
        item.email,
        item.phone,
        item.source,
        item.stage_name,
      ].some((value) => String(value || '').toLowerCase().includes(query)),
    );
  }, [opportunities, search]);

  const opportunitiesByStage = useMemo(() => {
    const grouped = new Map<string, Opportunity[]>();
    for (const stage of stages) grouped.set(stage.id, []);
    for (const opportunity of filteredOpportunities) {
      grouped.get(opportunity.stage_id)?.push(opportunity);
    }
    return grouped;
  }, [filteredOpportunities, stages]);

  const openOpportunities = opportunities.filter(
    (item) => item.stage_type === 'open',
  );
  const overdueCount = openOpportunities.filter(
    (item) =>
      item.expected_close_date &&
      item.expected_close_date.slice(0, 10) <
        new Date().toISOString().slice(0, 10),
  ).length;
  const isBusy = busy || loading || savingStage;

  /* ------------------------------------------------------------------------ */
  /*  Actions                                                                 */
  /* ------------------------------------------------------------------------ */

  async function commitMove(
    opportunity: Opportunity,
    stageId: string,
    reason = '',
  ) {
    try {
      await request({
        action: 'move_opportunity',
        opportunityId: opportunity.id,
        stageId,
        reason,
      });
      setPendingMove(null);
      showSuccess(
        'Opportunity moved',
        'The stage change and opportunity audit history have been saved.',
      );
      await loadBoard();
    } catch (error) {
      showError(
        'Stage could not change',
        error instanceof Error
          ? error.message
          : 'SaMi could not move this opportunity.',
      );
    }
  }

  function onStageChange(opportunity: Opportunity, stageId: string) {
    if (!stageId || stageId === opportunity.stage_id) return;
    const target = stages.find((stage) => stage.id === stageId);
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
    if (
      !name ||
      !Number.isFinite(probability) ||
      probability < 0 ||
      probability > 100
    ) {
      showWarning(
        'Stage details are invalid',
        'Enter a stage name and a probability from 0 to 100.',
      );
      return;
    }

    setSavingStage(true);
    try {
      await request(
        stageDraft.id
          ? {
              action: 'update_pipeline_stage',
              stageId: stageDraft.id,
              name,
              probability,
            }
          : {
              action: 'create_pipeline_stage',
              pipelineId: board.activePipelineId,
              name,
              probability,
            },
      );
      showOverlaySuccess(
        stageDraft.id ? 'Stage updated' : 'Stage created',
        stageDraft.id
          ? 'The stage settings have been saved.'
          : 'The new stage is ready for opportunities.',
      );
      setStageDraft(null);
      await loadBoard();
    } catch (error) {
      showError(
        'Stage could not be saved',
        error instanceof Error
          ? error.message
          : 'SaMi could not save this stage.',
      );
    } finally {
      setSavingStage(false);
    }
  }

  async function archiveStage(stage: PipelineStage) {
    try {
      const result = await request({
        action: 'archive_pipeline_stage',
        stageId: stage.id,
      });
      const moved = Number(result.movedOpportunities || 0);
      showSuccess(
        'Stage archived',
        moved
          ? moved +
              ' opportunity record(s) moved to the next active stage; transition history was recorded.'
          : 'The stage is archived and no longer available for new opportunities.',
      );
      setArchivingStageId(null);
      await loadBoard();
    } catch (error) {
      showError(
        'Stage could not be archived',
        error instanceof Error
          ? error.message
          : 'SaMi could not archive this stage.',
      );
    }
  }

  async function reorderStages(stageId: string, direction: -1 | 1) {
    if (!board) return;
    const index = openStages.findIndex((stage) => stage.id === stageId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= openStages.length) return;
    const ordered = [...openStages];
    [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
    try {
      await request({
        action: 'reorder_pipeline_stages',
        pipelineId: board.activePipelineId,
        stageIds: ordered.map((stage) => stage.id),
      });
      await loadBoard();
    } catch (error) {
      showError(
        'Stage order could not change',
        error instanceof Error
          ? error.message
          : 'SaMi could not reorder these stages.',
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /*  Render                                                                 */
  /* ------------------------------------------------------------------------ */

  return (
    <section className="space-y-4">
      <SaMiOverlay {...overlay} onClose={closeOverlay} />

      {/* ------------------------------------------------------------------ */}
      {/* Page header                                                        */}
      {/* ------------------------------------------------------------------ */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            Sales workspace · Pipeline board
          </p>
          <h1 className="mt-1 text-lg font-black tracking-tight">
            Opportunity pipeline
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Work real opportunities by stage, monitor weighted value, and keep
            every move in the opportunity audit trail.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/apps/sales/opportunities"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Manage leads &amp; opportunities
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void loadBoard()}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Refresh
          </button>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* KPI strip                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<Target className="h-4 w-4" aria-hidden="true" />}
          label="Open opportunities"
          value={String(openOpportunities.length)}
          detail="Deals still in progress"
        />
        <KpiCard
          icon={<CircleDollarSign className="h-4 w-4" aria-hidden="true" />}
          label="Open pipeline"
          value={totalsByCurrency(openOpportunities)}
          detail="Grouped by transaction currency"
          valueIsMoney
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
          label="Weighted pipeline"
          value={totalsByCurrency(openOpportunities, true)}
          detail="Expected value × probability"
          valueIsMoney
          tone="success"
        />
        <KpiCard
          icon={<Clock3 className="h-4 w-4" aria-hidden="true" />}
          label="Past close date"
          value={String(overdueCount)}
          detail="Open deals with overdue close dates"
          tone={overdueCount > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Pipeline & search                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <label className="sr-only" htmlFor="sales-pipeline-select">
                Select pipeline
              </label>
              <select
                id="sales-pipeline-select"
                value={selectedPipelineId || board?.activePipelineId || ''}
                onChange={(event) => setSelectedPipelineId(event.target.value)}
                disabled={isBusy || (board?.pipelines.length || 0) < 2}
                className="h-9 min-w-[220px] appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-xs font-black focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
              >
                {(board?.pipelines || []).map((pipeline) => (
                  <option key={pipeline.id} value={pipeline.id}>
                    {pipeline.name}
                    {pipeline.is_default ? ' · Default' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              />
            </div>

            <label className="relative block min-w-0 sm:min-w-[260px]">
              <span className="sr-only">Search opportunities</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search opportunities"
                className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
              />
            </label>
          </div>

          {data.capabilities.canManagePipelineStages ? (
            <button
              type="button"
              disabled={isBusy || !board?.activePipelineId}
              onClick={() =>
                setStageDraft({ id: null, name: '', probability: '20' })
              }
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-3 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              New stage
            </button>
          ) : null}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Stage editor                                                       */}
      {/* ------------------------------------------------------------------ */}
      {stageDraft ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <form onSubmit={saveStage} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-black">
                  {stageDraft.id ? 'Edit pipeline stage' : 'Create pipeline stage'}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Won and Lost remain protected terminal stages. Reorder open
                  stages from the board.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStageDraft(null)}
                aria-label="Close stage editor"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end">
              <FieldInput
                label="Stage name"
                value={stageDraft.name}
                onChange={(value) =>
                  setStageDraft((current) =>
                    current ? { ...current, name: value } : current,
                  )
                }
                required
                maxLength={120}
                autoFocus
                placeholder="e.g. Proposal review"
              />
              <FieldInput
                label="Default probability (%)"
                type="number"
                min={0}
                max={100}
                step={1}
                value={stageDraft.probability}
                onChange={(value) =>
                  setStageDraft((current) =>
                    current ? { ...current, probability: value } : current,
                  )
                }
                required
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isBusy}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                >
                  {savingStage ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {savingStage ? 'Saving…' : 'Save stage'}
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => setStageDraft(null)}
                  className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Lost-stage modal                                                   */}
      {/* ------------------------------------------------------------------ */}
      {pendingMove ? (
        <div
          role="dialog"
          aria-labelledby="lost-stage-title"
          className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/30"
        >
          <h2
            id="lost-stage-title"
            className="text-sm font-black text-amber-900 dark:text-amber-200"
          >
            Record the loss reason
          </h2>
          <p className="mt-1 text-xs leading-5 text-amber-900/80 dark:text-amber-200/80">
            Moving &ldquo;{pendingMove.opportunity.name}&rdquo; to Lost requires
            an auditable reason.
          </p>
          <form
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (pendingMove.reason.trim()) {
                void commitMove(
                  pendingMove.opportunity,
                  pendingMove.stageId,
                  pendingMove.reason.trim(),
                );
              }
            }}
          >
            <textarea
              value={pendingMove.reason}
              onChange={(event) =>
                setPendingMove((current) =>
                  current ? { ...current, reason: event.target.value } : current,
                )
              }
              required
              maxLength={2000}
              rows={3}
              placeholder="Explain why the deal was lost."
              aria-label="Reason for losing opportunity"
              className="w-full rounded-xl border border-amber-300 bg-white p-3 text-sm text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:border-amber-900 dark:bg-slate-950 dark:text-slate-100"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy || !pendingMove.reason.trim()}
                className="inline-flex h-9 items-center rounded-xl bg-rose-700 px-3 text-xs font-black text-white transition hover:bg-rose-600 disabled:opacity-60"
              >
                Confirm lost stage
              </button>
              <button
                type="button"
                onClick={() => setPendingMove(null)}
                className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Board                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
          <div>
            <h2 className="text-sm font-black">Opportunity stages</h2>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {filteredOpportunities.length} of {opportunities.length}{' '}
              opportunities shown
            </p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
            Move a deal by selecting a destination stage on its card
          </span>
        </div>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {[1, 2, 3, 4, 5].map((item) => (
              <div
                key={item}
                className="h-60 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60"
              />
            ))}
          </div>
        ) : stages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center dark:border-slate-700">
            <div
              aria-hidden="true"
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
            >
              <Target className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-black">No active pipeline stages</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
              Create an open stage to start organizing opportunities.
            </p>
          </div>
        ) : (
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
            {stages.map((stage, stageIndex) => {
              const cards = opportunitiesByStage.get(stage.id) || [];
              const isOpen = stage.stage_type === 'open';
              const isWon = stage.stage_type === 'won';
              const isLost = stage.stage_type === 'lost';
              const stageTone = isWon
                ? 'border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/60 dark:bg-emerald-950/20'
                : isLost
                  ? 'border-red-200 bg-red-50/30 dark:border-red-900/60 dark:bg-red-950/20'
                  : 'border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/30';

              return (
                <section
                  key={stage.id}
                  className={`flex w-[min(84vw,320px)] shrink-0 flex-col rounded-2xl border ${stageTone} p-3`}
                >
                  <header className="mb-3 border-b border-slate-200 pb-3 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-black">
                            {stage.name}
                          </h3>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black tabular-nums ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
                            {cards.length}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
                          {isOpen
                            ? `${Number(stage.probability).toFixed(0)}% default probability`
                            : isWon
                              ? 'Closed won'
                              : 'Closed lost'}
                        </p>
                      </div>

                      {data.capabilities.canManagePipelineStages && isOpen ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            disabled={isBusy || stageIndex === 0}
                            onClick={() => void reorderStages(stage.id, -1)}
                            aria-label={`Move ${stage.name} earlier`}
                            title="Move stage earlier"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:opacity-30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={
                              isBusy || stageIndex >= openStages.length - 1
                            }
                            onClick={() => void reorderStages(stage.id, 1)}
                            aria-label={`Move ${stage.name} later`}
                            title="Move stage later"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:opacity-30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              setStageDraft({
                                id: stage.id,
                                name: stage.name,
                                probability: String(stage.probability),
                              })
                            }
                            aria-label={`Edit ${stage.name}`}
                            title="Edit stage"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <Pencil className="h-3 w-3" aria-hidden="true" />
                          </button>
                          {archivingStageId === stage.id ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void archiveStage(stage)}
                              className="inline-flex h-7 items-center rounded-lg bg-rose-700 px-2 text-[10px] font-black text-white transition hover:bg-rose-600 disabled:opacity-60"
                            >
                              Confirm archive
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy || openStages.length <= 1}
                              onClick={() => setArchivingStageId(stage.id)}
                              aria-label={`Archive ${stage.name}`}
                              title="Archive stage"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition hover:bg-red-50 disabled:opacity-30 dark:border-red-900/60 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/40"
                            >
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>

                    {archivingStageId === stage.id ? (
                      <div className="mt-2 rounded-xl border border-red-200 bg-red-50/60 p-2 dark:border-red-900/60 dark:bg-red-950/30">
                        <p className="text-[10px] leading-4 text-red-700 dark:text-red-200">
                          Opportunities in this stage move to the next active
                          open stage, and each transition is recorded.
                        </p>
                        <button
                          type="button"
                          onClick={() => setArchivingStageId(null)}
                          className="mt-1 text-[10px] font-black text-red-700 underline dark:text-red-200"
                        >
                          Cancel archive
                        </button>
                      </div>
                    ) : null}

                    <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
                      Stage value · {totalsByCurrency(cards)}
                    </p>
                    {isOpen ? (
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
                        Weighted · {totalsByCurrency(cards, true)}
                      </p>
                    ) : null}
                  </header>

                  <div className="flex-1 space-y-2">
                    {cards.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        No opportunities in this stage
                      </div>
                    ) : (
                      cards.map((opportunity) => (
                        <article
                          key={opportunity.id}
                          className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[10px] font-black uppercase tracking-[0.08em] text-indigo-600 dark:text-indigo-400">
                                {opportunity.opportunity_number}
                              </p>
                              <h4 className="mt-0.5 break-words text-xs font-black leading-5">
                                {opportunity.name}
                              </h4>
                            </div>
                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black tabular-nums dark:bg-slate-800">
                              {Number(opportunity.probability).toFixed(0)}%
                            </span>
                          </div>

                          <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {opportunity.customer_name ||
                              opportunity.contact_name ||
                              'Customer not specified'}
                          </p>

                          <p className="mt-1.5 text-sm font-black tabular-nums">
                            {formatMoney(
                              numeric(opportunity.expected_value),
                              opportunity.currency,
                            )}
                          </p>

                          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1">
                              <Clock3 className="h-3 w-3" aria-hidden="true" />
                              {dateLabel(opportunity.expected_close_date)}
                            </span>
                            <span>{opportunity.source || 'No source'}</span>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <div className="relative min-w-0 flex-1">
                              <label className="sr-only">
                                Move {opportunity.name} to stage
                              </label>
                              <select
                                aria-label={`Move ${opportunity.name} to stage`}
                                value={opportunity.stage_id}
                                onChange={(event) =>
                                  onStageChange(opportunity, event.target.value)
                                }
                                disabled={
                                  isBusy || !data.capabilities.canMovePipeline
                                }
                                className="h-8 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-2 pr-7 text-[10px] font-bold focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
                              >
                                {stages.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.name}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown
                                aria-hidden="true"
                                className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400"
                              />
                            </div>

                            {opportunity.latest_quote_id ? (
                              <Link
                                href={
                                  '/apps/sales/quotes/' +
                                  encodeURIComponent(opportunity.latest_quote_id)
                                }
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                Quote
                                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                              </Link>
                            ) : null}
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

type KpiTone = 'default' | 'success' | 'warning';

const KPI_TONES: Record<
  KpiTone,
  { iconBg: string; iconFg: string; ring: string }
> = {
  default: {
    iconBg: 'bg-slate-100 dark:bg-slate-800/60',
    iconFg: 'text-slate-600 dark:text-slate-300',
    ring: '',
  },
  success: {
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    iconFg: 'text-emerald-600 dark:text-emerald-400',
    ring: 'ring-1 ring-emerald-500/10 dark:ring-emerald-500/20',
  },
  warning: {
    iconBg: 'bg-amber-50 dark:bg-amber-950/40',
    iconFg: 'text-amber-600 dark:text-amber-400',
    ring: 'ring-1 ring-amber-500/10 dark:ring-amber-500/20',
  },
};

function KpiCard({
  icon,
  label,
  value,
  detail,
  tone = 'default',
  valueIsMoney = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: KpiTone;
  valueIsMoney?: boolean;
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
      <p
        className={`mt-2 break-words font-black tabular-nums tracking-tight ${
          valueIsMoney ? 'text-base leading-6' : 'text-2xl'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
        {detail}
      </p>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  maxLength,
  min,
  max,
  step,
  autoFocus,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        required={required}
        maxLength={maxLength}
        min={min}
        max={max}
        step={step}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm tabular-nums focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
      />
    </label>
  );
}