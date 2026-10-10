'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Archive,
  ArrowRight,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  GripVertical,
  History,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';

import type {
  SalesPipelineBoardData,
  SalesPipelineStage,
  SalesStageHistoryEntry,
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';


type Props = {
  data: SalesWorkspaceData;
  busy: boolean;
  request: (
    payload: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  showSuccess: (
    title: string,
    message: string,
  ) => void;
  showError: (
    title: string,
    message: string,
  ) => void;
};


type BoardCard = {
  id: string;
  quoteNumber: string;
  customerName: string;
  totalAmount: number;
  currency: string;
  probability: number;
  expectedCloseDate: string | null;
  stageId: string | null;
  stageCode: string | null;
  stageName: string | null;
};


type StageDraft = {
  id: string | null;
  code: string;
  name: string;
  sequence: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
  foldInKanban: boolean;
  description: string;
  color: string;
  isActive: boolean;
};


function money(
  value: number,
  currency: string,
) {
  try {
    return new Intl.NumberFormat(
      'en-KE',
      {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      },
    ).format(value);
  } catch {
    return currency + ' ' + value.toLocaleString();
  }
}


function emptyDraft(): StageDraft {
  return {
    id: null,
    code: '',
    name: '',
    sequence: 10,
    probability: 0,
    isWon: false,
    isLost: false,
    foldInKanban: false,
    description: '',
    color: '',
    isActive: true,
  };
}


function draftFromStage(
  stage: SalesPipelineStage,
): StageDraft {
  return {
    id: stage.id,
    code: stage.code,
    name: stage.name,
    sequence: stage.sequence,
    probability: stage.probability,
    isWon: stage.isWon,
    isLost: stage.isLost,
    foldInKanban: stage.foldInKanban,
    description: stage.description || '',
    color: stage.color || '',
    isActive: stage.isActive,
  };
}


export default function SalesPipelineBoard({
  data,
  busy,
  request,
  showSuccess,
  showError,
}: Props) {
  const [
    board,
    setBoard,
  ] =
    useState<SalesPipelineBoardData | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    drawerOpen,
    setDrawerOpen,
  ] =
    useState(false);

  const [
    draft,
    setDraft,
  ] =
    useState<StageDraft>(
      emptyDraft(),
    );

  const [
    draggingQuoteId,
    setDraggingQuoteId,
  ] =
    useState<string | null>(null);

  const [
    hoverStageId,
    setHoverStageId,
  ] =
    useState<string | null>(null);

  const [
    historyQuoteId,
    setHistoryQuoteId,
  ] =
    useState<string | null>(null);

  const [
    history,
    setHistory,
  ] =
    useState<SalesStageHistoryEntry[]>(
      [],
    );

  const [
    historyLoading,
    setHistoryLoading,
  ] =
    useState(false);

  const loadBoard =
    useCallback(
      async () => {
        setLoading(true);

        try {
          const response =
            await fetch(
              '/api/apps/sales?pipeline=1',
              {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: {
                  Accept: 'application/json',
                },
              },
            );

          const body =
            await response
              .json()
              .catch(() => ({})) as {
                success?: boolean;
                pipeline?: SalesPipelineBoardData;
                error?: string;
              };

          if (
            !response.ok ||
            body.success !== true ||
            !body.pipeline
          ) {
            throw new Error(
              body.error ||
              'SaMi could not load the pipeline board.',
            );
          }

          setBoard(body.pipeline);
        } catch (error) {
          showError(
            'Pipeline could not load',
            error instanceof Error
              ? error.message
              : 'SaMi could not load the pipeline board.',
          );
        } finally {
          setLoading(false);
        }
      },
      [showError],
    );

  useEffect(
    () => {
      void loadBoard();
    },
    [loadBoard],
  );

  const stages =
    useMemo(
      () => board?.stages || [],
      [board],
    );

  const quotes =
    useMemo(
      () => (board?.quotes || []) as BoardCard[],
      [board],
    );

  const quotesByStage =
    useMemo(
      () => {
        const map =
          new Map<
            string,
            BoardCard[]
          >();

        for (const stage of stages) {
          map.set(stage.id, []);
        }

        const unassigned:
          BoardCard[] = [];

        for (const quote of quotes) {
          if (
            quote.stageId &&
            map.has(quote.stageId)
          ) {
            map
              .get(quote.stageId)!
              .push(quote);
          } else {
            unassigned.push(quote);
          }
        }

        return {
          map,
          unassigned,
        };
      },
      [stages, quotes],
    );

  const totals =
    board?.totals || {
      openPipeline: 0,
      weightedPipeline: 0,
      byStage: [],
    };

  const baseCurrency =
    data.company.currency;

  const canManage =
    data.capabilities.canManagePipelineStages;

  const canMove =
    data.capabilities.canMovePipeline;

  const moveQuote =
    useCallback(
      async (
        quoteId: string,
        stageId: string,
      ) => {
        try {
          await request({
            action: 'move_quote_stage',
            quoteId,
            stageId,
          });

          showSuccess(
            'Stage updated',
            'The quotation moved to the selected pipeline stage.',
          );

          await loadBoard();
        } catch (error) {
          showError(
            'Stage could not change',
            error instanceof Error
              ? error.message
              : 'SaMi could not move this quotation.',
          );
        }
      },
      [
        request,
        showSuccess,
        showError,
        loadBoard,
      ],
    );

  const saveStage =
    useCallback(
      async () => {
        if (
          !draft.name.trim() ||
          !draft.code.trim()
        ) {
          showError(
            'Stage is incomplete',
            'Stage code and name are required.',
          );
          return;
        }

        try {
          if (draft.id) {
            await request({
              action: 'update_pipeline_stage',
              stageId: draft.id,
              name: draft.name,
              sequence: draft.sequence,
              probability: draft.probability,
              isWon: draft.isWon,
              isLost: draft.isLost,
              foldInKanban: draft.foldInKanban,
              description: draft.description,
              color: draft.color,
              isActive: draft.isActive,
            });

            showSuccess(
              'Stage saved',
              'The pipeline stage was updated.',
            );
          } else {
            await request({
              action: 'create_pipeline_stage',
              code: draft.code,
              name: draft.name,
              sequence: draft.sequence,
              probability: draft.probability,
              isWon: draft.isWon,
              isLost: draft.isLost,
              foldInKanban: draft.foldInKanban,
              description: draft.description,
              color: draft.color,
              isActive: draft.isActive,
            });

            showSuccess(
              'Stage created',
              'The pipeline stage is now active.',
            );
          }

          setDrawerOpen(false);
          setDraft(emptyDraft());
          await loadBoard();
        } catch (error) {
          showError(
            'Stage could not be saved',
            error instanceof Error
              ? error.message
              : 'SaMi could not save this stage.',
          );
        }
      },
      [
        draft,
        request,
        showSuccess,
        showError,
        loadBoard,
      ],
    );

  const archiveStage =
    useCallback(
      async (stageId: string) => {
        try {
          await request({
            action: 'archive_pipeline_stage',
            stageId,
          });

          showSuccess(
            'Stage archived',
            'Open quotations were moved before archiving.',
          );

          await loadBoard();
        } catch (error) {
          showError(
            'Stage could not be archived',
            error instanceof Error
              ? error.message
              : 'SaMi could not archive this stage.',
          );
        }
      },
      [
        request,
        showSuccess,
        showError,
        loadBoard,
      ],
    );

  const reorder =
    useCallback(
      async (orderedIds: string[]) => {
        try {
          await request({
            action: 'reorder_pipeline_stages',
            stageIds: orderedIds,
          });

          await loadBoard();
        } catch (error) {
          showError(
            'Order could not change',
            error instanceof Error
              ? error.message
              : 'SaMi could not reorder stages.',
          );
        }
      },
      [
        request,
        showError,
        loadBoard,
      ],
    );

  const openHistory =
    useCallback(
      async (quoteId: string) => {
        setHistoryQuoteId(quoteId);
        setHistoryLoading(true);

        try {
          const response =
            await fetch(
              '/api/apps/sales?stageHistoryFor=' +
                encodeURIComponent(quoteId),
              {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: {
                  Accept: 'application/json',
                },
              },
            );

          const body =
            await response
              .json()
              .catch(() => ({})) as {
                success?: boolean;
                history?: SalesStageHistoryEntry[];
              };

          setHistory(body.history || []);
        } catch {
          setHistory([]);
        } finally {
          setHistoryLoading(false);
        }
      },
      [],
    );

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sami-surface rounded-[22px] p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
              Open pipeline
            </p>
            <Layers className="h-4 w-4 text-blue-600 dark:text-blue-300" />
          </div>
          <p className="mt-2 text-xl font-black">
            {
              money(
                totals.openPipeline,
                baseCurrency,
              )
            }
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            All open quotes in base currency
          </p>
        </div>

        <div className="sami-surface rounded-[22px] p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
              Weighted pipeline
            </p>
            <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
          </div>
          <p className="mt-2 text-xl font-black">
            {
              money(
                totals.weightedPipeline,
                baseCurrency,
              )
            }
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Probability-adjusted pipeline value
          </p>
        </div>

        <div className="sami-surface rounded-[22px] p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
              Active stages
            </p>
            <Target className="h-4 w-4 text-slate-500" />
          </div>
          <p className="mt-2 text-xl font-black">
            {
              stages.filter(
                stage =>
                  stage.isActive,
              ).length
            }
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {
              quotes.length
            }{' '}
            open quotes across stages
          </p>
        </div>
      </div>

      <div className="sami-surface flex flex-col gap-3 rounded-[22px] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-sm font-black">
            Pipeline board
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Drag quotations across stages or open a stage to manage probability, ordering and archive rules.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={
              loading ||
              busy
            }
            onClick={
              () =>
                void loadBoard()
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-60"
          >
            <RefreshCw
              className={[
                'h-4 w-4',
                loading
                  ? 'animate-spin'
                  : '',
              ].join(
                ' ',
              )}
            />
            Refresh board
          </button>

          {
            canManage &&
            (
              <button
                type="button"
                onClick={
                  () => {
                    setDraft(
                      emptyDraft(),
                    );
                    setDrawerOpen(
                      true,
                    );
                  }
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-black text-white"
              >
                <Plus className="h-4 w-4" />
                New stage
              </button>
            )
          }
        </div>
      </div>

      {
        loading &&
        !board
          ? (
              <div className="sami-surface rounded-[22px] p-8 text-center text-sm text-slate-500">
                Loading pipeline…
              </div>
            )
          : (
              <div className="grid gap-3 lg:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
                {
                  stages.map(
                    (
                      stage,
                      index,
                    ) => {
                      const cards =
                        quotesByStage
                          .map
                          .get(
                            stage.id,
                          ) ||
                        [];

                      const stageTotals =
                        totals.byStage.find(
                          entry =>
                            entry.stageId ===
                            stage.id,
                        );

                      const isHover =
                        hoverStageId ===
                          stage.id;

                      return (
                        <div
                          key={
                            stage.id
                          }
                          onDragOver={
                            event => {
                              if (
                                !canMove
                              ) {
                                return;
                              }

                              event.preventDefault();
                              setHoverStageId(
                                stage.id,
                              );
                            }
                          }
                          onDragLeave={
                            () => {
                              if (
                                hoverStageId ===
                                stage.id
                              ) {
                                setHoverStageId(
                                  null,
                                );
                              }
                            }
                          }
                          onDrop={
                            event => {
                              event.preventDefault();
                              setHoverStageId(
                                null,
                              );

                              const quoteId =
                                draggingQuoteId;

                              setDraggingQuoteId(
                                null,
                              );

                              if (
                                !canMove ||
                                !quoteId
                              ) {
                                return;
                              }

                              const card =
                                quotes.find(
                                  quote =>
                                    quote.id ===
                                    quoteId,
                                );

                              if (
                                !card ||
                                card.stageId ===
                                  stage.id
                              ) {
                                return;
                              }

                              void moveQuote(
                                quoteId,
                                stage.id,
                              );
                            }
                          }
                          className={[
                            'sami-surface flex min-h-[360px] flex-col rounded-[22px] p-3 transition',
                            isHover
                              ? 'ring-2 ring-blue-500/60'
                              : '',
                          ].join(
                            ' ',
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-full"
                                  style={{
                                    backgroundColor:
                                      stage.color ||
                                      '#2563eb',
                                  }}
                                />
                                <p className="truncate text-sm font-black">
                                  {
                                    stage.name
                                  }
                                </p>
                              </div>
                              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                                {
                                  Math.round(
                                    stage.probability,
                                  )
                                }
                                % win
                                {
                                  stage.isWon
                                    ? ' · Won'
                                    : ''
                                }
                                {
                                  stage.isLost
                                    ? ' · Lost'
                                    : ''
                                }
                              </p>
                            </div>

                            {
                              canManage &&
                              (
                                <div className="flex items-center gap-1">
                                  {
                                    index >
                                      0 &&
                                    (
                                      <button
                                        type="button"
                                        title="Move stage earlier"
                                        onClick={
                                          () => {
                                            const ids =
                                              stages.map(
                                                item =>
                                                  item.id,
                                              );

                                            const currentIndex =
                                              ids.indexOf(
                                                stage.id,
                                              );

                                            if (
                                              currentIndex <=
                                                0
                                            ) {
                                              return;
                                            }

                                            [
                                              ids[
                                                currentIndex -
                                                  1
                                              ],
                                              ids[
                                                currentIndex
                                              ],
                                            ] = [
                                              ids[
                                                currentIndex
                                              ],
                                              ids[
                                                currentIndex -
                                                  1
                                              ],
                                            ];

                                            void reorder(
                                              ids,
                                            );
                                          }
                                        }
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--sami-border)] text-slate-500 hover:text-slate-900 dark:hover:text-white"
                                      >
                                        <ChevronUp className="h-3.5 w-3.5" />
                                      </button>
                                    )
                                  }
                                  {
                                    index <
                                      stages.length -
                                        1 &&
                                    (
                                      <button
                                        type="button"
                                        title="Move stage later"
                                        onClick={
                                          () => {
                                            const ids =
                                              stages.map(
                                                item =>
                                                  item.id,
                                              );

                                            const currentIndex =
                                              ids.indexOf(
                                                stage.id,
                                              );

                                            if (
                                              currentIndex ===
                                                -1 ||
                                              currentIndex >=
                                                ids.length -
                                                  1
                                            ) {
                                              return;
                                            }

                                            [
                                              ids[
                                                currentIndex +
                                                  1
                                              ],
                                              ids[
                                                currentIndex
                                              ],
                                            ] = [
                                              ids[
                                                currentIndex
                                              ],
                                              ids[
                                                currentIndex +
                                                  1
                                              ],
                                            ];

                                            void reorder(
                                              ids,
                                            );
                                          }
                                        }
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--sami-border)] text-slate-500 hover:text-slate-900 dark:hover:text-white"
                                      >
                                        <ChevronDown className="h-3.5 w-3.5" />
                                      </button>
                                    )
                                  }
                                  <button
                                    type="button"
                                    title="Edit stage"
                                    onClick={
                                      () => {
                                        setDraft(
                                          draftFromStage(
                                            stage,
                                          ),
                                        );
                                        setDrawerOpen(
                                          true,
                                        );
                                      }
                                    }
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--sami-border)] text-slate-500 hover:text-slate-900 dark:hover:text-white"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Archive stage"
                                    onClick={
                                      () =>
                                        void archiveStage(
                                          stage.id,
                                        )
                                    }
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--sami-border)] text-slate-500 hover:text-red-600"
                                  >
                                    <Archive className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )
                            }
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-[var(--sami-border)] p-2">
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                                Open
                              </p>
                              <p className="mt-0.5 text-xs font-black">
                                {
                                  money(
                                    stageTotals
                                      ?.openValue ||
                                    0,
                                    baseCurrency,
                                  )
                                }
                              </p>
                            </div>
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                                Weighted
                              </p>
                              <p className="mt-0.5 text-xs font-black">
                                {
                                  money(
                                    stageTotals
                                      ?.weightedValue ||
                                    0,
                                    baseCurrency,
                                  )
                                }
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 flex-1 space-y-2 overflow-y-auto">
                            {
                              cards.length ===
                                0
                                ? (
                                    <p className="rounded-xl border border-dashed border-[var(--sami-border)] p-4 text-center text-[11px] text-slate-400">
                                      {
                                        canMove
                                          ? 'Drop a quotation here.'
                                          : 'No quotations in this stage.'
                                      }
                                    </p>
                                  )
                                : cards.map(
                                    card => (
                                      <div
                                        key={
                                          card.id
                                        }
                                        draggable={
                                          canMove
                                        }
                                        onDragStart={
                                          () => {
                                            if (
                                              !canMove
                                            ) {
                                              return;
                                            }

                                            setDraggingQuoteId(
                                              card.id,
                                            );
                                          }
                                        }
                                        onDragEnd={
                                          () => {
                                            setDraggingQuoteId(
                                              null,
                                            );

                                            setHoverStageId(
                                              null,
                                            );
                                          }
                                        }
                                        className={[
                                          'group rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)]/60 p-3 transition',
                                          canMove
                                            ? 'cursor-grab active:cursor-grabbing'
                                            : '',
                                          draggingQuoteId ===
                                            card.id
                                            ? 'opacity-60'
                                            : '',
                                        ].join(
                                          ' ',
                                        )}
                                      >
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="min-w-0">
                                            <p className="truncate text-xs font-black">
                                              {
                                                card.quoteNumber
                                              }
                                            </p>
                                            <p className="mt-0.5 truncate text-[11px] text-slate-500">
                                              {
                                                card.customerName
                                              }
                                            </p>
                                          </div>

                                          {
                                            canMove &&
                                            (
                                              <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                                            )
                                          }
                                        </div>

                                        <div className="mt-2 flex items-center justify-between gap-2">
                                          <p className="text-xs font-black">
                                            {
                                              money(
                                                card.totalAmount,
                                                card.currency,
                                              )
                                            }
                                          </p>
                                          <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                                            {
                                              Math.round(
                                                card.probability,
                                              )
                                            }
                                            %
                                          </span>
                                        </div>

                                        {
                                          card.expectedCloseDate &&
                                          (
                                            <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
                                              <CalendarClock className="h-3 w-3" />
                                              {
                                                card.expectedCloseDate
                                              }
                                            </div>
                                          )
                                        }

                                        <div className="mt-2 flex items-center justify-between gap-2">
                                          <button
                                            type="button"
                                            onClick={
                                              () =>
                                                void openHistory(
                                                  card.id,
                                                )
                                            }
                                            className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                          >
                                            <History className="h-3 w-3" />
                                            History
                                          </button>

                                          <a
                                            href={
                                              '/apps/sales/quotes/' +
                                              card.id
                                            }
                                            className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-blue-700 hover:underline dark:text-blue-300"
                                          >
                                            Open
                                            <ArrowRight className="h-3 w-3" />
                                          </a>
                                        </div>
                                      </div>
                                    ),
                                  )
                            }
                          </div>
                        </div>
                      );
                    },
                  )
                }
              </div>
            )
      }

      {
        quotesByStage
          .unassigned
          .length >
          0 &&
        (
          <div className="sami-surface rounded-[22px] p-4">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-amber-600 dark:text-amber-300" />
              <h3 className="text-sm font-black">
                Unassigned quotations
              </h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              These quotations have no pipeline stage yet. Drop them onto a stage above to begin tracking them.
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {
                quotesByStage
                  .unassigned
                  .map(
                    card => (
                      <div
                        key={
                          card.id
                        }
                        className="rounded-xl border border-[var(--sami-border)] p-3"
                      >
                        <p className="text-xs font-black">
                          {
                            card.quoteNumber
                          }
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {
                            card.customerName
                          }
                        </p>
                        <p className="mt-2 text-xs font-black">
                          {
                            money(
                              card.totalAmount,
                              card.currency,
                            )
                          }
                        </p>
                      </div>
                    ),
                  )
              }
            </div>
          </div>
        )
      }

      {
        drawerOpen &&
        (
          <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-900/40 backdrop-blur-sm">
            <div className="h-full w-full max-w-md overflow-y-auto border-l border-[var(--sami-border)] bg-[var(--sami-surface)] p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black">
                    {
                      draft.id
                        ? 'Edit stage'
                        : 'New stage'
                    }
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Configure probability, order and kanban behavior. Won/Lost stages drive automatic quote status.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={
                    () => {
                      setDrawerOpen(
                        false,
                      );
                      setDraft(
                        emptyDraft(),
                      );
                    }
                  }
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--sami-border)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 grid gap-3">
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Code
                  </span>
                  <input
                    value={
                      draft.code
                    }
                    disabled={
                      Boolean(
                        draft.id,
                      )
                    }
                    onChange={
                      event =>
                        setDraft(
                          previous => ({
                            ...previous,
                            code:
                              event.target
                                .value,
                          }),
                        )
                    }
                    placeholder="e.g. negotiation"
                    className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm disabled:opacity-60"
                  />
                </label>

                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Name
                  </span>
                  <input
                    value={
                      draft.name
                    }
                    onChange={
                      event =>
                        setDraft(
                          previous => ({
                            ...previous,
                            name:
                              event.target
                                .value,
                          }),
                        )
                    }
                    placeholder="e.g. Negotiation"
                    className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                      Sequence
                    </span>
                    <input
                      type="number"
                      min={
                        0
                      }
                      value={
                        draft.sequence
                      }
                      onChange={
                        event =>
                          setDraft(
                            previous => ({
                              ...previous,
                              sequence:
                                Number(
                                  event.target
                                    .value,
                                ) ||
                                0,
                            }),
                          )
                      }
                      className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                      Probability %
                    </span>
                    <input
                      type="number"
                      min={
                        0
                      }
                      max={
                        100
                      }
                      value={
                        draft.probability
                      }
                      onChange={
                        event =>
                          setDraft(
                            previous => ({
                              ...previous,
                              probability:
                                Number(
                                  event.target
                                    .value,
                                ) ||
                                0,
                            }),
                          )
                      }
                      className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Color
                  </span>
                  <input
                    value={
                      draft.color
                    }
                    onChange={
                      event =>
                        setDraft(
                          previous => ({
                            ...previous,
                            color:
                              event.target
                                .value,
                          }),
                        )
                    }
                    placeholder="#2563eb"
                    className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                  />
                </label>

                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Description
                  </span>
                  <textarea
                    rows={
                      3
                    }
                    value={
                      draft.description
                    }
                    onChange={
                      event =>
                        setDraft(
                          previous => ({
                            ...previous,
                            description:
                              event.target
                                .value,
                          }),
                        )
                    }
                    className="mt-1 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
                  />
                </label>

                <div className="grid gap-2">
                  <label className="flex items-center gap-3 rounded-xl border border-[var(--sami-border)] p-3 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={
                        draft.isWon
                      }
                      onChange={
                        event =>
                          setDraft(
                            previous => ({
                              ...previous,
                              isWon:
                                event.target
                                  .checked,
                              isLost:
                                event.target
                                  .checked
                                  ? false
                                  : previous.isLost,
                            }),
                          )
                      }
                      className="h-4 w-4"
                    />
                    This is a Won stage
                  </label>

                  <label className="flex items-center gap-3 rounded-xl border border-[var(--sami-border)] p-3 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={
                        draft.isLost
                      }
                      onChange={
                        event =>
                          setDraft(
                            previous => ({
                              ...previous,
                              isLost:
                                event.target
                                  .checked,
                              isWon:
                                event.target
                                  .checked
                                  ? false
                                  : previous.isWon,
                            }),
                          )
                      }
                      className="h-4 w-4"
                    />
                    This is a Lost stage
                  </label>

                  <label className="flex items-center gap-3 rounded-xl border border-[var(--sami-border)] p-3 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={
                        draft.foldInKanban
                      }
                      onChange={
                        event =>
                          setDraft(
                            previous => ({
                              ...previous,
                              foldInKanban:
                                event.target
                                  .checked,
                            }),
                          )
                      }
                      className="h-4 w-4"
                    />
                    Fold in kanban by default
                  </label>

                  <label className="flex items-center gap-3 rounded-xl border border-[var(--sami-border)] p-3 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={
                        draft.isActive
                      }
                      onChange={
                        event =>
                          setDraft(
                            previous => ({
                              ...previous,
                              isActive:
                                event.target
                                  .checked,
                            }),
                          )
                      }
                      className="h-4 w-4"
                    />
                    Active
                  </label>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={
                    () => {
                      setDrawerOpen(
                        false,
                      );
                      setDraft(
                        emptyDraft(),
                      );
                    }
                  }
                  className="h-11 rounded-xl border border-[var(--sami-border)] px-4 text-sm font-black"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={
                    busy
                  }
                  onClick={
                    () =>
                      void saveStage()
                  }
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  Save stage
                </button>
              </div>
            </div>
          </div>
        )
      }

      {
        historyQuoteId &&
        (
          <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-900/40 backdrop-blur-sm">
            <div className="h-full w-full max-w-sm overflow-y-auto border-l border-[var(--sami-border)] bg-[var(--sami-surface)] p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black">
                    Stage history
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Every stage transition recorded for this quotation.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={
                    () => {
                      setHistoryQuoteId(
                        null,
                      );
                      setHistory(
                        [],
                      );
                    }
                  }
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--sami-border)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {
                  historyLoading
                    ? (
                        <p className="text-xs text-slate-500">
                          Loading history…
                        </p>
                      )
                    : history.length ===
                        0
                      ? (
                          <p className="text-xs text-slate-500">
                            No stage transitions yet.
                          </p>
                        )
                      : history.map(
                          entry => (
                            <div
                              key={
                                entry.id
                              }
                              className="rounded-xl border border-[var(--sami-border)] p-3"
                            >
                              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.08em] text-slate-400">
                                <ArrowRight className="h-3 w-3" />
                                {
                                  entry.fromStageName ||
                                  'Unassigned'
                                }
                                <ArrowRight className="h-3 w-3" />
                                {
                                  entry.toStageName ||
                                  'Unassigned'
                                }
                              </div>

                              <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                                <span>
                                  {
                                    entry.fromProbability ??
                                    0
                                  }
                                  % →{' '}
                                  {
                                    entry.toProbability ??
                                    0
                                  }
                                  %
                                </span>
                                <span>
                                  {
                                    new Date(
                                      entry.createdAt,
                                    )
                                      .toISOString()
                                      .slice(
                                        0,
                                        10,
                                      )
                                  }
                                </span>
                              </div>

                              {
                                entry.reason &&
                                (
                                  <p className="mt-2 text-[11px] text-slate-500">
                                    {
                                      entry.reason
                                    }
                                  </p>
                                )
                              }
                            </div>
                          ),
                        )
                }
              </div>
            </div>
          </div>
        )
      }
    </section>
  );
}