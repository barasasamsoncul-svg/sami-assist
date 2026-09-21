'use client';

import Link from 'next/link';

import {
  CheckCircle2,
  CircleOff,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';

import {
  useDeferredValue,
  useMemo,
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import SaMiOverlay from '@/app/components/SaMiOverlay';

import {
  useSaMiOverlay,
} from '@/app/components/useSaMiOverlay';

import SamiAppIconTile from '@/app/components/apps/SamiAppIconTile';

import {
  getSaMiAppVisual,
} from '@/lib/apps/visual-registry';

import {
  APP_CATEGORIES,
  SAMI_APPS,
} from '@/lib/sami-apps';


type WorkspaceModule = {
  key: string;
  registryKey: string;
  name: string;
  status: string;
  href: string;
  description: string;
  iconKey: string;
  category: string;
  categoryLabel: string;
  order: number;
  recommended: boolean;
  keywords: string[];
  registered: boolean;
};


type Filter =
  | 'all'
  | 'installed'
  | 'available';


type PendingLifecycleAction = {
  kind:
    'disable' |
    'uninstall';
  appKey:
    string;
  appName:
    string;
};


type LifecycleResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
  blockers?: Array<{
    key?: string;
    name?: string;
  }>;
};


const ACTIVE_STATUSES =
  new Set([
    'installed',
    'active',
    'enabled',
  ]);


function normalizeStatus(
  value:
    string | null | undefined,
) {
  return (
    value ||
    ''
  )
    .trim()
    .toLowerCase();
}


function isInstalledState(
  module:
    WorkspaceModule | undefined,
) {
  if (
    !module
  ) {
    return false;
  }

  return ![
    'uninstalled',
    'removed',
    'inactive',
  ].includes(
    normalizeStatus(
      module.status,
    ),
  );
}


async function readLifecycleResponse(
  response:
    Response,
): Promise<LifecycleResponse> {
  try {
    return (
      await response.json()
    ) as LifecycleResponse;
  } catch {
    return {
      success:
        false,
      code:
        'INVALID_SERVER_RESPONSE',
      error:
        'SaMi returned an invalid app-management response.',
    };
  }
}


export default function AppsSettings({
  workspaceModules,
}: {
  workspaceModules:
    WorkspaceModule[];
}) {
  const router =
    useRouter();

  const [
    search,
    setSearch,
  ] =
    useState(
      '',
    );

  const [
    filter,
    setFilter,
  ] =
    useState<Filter>(
      'all',
    );

  const [
    actionKey,
    setActionKey,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const [
    pendingAction,
    setPendingAction,
  ] =
    useState<
      PendingLifecycleAction | null
    >(
      null,
    );

  const {
    overlay,
    closeOverlay,
    showSuccess,
    showError,
  } =
    useSaMiOverlay();

  const deferredSearch =
    useDeferredValue(
      search,
    );

  const workspaceByKey =
    useMemo(
      () =>
        new Map(
          workspaceModules.map(
            module => [
              module.registryKey,
              module,
            ],
          ),
        ),
      [
        workspaceModules,
      ],
    );

  const categoryNames =
    useMemo(
      () =>
        new Map(
          APP_CATEGORIES.map(
            category => [
              category.key,
              category.name,
            ],
          ),
        ),
      [],
    );

  const installedCount =
    useMemo(
      () =>
        SAMI_APPS.filter(
          app =>
            isInstalledState(
              workspaceByKey.get(
                app.key,
              ),
            ),
        ).length,
      [
        workspaceByKey,
      ],
    );

  const availableCount =
    SAMI_APPS.length -
    installedCount;

  const catalog =
    useMemo(
      () => {
        const query =
          deferredSearch
            .trim()
            .toLowerCase();

        return SAMI_APPS.filter(
          app => {
            const installed =
              isInstalledState(
                workspaceByKey.get(
                  app.key,
                ),
              );

            if (
              filter ===
                'installed' &&
              !installed
            ) {
              return false;
            }

            if (
              filter ===
                'available' &&
              installed
            ) {
              return false;
            }

            if (
              !query
            ) {
              return true;
            }

            return [
              app.key,
              app.name,
              app.description,
              categoryNames.get(
                app.category,
              ) ||
                app.category,
            ]
              .join(
                ' ',
              )
              .toLowerCase()
              .includes(
                query,
              );
          },
        );
      },
      [
        categoryNames,
        deferredSearch,
        filter,
        workspaceByKey,
      ],
    );

  async function runAction(
    appKey:
      string,
    method:
      'POST' |
      'PATCH' |
      'DELETE',
    body?:
      Record<string, unknown>,
  ) {
    if (
      actionKey
    ) {
      return;
    }

    setActionKey(
      appKey,
    );

    try {
      const response =
        await fetch(
          `/api/workspace/apps/${encodeURIComponent(
            appKey,
          )}`,
          {
            method,
            headers: {
              Accept:
                'application/json',
              ...(
                body
                  ? {
                      'Content-Type':
                        'application/json',
                    }
                  : {}
              ),
            },
            credentials:
              'same-origin',
            cache:
              'no-store',
            body:
              body
                ? JSON.stringify(
                    body,
                  )
                : undefined,
          },
        );

      const data =
        await readLifecycleResponse(
          response,
        );

      if (
        !response.ok ||
        !data.success
      ) {
        const blockerNames =
          data.blockers
            ?.map(
              blocker =>
                blocker.name ||
                blocker.key ||
                '',
            )
            .filter(
              Boolean,
            ) ||
          [];

        const suffix =
          blockerNames.length >
            0
            ? ` Required by: ${blockerNames.join(
                ', ',
              )}.`
            : '';

        throw new Error(
          `${data.error || 'SaMi could not update this app.'}${suffix}`,
        );
      }

      router.refresh();

      showSuccess(
        'App updated',
        data.message ||
          'The workspace app has been updated.',
      );
    } catch (
      error
    ) {
      showError(
        'App update failed',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not update this app.',
      );
    } finally {
      setActionKey(
        null,
      );
    }
  }

  function confirmPendingAction() {
    const action =
      pendingAction;

    if (
      !action
    ) {
      return;
    }

    setPendingAction(
      null,
    );

    if (
      action.kind ===
        'disable'
    ) {
      void runAction(
        action.appKey,
        'PATCH',
        {
          action:
            'disable',
        },
      );

      return;
    }

    void runAction(
      action.appKey,
      'DELETE',
    );
  }


  return (
    <>
      <div>
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-white/10 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-400">
              App catalog
            </p>

            <h2 className="mt-1 text-lg font-black tracking-tight">
              Workspace Apps
            </h2>

            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">
              Install any SaMi business app your workspace needs. App quantity is not a paid-plan limit; user seats and premium capabilities are managed separately.
            </p>
          </div>

          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              value={
                search
              }
              onChange={
                event =>
                  setSearch(
                    event.target
                      .value,
                  )
              }
              aria-label="Search workspace apps"
              placeholder="Search apps"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/[0.04] dark:focus:border-blue-500/50 dark:focus:bg-white/[0.06]"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <FilterButton
            label="All"
            count={
              SAMI_APPS.length
            }
            active={
              filter ===
              'all'
            }
            onClick={() =>
              setFilter(
                'all',
              )
            }
          />

          <FilterButton
            label="Installed"
            count={
              installedCount
            }
            active={
              filter ===
              'installed'
            }
            onClick={() =>
              setFilter(
                'installed',
              )
            }
          />

          <FilterButton
            label="Available"
            count={
              availableCount
            }
            active={
              filter ===
              'available'
            }
            onClick={() =>
              setFilter(
                'available',
              )
            }
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {catalog.map(
            app => {
              const module =
                workspaceByKey.get(
                  app.key,
                );

              const status =
                normalizeStatus(
                  module
                    ?.status,
                );

              const active =
                Boolean(
                  module &&
                  ACTIVE_STATUSES.has(
                    status,
                  ),
                );

              const disabled =
                status ===
                'disabled';

              const pending =
                status ===
                'pending';

              const failed =
                status ===
                'failed';

              const installed =
                isInstalledState(
                  module,
                );

              const busy =
                actionKey ===
                app.key;

              const visual =
                getSaMiAppVisual(
                  app.key,
                  app.category,
                );

              return (
                <article
                  key={
                    app.key
                  }
                  className={[
                    'rounded-2xl border bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)] transition hover:-translate-y-px hover:shadow-[var(--sami-shadow-md)]',
                    visual.border,
                  ].join(
                    ' ',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <SamiAppIconTile
                      appKey={
                        app.key
                      }
                      category={
                        app.category
                      }
                      iconKey={
                        app.icon
                      }
                      size="lg"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">
                            {app.name}
                          </p>

                          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-400">
                            {categoryNames.get(
                              app.category,
                            ) ||
                              app.category}
                          </p>
                        </div>

                        <StatusBadge
                          status={
                            status
                          }
                          installed={
                            installed
                          }
                        />
                      </div>

                      <p className="mt-3 line-clamp-2 min-h-10 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                        {app.description}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                        {active &&
                          module && (
                          <Link
                            href={
                              module.href
                            }
                            className="inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-semibold text-blue-600 transition hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                          >
                            Open
                          </Link>
                        )}

                        {active && (
                          <button
                            type="button"
                            disabled={
                              busy
                            }
                            onClick={() =>
                              setPendingAction({
                                kind:
                                  'disable',
                                appKey:
                                  app.key,
                                appName:
                                  app.name,
                              })
                            }
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                          >
                            <CircleOff className="h-3.5 w-3.5" />
                            Disable
                          </button>
                        )}

                        {disabled && (
                          <button
                            type="button"
                            disabled={
                              busy
                            }
                            onClick={() =>
                              void runAction(
                                app.key,
                                'PATCH',
                                {
                                  action:
                                    'enable',
                                },
                              )
                            }
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 text-[11px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                          >
                            {busy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            Enable
                          </button>
                        )}

                        {(active ||
                          disabled) && (
                          <button
                            type="button"
                            disabled={
                              busy
                            }
                            onClick={() =>
                              setPendingAction({
                                kind:
                                  'uninstall',
                                appKey:
                                  app.key,
                                appName:
                                  app.name,
                              })
                            }
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/20"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Uninstall
                          </button>
                        )}

                        {pending && (
                          <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Installing
                          </span>
                        )}

                        {(!installed ||
                          failed) &&
                          !pending && (
                          <button
                            type="button"
                            disabled={
                              busy
                            }
                            onClick={() =>
                              void runAction(
                                app.key,
                                'POST',
                              )
                            }
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-[11px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                          >
                            {busy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : failed ? (
                              <RefreshCw className="h-3.5 w-3.5" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            {failed
                              ? 'Retry'
                              : 'Install'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            },
          )}
        </div>

        {catalog.length ===
          0 && (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center dark:border-white/10">
            <Search className="mx-auto h-6 w-6 text-slate-300" />

            <p className="mt-3 text-sm font-bold">
              No matching apps
            </p>

            <p className="mt-1 text-xs text-slate-400">
              Change the search or filter.
            </p>
          </div>
        )}
      </div>

      <SaMiOverlay
        open={
          Boolean(
            pendingAction,
          ) ||
          overlay.open
        }
        type={
          pendingAction
            ? 'warning'
            : overlay.type
        }
        title={
          pendingAction
            ? `${pendingAction.kind === 'disable' ? 'Disable' : 'Uninstall'} ${pendingAction.appName}?`
            : overlay.title
        }
        message={
          pendingAction
            ? pendingAction.kind ===
                'disable'
              ? 'The app will disappear from active workspace use, but its data will be retained. SaMi will block this if another installed app depends on it.'
              : 'The app will be removed from active workspace use. Its existing business data will be retained for a future reinstall. SaMi will block this if another installed app depends on it.'
            : overlay.message
        }
        primaryAction={
          pendingAction
            ? {
                label:
                  pendingAction.kind ===
                    'disable'
                    ? 'Disable app'
                    : 'Uninstall app',
                onClick:
                  confirmPendingAction,
              }
            : overlay.primaryAction
        }
        secondaryAction={
          pendingAction
            ? {
                label:
                  'Cancel',
                onClick:
                  () =>
                    setPendingAction(
                      null,
                    ),
              }
            : overlay.secondaryAction
        }
        onClose={
          pendingAction
            ? () =>
                setPendingAction(
                  null,
                )
            : closeOverlay
        }
      />
    </>
  );
}


function StatusBadge({
  status,
  installed,
}: {
  status:
    string;
  installed:
    boolean;
}) {
  if (
    status ===
    'disabled'
  ) {
    return (
      <span className="shrink-0 rounded-md bg-amber-50 px-2 py-1 text-[9px] font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
        Disabled
      </span>
    );
  }

  if (
    status ===
    'pending'
  ) {
    return (
      <span className="shrink-0 rounded-md bg-blue-50 px-2 py-1 text-[9px] font-semibold text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
        Installing
      </span>
    );
  }

  if (
    status ===
    'failed'
  ) {
    return (
      <span className="shrink-0 rounded-md bg-red-50 px-2 py-1 text-[9px] font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300">
        Needs attention
      </span>
    );
  }

  if (
    installed
  ) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        Installed
      </span>
    );
  }

  return (
    <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400">
      Available
    </span>
  );
}


function FilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label:
    string;
  count:
    number;
  active:
    boolean;
  onClick:
    () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={
        active
          ? 'inline-flex h-9 shrink-0 items-center gap-2 rounded-xl bg-slate-950 px-3 text-[11px] font-semibold text-white dark:bg-white dark:text-slate-950'
          : 'inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-300 dark:hover:bg-white/10'
      }
    >
      {label}

      <span
        className={
          active
            ? 'text-white/60 dark:text-slate-500'
            : 'text-slate-400'
        }
      >
        {count}
      </span>
    </button>
  );
}
