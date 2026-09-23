'use client';

import Link from 'next/link';

import {
  Building2,
  Check,
  ChevronDown,
  Loader2,
  Plus,
} from 'lucide-react';

import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';


type WorkspaceItem = {
  id: string;
  name: string;
  slug: string;
  status: string;
  accessLevel:
    | 'owner'
    | 'admin'
    | 'member';
  isOwner: boolean;
  isAdmin: boolean;
};


type Props = {
  currentTenant:
    | {
        id: string;
        name: string;
        slug: string;
      }
    | null;
};


type WorkspaceResponse = {
  success?:
    boolean;
  code?:
    string;
  error?:
    string;
  currentWorkspaceId?:
    string | null;
  workspaces?:
    WorkspaceItem[];
};


async function readJson(
  response:
    Response,
): Promise<WorkspaceResponse> {
  try {
    return (
      await response.json()
    ) as
      WorkspaceResponse;
  } catch {
    return {
      success:
        false,
      error:
        'SaMi returned an invalid workspace response.',
    };
  }
}


function accessLabel(
  value:
    WorkspaceItem['accessLevel'],
) {
  if (
    value ===
      'owner'
  ) {
    return 'Owner';
  }

  if (
    value ===
      'admin'
  ) {
    return 'Admin';
  }

  return 'Member';
}


export default function WorkspaceTenantSwitcher({
  currentTenant,
}: Props) {
  const router =
    useRouter();

  const rootRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const [
    open,
    setOpen,
  ] =
    useState(
      false,
    );

  const [
    loaded,
    setLoaded,
  ] =
    useState(
      false,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      false,
    );

  const [
    switchingId,
    setSwitchingId,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const [
    workspaces,
    setWorkspaces,
  ] =
    useState<
      WorkspaceItem[]
    >([]);

  const [
    currentWorkspaceId,
    setCurrentWorkspaceId,
  ] =
    useState<
      string | null
    >(
      currentTenant
        ?.id ||
      null,
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


  useEffect(() => {
    setCurrentWorkspaceId(
      currentTenant
        ?.id ||
      null,
    );
  }, [
    currentTenant
      ?.id,
  ]);


  useEffect(() => {
    function onPointerDown(
      event:
        PointerEvent,
    ) {
      if (
        !rootRef.current ||
        rootRef.current.contains(
          event.target as
            Node,
        )
      ) {
        return;
      }

      setOpen(
        false,
      );
    }

    function onKeyDown(
      event:
        KeyboardEvent,
    ) {
      if (
        event.key ===
          'Escape'
      ) {
        setOpen(
          false,
        );
      }
    }

    document.addEventListener(
      'pointerdown',
      onPointerDown,
    );

    document.addEventListener(
      'keydown',
      onKeyDown,
    );

    return () => {
      document.removeEventListener(
        'pointerdown',
        onPointerDown,
      );

      document.removeEventListener(
        'keydown',
        onKeyDown,
      );
    };
  }, []);


  async function loadWorkspaces() {
    if (
      loading
    ) {
      return;
    }

    setLoading(
      true,
    );

    setError(
      null,
    );

    try {
      const response =
        await fetch(
          '/api/account/workspaces',
          {
            method:
              'GET',
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
        await readJson(
          response,
        );

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'SaMi could not load your workspaces.',
        );
      }

      setWorkspaces(
        Array.isArray(
          data.workspaces,
        )
          ? data.workspaces
          : [],
      );

      setCurrentWorkspaceId(
        data.currentWorkspaceId ||
        currentTenant
          ?.id ||
        null,
      );

      setLoaded(
        true,
      );
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof
          Error
          ? candidate.message
          : 'SaMi could not load your workspaces.',
      );
    } finally {
      setLoading(
        false,
      );
    }
  }


  async function toggle() {
    const next =
      !open;

    setOpen(
      next,
    );

    if (
      next &&
      !loaded
    ) {
      await loadWorkspaces();
    }
  }


  async function switchWorkspace(
    workspace:
      WorkspaceItem,
  ) {
    if (
      switchingId ||
      workspace.id ===
        currentWorkspaceId
    ) {
      setOpen(
        false,
      );

      return;
    }

    setSwitchingId(
      workspace.id,
    );

    setError(
      null,
    );

    try {
      const response =
        await fetch(
          '/api/account/workspaces',
          {
            method:
              'POST',
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
                tenantId:
                  workspace.id,
              }),
          },
        );

      const data =
        await readJson(
          response,
        );

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'SaMi could not switch workspaces.',
        );
      }

      setCurrentWorkspaceId(
        workspace.id,
      );

      setOpen(
        false,
      );

      router.replace(
        '/dashboard',
      );

      router.refresh();
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof
          Error
          ? candidate.message
          : 'SaMi could not switch workspaces.',
      );
    } finally {
      setSwitchingId(
        null,
      );
    }
  }


  const visibleName =
    currentTenant
      ?.name ||
    'Workspace';


  return (
    <div
      ref={
        rootRef
      }
      className="relative"
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={
          open
        }
        aria-label="Switch workspace"
        title="Switch workspace"
        onClick={() =>
          void toggle()
        }
        className="inline-flex h-10 min-w-0 max-w-[190px] items-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-2.5 text-slate-600 shadow-[var(--sami-shadow-sm)] transition hover:bg-[var(--sami-surface-soft)] dark:text-slate-300 sm:px-3"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
          <Building2 className="h-3.5 w-3.5" />
        </span>

        <span className="hidden min-w-0 flex-1 truncate text-[10px] font-black sm:block">
          {visibleName}
        </span>

        <ChevronDown
          className={[
            'hidden h-3.5 w-3.5 shrink-0 text-slate-400 transition sm:block',
            open
              ? 'rotate-180'
              : '',
          ].join(
            ' ',
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-[90] mt-2 w-[min(92vw,340px)] overflow-hidden rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] shadow-[0_24px_70px_rgba(15,23,42,0.18)] dark:shadow-[0_24px_70px_rgba(0,0,0,0.45)]"
        >
          <div className="border-b border-[var(--sami-border)] px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              Workspaces
            </p>

            <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
              Your SaMi identity can belong to multiple isolated organizations.
            </p>
          </div>

          <div className="max-h-[320px] overflow-y-auto p-2">
            {loading && (
              <div className="flex items-center justify-center gap-2 px-3 py-8 text-xs font-bold text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading workspaces…
              </div>
            )}

            {!loading &&
              error && (
              <div className="rounded-xl bg-red-50 px-3 py-3 text-[11px] leading-5 text-red-700 dark:bg-red-500/10 dark:text-red-300">
                {error}

                <button
                  type="button"
                  onClick={() =>
                    void loadWorkspaces()
                  }
                  className="mt-2 block font-black underline underline-offset-2"
                >
                  Try again
                </button>
              </div>
            )}

            {!loading &&
              !error &&
              workspaces.map(
                workspace => {
                  const current =
                    workspace.id ===
                    currentWorkspaceId;

                  const switching =
                    switchingId ===
                    workspace.id;

                  return (
                    <button
                      key={
                        workspace.id
                      }
                      type="button"
                      role="menuitem"
                      disabled={
                        Boolean(
                          switchingId,
                        )
                      }
                      onClick={() =>
                        void switchWorkspace(
                          workspace,
                        )
                      }
                      className={[
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
                        current
                          ? 'bg-blue-50 dark:bg-blue-500/10'
                          : 'hover:bg-[var(--sami-surface-soft)]',
                        switchingId
                          ? 'disabled:opacity-60'
                          : '',
                      ].join(
                        ' ',
                      )}
                    >
                      <span className={[
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                        current
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-300',
                      ].join(
                        ' ',
                      )}>
                        {switching ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Building2 className="h-4 w-4" />
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-black text-slate-800 dark:text-slate-100">
                          {workspace.name}
                        </span>

                        <span className="mt-0.5 block truncate text-[9px] font-bold uppercase tracking-wide text-slate-400">
                          {accessLabel(
                            workspace.accessLevel,
                          )}
                          {' · '}
                          {workspace.slug}
                        </span>
                      </span>

                      {current && (
                        <Check className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
                      )}
                    </button>
                  );
                },
              )}

            {!loading &&
              !error &&
              loaded &&
              workspaces.length ===
                0 && (
              <p className="px-3 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No active workspaces are available.
              </p>
            )}
          </div>

          <div className="border-t border-[var(--sami-border)] p-2">
            <Link
              href="/workspaces/new"
              onClick={() =>
                setOpen(
                  false,
                )
              }
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-black text-blue-700 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/10"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                <Plus className="h-4 w-4" />
              </span>

              Create another workspace
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
