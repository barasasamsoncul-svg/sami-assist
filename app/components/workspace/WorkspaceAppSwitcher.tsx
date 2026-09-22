'use client';

import Link from 'next/link';

import {
  ExternalLink,
  LayoutGrid,
  Search,
  X,
} from 'lucide-react';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import SamiAppIconTile from '@/app/components/apps/SamiAppIconTile';

type ExternalAppData = {
  id: string;
  name: string;
  description: string | null;
  launchUrl: string;
  iconKey: string | null;
  authMode: string;
};

type ModuleData = {
  key: string;
  registryKey?: string;
  name: string;
  status: string;
  href?: string | null;
  description?: string | null;
  iconKey?: string | null;
  category?: string | null;
  categoryLabel?: string | null;
};

export default function WorkspaceAppSwitcher({
  modules,
}: {
  modules:
    ModuleData[];
}) {
  const [
    open,
    setOpen,
  ] =
    useState(false);

  const [
    search,
    setSearch,
  ] =
    useState('');

  const [
    externalApps,
    setExternalApps,
  ] =
    useState<
      ExternalAppData[]
    >([]);

  useEffect(
    () => {
      let active =
        true;

      async function loadExternalApps() {
        try {
          const response =
            await fetch(
              '/api/workspace/integrations/launcher',
              {
                credentials:
                  'same-origin',
                cache:
                  'no-store',
              },
            );

          const data =
            await response.json() as {
              success?:
                boolean;
              apps?:
                ExternalAppData[];
            };

          if (
            active &&
            response.ok &&
            data.success ===
              true
          ) {
            setExternalApps(
              Array.isArray(
                data.apps,
              )
                ? data.apps
                : [],
            );
          }
        } catch {
          if (
            active
          ) {
            setExternalApps(
              [],
            );
          }
        }
      }

      if (
        open
      ) {
        void loadExternalApps();
      }

      return () => {
        active =
          false;
      };
    },
    [
      open,
    ],
  );

  const visible =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLowerCase();

        return modules.filter(
          module => {
            if (
              module.status ===
                'disabled' ||
              module.status ===
                'failed' ||
              module.status ===
                'uninstalled'
            ) {
              return false;
            }

            if (!query) {
              return true;
            }

            return [
              module.name,
              module.description,
              module.categoryLabel,
              module.registryKey,
              module.key,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .includes(query);
          },
        );
      },
      [
        modules,
        search,
      ],
    );

  const visibleExternal =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLowerCase();

        if (
          !query
        ) {
          return externalApps;
        }

        return externalApps.filter(
          app =>
            [
              app.name,
              app.description ||
                '',
              app.launchUrl,
              app.authMode,
              'external app',
            ]
              .join(
                ' ',
              )
              .toLowerCase()
              .includes(
                query,
              ),
        );
      },
      [
        externalApps,
        search,
      ],
    );

  function close() {
    setOpen(false);
    setSearch('');
  }

  return (
    <>
      <button
        type="button"
        aria-label="Open app launcher"
        aria-expanded={open}
        title="Apps"
        onClick={() =>
          setOpen(true)
        }
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] text-slate-500 shadow-[var(--sami-shadow-sm)] transition hover:-translate-y-px hover:bg-[var(--sami-surface-soft)] hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        <LayoutGrid className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="SaMi app launcher"
          className="fixed inset-0 z-[145] flex items-start justify-center p-3 pt-[7vh] sm:p-6 sm:pt-[9vh]"
        >
          <button
            type="button"
            aria-label="Close app launcher"
            onClick={close}
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
          />

          <section className="sami-surface-raised relative z-10 flex max-h-[82vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[26px]">
            <div className="flex items-center gap-3 border-b border-[var(--sami-border)] px-4 py-3.5 sm:px-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/15">
                <LayoutGrid className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold tracking-tight">
                  Apps
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Switch business tools without leaving your workspace context.
                </p>
              </div>

              <button
                type="button"
                aria-label="Close app launcher"
                onClick={close}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-[var(--sami-surface-soft)] hover:text-slate-900 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-[var(--sami-border)] px-4 py-3 sm:px-5">
              <label className="sami-soft-surface flex h-10 items-center gap-2 rounded-xl px-3">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  value={search}
                  onChange={event =>
                    setSearch(
                      event.target.value,
                    )
                  }
                  placeholder="Search installed apps"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </label>
            </div>

            <div className="sami-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {(visible.length > 0 ||
                visibleExternal.length >
                  0) ? (
                <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
                  {visible.map(
                    module => (
                      <Link
                        key={
                          module.key
                        }
                        href={
                          module.href ||
                          `/apps/${encodeURIComponent(
                            module.registryKey ||
                              module.key,
                          )}`
                        }
                        onClick={close}
                        className="group flex min-w-0 flex-col items-center rounded-2xl px-2 py-2 text-center transition hover:bg-[var(--sami-surface-soft)]"
                      >
                        <SamiAppIconTile
                          appKey={
                            module.registryKey ||
                            module.key
                          }
                          category={
                            module.category
                          }
                          iconKey={
                            module.iconKey
                          }
                          size="lg"
                          className="transition duration-200 group-hover:-translate-y-0.5 group-hover:scale-[1.03]"
                        />

                        <span className="mt-2.5 w-full truncate text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                          {module.name}
                        </span>
                      </Link>
                    ),
                  )}

                  {visibleExternal.map(
                    app => (
                      <a
                        key={
                          'external:' +
                          app.id
                        }
                        href={
                          app.launchUrl
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={
                          close
                        }
                        className="group flex min-w-0 flex-col items-center rounded-2xl px-2 py-2 text-center transition hover:bg-[var(--sami-surface-soft)]"
                      >
                        <span className="flex h-12 w-12 items-center justify-center rounded-[15px] bg-gradient-to-br from-slate-600 to-slate-900 text-white shadow-sm transition duration-200 group-hover:-translate-y-0.5 group-hover:scale-[1.03]">
                          <ExternalLink className="h-5 w-5" />
                        </span>

                        <span className="mt-2.5 w-full truncate text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                          {app.name}
                        </span>

                        <span className="mt-0.5 text-[8px] font-black uppercase tracking-wide text-slate-400">
                          External
                        </span>
                      </a>
                    ),
                  )}
                </div>
              ) : (
                <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
                  <Search className="h-6 w-6 text-slate-300" />
                  <p className="mt-3 text-sm font-bold">
                    No matching apps
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Try another app name or category.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[var(--sami-border)] px-4 py-3 sm:px-5">
              <p className="text-[10px] text-slate-400">
                {modules.length +
                  externalApps.length}{' '}
                {modules.length +
                  externalApps.length === 1
                  ? 'app'
                  : 'apps'} available
              </p>

              <Link
                href="/apps"
                onClick={close}
                className="text-[11px] font-bold text-[var(--sami-brand)] transition hover:opacity-80"
              >
                Open full app launcher
              </Link>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
