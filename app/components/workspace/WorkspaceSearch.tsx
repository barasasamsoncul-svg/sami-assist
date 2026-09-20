'use client';

import {
  Activity,
  AppWindow,
  Bell,
  Building2,
  FileText,
  HelpCircle,
  Home,
  LayoutGrid,
  Loader2,
  Search,
  Settings,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';

import {
  useRouter,
} from 'next/navigation';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import {
  getSaMiAppIcon,
} from '@/lib/apps/icon-registry';

import type {
  WorkspaceSearchKind,
  WorkspaceSearchResult,
} from '@/lib/search/types';

type SearchResponse = {
  success?: boolean;
  error?: string;
  results?: WorkspaceSearchResult[];
};

type SearchMode =
  | 'launcher'
  | 'page';

function iconFor(
  result:
    WorkspaceSearchResult,
): LucideIcon {
  if (
    result.kind ===
    'app'
  ) {
    return getSaMiAppIcon(
      result.iconKey ||
      result.source ||
      result.title,
    );
  }

  switch (
    result.iconKey
  ) {
    case 'home':
      return Home;
    case 'activity':
      return Activity;
    case 'bell':
      return Bell;
    case 'building':
      return Building2;
    case 'file':
      return FileText;
    case 'settings':
      return Settings;
    case 'layout-grid':
      return LayoutGrid;
    case 'user':
      return UserRound;
    case 'help':
      return HelpCircle;
    default:
      return result.kind ===
        'company'
        ? Building2
        : result.kind ===
            'person'
          ? UserRound
          : result.kind ===
              'file'
            ? FileText
            : Search;
  }
}

function groupLabel(
  kind:
    WorkspaceSearchKind,
) {
  switch (
    kind
  ) {
    case 'page':
      return 'Workspace';
    case 'app':
      return 'Apps';
    case 'company':
      return 'Companies';
    case 'person':
      return 'People';
    case 'file':
      return 'Files';
    case 'record':
      return 'Records';
  }
}

function useWorkspaceSearch(
  active:
    boolean,
) {
  const [
    query,
    setQuery,
  ] =
    useState(
      '',
    );

  const [
    results,
    setResults,
  ] =
    useState<
      WorkspaceSearchResult[]
    >(
      [],
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const load =
    useCallback(
      async (
        value:
          string,
      ) => {
        setLoading(
          true,
        );

        setError(
          null,
        );

        try {
          const params =
            new URLSearchParams();

          if (
            value.trim()
          ) {
            params.set(
              'q',
              value.trim(),
            );
          }

          params.set(
            'limit',
            '40',
          );

          const response =
            await fetch(
              '/api/workspace/search?' +
              params.toString(),
              {
                credentials:
                  'same-origin',
                cache:
                  'no-store',
                headers: {
                  Accept:
                    'application/json',
                },
              },
            );

          const data =
            await response
              .json() as
              SearchResponse;

          if (
            !response.ok ||
            !data.success
          ) {
            throw new Error(
              data.error ||
              'Workspace search could not be completed.',
            );
          }

          setResults(
            Array.isArray(
              data.results,
            )
              ? data.results
              : [],
          );
        } catch (
          candidate
        ) {
          setResults(
            [],
          );

          setError(
            candidate instanceof Error
              ? candidate.message
              : 'Workspace search could not be completed.',
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [],
    );

  useEffect(
    () => {
      if (
        !active
      ) {
        return;
      }

      const timer =
        window.setTimeout(
          () => {
            void load(
              query,
            );
          },
          query.trim()
            ? 160
            : 0,
        );

      return () =>
        window.clearTimeout(
          timer,
        );
    },
    [
      active,
      load,
      query,
    ],
  );

  return {
    query,
    setQuery,
    results,
    loading,
    error,
    reload:
      () =>
        load(
          query,
        ),
  };
}

function SearchSurface({
  mode,
  onClose,
}: {
  mode:
    SearchMode;
  onClose?:
    () => void;
}) {
  const router =
    useRouter();

  const inputRef =
    useRef<
      HTMLInputElement | null
    >(
      null,
    );

  const {
    query,
    setQuery,
    results,
    loading,
    error,
    reload,
  } =
    useWorkspaceSearch(
      true,
    );

  const [
    selectedIndex,
    setSelectedIndex,
  ] =
    useState(
      0,
    );

  const [
    actionBusy,
    setActionBusy,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const [
    actionError,
    setActionError,
  ] =
    useState<
      string | null
    >(
      null,
    );

  useEffect(
    () => {
      setSelectedIndex(
        0,
      );
    },
    [
      query,
      results.length,
    ],
  );

  useEffect(
    () => {
      window.setTimeout(
        () =>
          inputRef
            .current
            ?.focus(),
        10,
      );
    },
    [],
  );

  const grouped =
    useMemo(
      () => {
        const order:
          WorkspaceSearchKind[] =
          [
            'page',
            'app',
            'company',
            'person',
            'file',
            'record',
          ];

        return order
          .map(
            kind => ({
              kind,
              items:
                results.filter(
                  result =>
                    result.kind ===
                    kind,
                ),
            }),
          )
          .filter(
            group =>
              group.items
                .length >
              0,
          );
      },
      [
        results,
      ],
    );

  const displayResults =
    useMemo(
      () =>
        grouped.flatMap(
          group =>
            group.items,
        ),
      [
        grouped,
      ],
    );

  async function runResult(
    result:
      WorkspaceSearchResult,
  ) {
    setActionError(
      null,
    );

    if (
      result.href
    ) {
      onClose?.();
      router.push(
        result.href,
      );
      return;
    }

    if (
      !result.action
    ) {
      return;
    }

    setActionBusy(
      result.id,
    );

    try {
      if (
        result.action.type ===
        'switch_company'
      ) {
        const response =
          await fetch(
            '/api/workspace/company-context',
            {
              method:
                'PATCH',
              credentials:
                'same-origin',
              cache:
                'no-store',
              headers: {
                'Content-Type':
                  'application/json',
                Accept:
                  'application/json',
              },
              body:
                JSON.stringify({
                  action:
                    'set_current',
                  companyId:
                    result.action
                      .companyId,
                }),
            },
          );

        const data =
          await response
            .json();

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.error ||
            'Company could not be switched.',
          );
        }

        window.dispatchEvent(
          new CustomEvent(
            'sami:company-context-changed',
          ),
        );

        if (
          mode ===
          'launcher'
        ) {
          onClose?.();
        }

        router.refresh();

        if (
          mode ===
          'page'
        ) {
          await reload();
        }

        return;
      }

      if (
        result.action.type ===
        'message_user'
      ) {
        onClose?.();

        router.push(
          '/notifications?tab=messages&compose=' +
          encodeURIComponent(
            result.action
              .userId,
          ),
        );

        return;
      }

      if (
        result.action.type ===
        'download_file'
      ) {
        window.location.assign(
          '/api/workspace/files/' +
          encodeURIComponent(
            result.action
              .fileId,
          ) +
          '/download',
        );
      }
    } catch (
      candidate
    ) {
      setActionError(
        candidate instanceof Error
          ? candidate.message
          : 'Search action could not be completed.',
      );
    } finally {
      setActionBusy(
        null,
      );
    }
  }

  function handleKeyDown(
    event:
      ReactKeyboardEvent<HTMLInputElement>,
  ) {
    if (
      event.key ===
        'Escape' &&
      onClose
    ) {
      event.preventDefault();
      onClose();
      return;
    }

    if (
      displayResults.length ===
      0
    ) {
      return;
    }

    if (
      event.key ===
      'ArrowDown'
    ) {
      event.preventDefault();

      setSelectedIndex(
        current =>
          (
            current +
            1
          ) %
          displayResults.length,
      );

      return;
    }

    if (
      event.key ===
      'ArrowUp'
    ) {
      event.preventDefault();

      setSelectedIndex(
        current =>
          (
            current -
            1 +
            displayResults.length
          ) %
          displayResults.length,
      );

      return;
    }

    if (
      event.key ===
      'Enter'
    ) {
      event.preventDefault();

      const selected =
        displayResults[
          selectedIndex
        ];

      if (
        selected
      ) {
        void runResult(
          selected,
        );
      }
    }
  }

  return (
    <div
      className={
        mode ===
        'launcher'
          ? 'flex max-h-[min(760px,82vh)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0F131B]'
          : 'overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0F131B]'
      }
    >
      <div className="flex items-center gap-3 border-b border-slate-200 p-3 dark:border-white/10 sm:p-4">
        <Search className="h-5 w-5 shrink-0 text-slate-400" />

        <input
          ref={
            inputRef
          }
          value={
            query
          }
          onChange={
            event =>
              setQuery(
                event.target
                  .value,
              )
          }
          onKeyDown={
            handleKeyDown
          }
          placeholder="Search apps, companies, people, files and workspace…"
          aria-label="Search workspace"
          className="h-10 min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-slate-400"
        />

        {loading && (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />
        )}

        {onClose && (
          <button
            type="button"
            aria-label="Close search"
            onClick={
              onClose
            }
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {(error ||
        actionError) && (
        <div
          role="alert"
          className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
        >
          {error ||
            actionError}
        </div>
      )}

      <div
        className={
          mode ===
          'launcher'
            ? 'min-h-0 flex-1 overflow-y-auto p-2 sm:p-3'
            : 'p-3 sm:p-4'
        }
      >
        {!loading &&
        results.length ===
          0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/10">
              <Search className="h-5 w-5" />
            </div>

            <p className="mt-3 text-sm font-bold">
              {query.trim()
                ? 'No matching results'
                : 'Search your workspace'}
            </p>

            <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500 dark:text-slate-400">
              {query.trim()
                ? 'Try another app, company, coworker, file or workspace destination.'
                : 'Start typing, or choose one of the available workspace shortcuts.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(
              group => (
                <section
                  key={
                    group.kind
                  }
                >
                  <p className="px-2 pb-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                    {groupLabel(
                      group.kind,
                    )}
                  </p>

                  <div className="space-y-1">
                    {group.items.map(
                      result => {
                        const Icon =
                          iconFor(
                            result,
                          );

                        const index =
                          displayResults.findIndex(
                            item =>
                              item.id ===
                              result.id,
                          );

                        const selected =
                          index ===
                          selectedIndex;

                        return (
                          <button
                            key={
                              result.id
                            }
                            type="button"
                            onMouseEnter={() =>
                              setSelectedIndex(
                                index,
                              )
                            }
                            onClick={() =>
                              void runResult(
                                result,
                              )
                            }
                            disabled={
                              actionBusy ===
                              result.id
                            }
                            className={[
                              'flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition disabled:opacity-60',
                              selected
                                ? 'bg-blue-50 text-blue-950 dark:bg-blue-500/[0.10] dark:text-white'
                                : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]',
                            ].join(
                              ' ',
                            )}
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 dark:border-white/10 dark:bg-[#0B0E14] dark:text-slate-300">
                              {actionBusy ===
                              result.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Icon className="h-4 w-4" />
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-xs font-black">
                                  {result.title}
                                </p>

                                {result.badge && (
                                  <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-slate-500 dark:bg-white/10 dark:text-slate-300">
                                    {result.badge}
                                  </span>
                                )}
                              </div>

                              {(result.subtitle ||
                                result.description) && (
                                <p className="mt-1 truncate text-[10px] text-slate-500 dark:text-slate-400">
                                  {result.subtitle ||
                                    result.description}
                                </p>
                              )}
                            </div>

                            <span className="hidden shrink-0 text-[9px] font-semibold text-slate-400 sm:block">
                              {result.action?.type ===
                                'switch_company'
                                ? 'Switch'
                                : result.action?.type ===
                                    'message_user'
                                  ? 'Message'
                                  : result.action?.type ===
                                      'download_file'
                                    ? 'Download'
                                    : 'Open'}
                            </span>
                          </button>
                        );
                      },
                    )}
                  </div>
                </section>
              ),
            )}
          </div>
        )}
      </div>

      {mode ===
        'launcher' && (
        <div className="hidden border-t border-slate-200 px-4 py-2.5 text-[9px] text-slate-400 sm:flex sm:items-center sm:justify-between dark:border-white/10">
          <span>
            ↑ ↓ navigate · Enter open · Esc close
          </span>
          <span>
            Permission-aware results
          </span>
        </div>
      )}
    </div>
  );
}

export default function WorkspaceSearchLauncher() {
  const [
    open,
    setOpen,
  ] =
    useState(
      false,
    );

  useEffect(
    () => {
      const listener =
        (
          event:
            KeyboardEvent,
        ) => {
          if (
            (
              event.metaKey ||
              event.ctrlKey
            ) &&
            event.key
              .toLowerCase() ===
              'k'
          ) {
            event.preventDefault();

            setOpen(
              true,
            );
          }
        };

      window.addEventListener(
        'keydown',
        listener,
      );

      return () =>
        window.removeEventListener(
          'keydown',
          listener,
        );
    },
    [],
  );

  return (
    <>
      <button
        type="button"
        onClick={() =>
          setOpen(
            true,
          )
        }
        className="hidden h-10 min-w-[180px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-xs font-semibold text-slate-400 transition hover:border-slate-300 hover:text-slate-600 md:flex dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-white/20 dark:hover:text-slate-300"
      >
        <Search className="h-4 w-4" />

        <span className="min-w-0 flex-1 truncate">
          Search SaMi
        </span>

        <span className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[8px] font-black dark:border-white/10">
          Ctrl K
        </span>
      </button>

      <button
        type="button"
        aria-label="Search workspace"
        onClick={() =>
          setOpen(
            true,
          )
        }
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 md:hidden dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-400 dark:hover:bg-white/10"
      >
        <Search className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search SaMi workspace"
          className="fixed inset-0 z-[140] flex items-start justify-center p-3 pt-[7vh] sm:p-6 sm:pt-[10vh]"
        >
          <button
            type="button"
            aria-label="Close search"
            onClick={() =>
              setOpen(
                false,
              )
            }
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
          />

          <div className="relative z-10 w-full max-w-2xl">
            <SearchSurface
              mode="launcher"
              onClose={() =>
                setOpen(
                  false,
                )
              }
            />
          </div>
        </div>
      )}
    </>
  );
}

export function WorkspaceSearchPageClient() {
  return (
    <SearchSurface
      mode="page"
    />
  );
}
