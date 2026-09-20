'use client';

import Link from 'next/link';

import {
  CheckCircle2,
  Search,
} from 'lucide-react';

import {
  useDeferredValue,
  useMemo,
  useState,
} from 'react';

import {
  getSaMiAppIcon,
} from '@/lib/apps/icon-registry';

import {
  APP_CATEGORIES,
  SAMI_APPS,
} from '@/lib/sami-apps';

type InstalledModule = {
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

export default function AppsSettings({
  installedModules,
}: {
  installedModules:
    InstalledModule[];
}) {
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

  const deferredSearch =
    useDeferredValue(
      search,
    );

  const installedByKey =
    useMemo(
      () =>
        new Map(
          installedModules.map(
            module => [
              module.registryKey,
              module,
            ],
          ),
        ),
      [
        installedModules,
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
              installedByKey.has(
                app.key,
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
        installedByKey,
      ],
    );

  const installedCount =
    installedModules.length;

  const availableCount =
    Math.max(
      0,
      SAMI_APPS.length -
        installedCount,
    );

  return (
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
            Browse every SaMi business app. Installed apps are available to this workspace; available apps can be added when needed.
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
            const installed =
              installedByKey.get(
                app.key,
              );

            const Icon =
              getSaMiAppIcon(
                app.icon,
              );

            return (
              <article
                key={
                  app.key
                }
                className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-blue-200 dark:border-white/10 dark:bg-white/[0.025] dark:hover:border-blue-500/30"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-sm">
                    <Icon className="h-5 w-5" />
                  </div>

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

                      {installed ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          Installed
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400">
                          Available
                        </span>
                      )}
                    </div>

                    <p className="mt-3 line-clamp-2 min-h-10 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                      {app.description}
                    </p>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-[10px] font-semibold text-slate-400">
                        {installed
                          ? 'Ready in this workspace'
                          : 'Not installed'}
                      </span>

                      {installed && (
                        <Link
                          href={
                            installed.href
                          }
                          className="text-[11px] font-semibold text-blue-600 transition hover:text-blue-700 dark:text-blue-400"
                        >
                          Open
                        </Link>
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
