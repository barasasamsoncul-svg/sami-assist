'use client';

import Link from 'next/link';

import {
  ArrowRight,
  Grid2X2,
  Search,
  Settings2,
  Sparkles,
} from 'lucide-react';

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import WorkspaceShell from '@/app/components/workspace/WorkspaceShell';
import SamiAppIconTile from '@/app/components/apps/SamiAppIconTile';

import {
  getSaMiAppVisual,
} from '@/lib/apps/visual-registry';

type UserData = {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
};

type TenantData =
  | {
      id: string;
      name: string;
      slug: string;
      status: string;
    }
  | null;

type MembershipData =
  | {
      accessLevel:
        | 'owner'
        | 'admin'
        | 'member';
      isOwner: boolean;
      isAdmin: boolean;
      label: string;
    }
  | null;

type SubscriptionData =
  | {
      status: string;
      planKey: string | null;
      planName: string | null;
    }
  | null;

type ModuleData = {
  key: string;
  registryKey: string;
  name: string;
  status: string;
  description: string;
  href: string;
  iconKey: string;
  category: string;
  categoryLabel: string;
  order: number;
  recommended: boolean;
  keywords: string[];
  registered: boolean;
};

type Props = {
  user: UserData;
  tenant: TenantData;
  membership: MembershipData;
  subscription: SubscriptionData;
  modules: ModuleData[];
  canManageApps: boolean;
  sidebarCapabilities: {
    aiEnabled: boolean;
    filesEnabled: boolean;
    notificationsEnabled: boolean;
  };
};

export default function AppsLauncherClient({
  user,
  tenant,
  membership,
  subscription,
  modules,
  canManageApps,
  sidebarCapabilities,
}: Props) {
  const [
    search,
    setSearch,
  ] =
    useState(
      '',
    );

  const [
    category,
    setCategory,
  ] =
    useState(
      'all',
    );

  const searchRef =
    useRef<HTMLInputElement>(
      null,
    );

  const deferredSearch =
    useDeferredValue(
      search,
    );

  const categories =
    useMemo(
      () => {
        const found =
          new Map<
            string,
            string
          >();

        for (
          const app
          of modules
        ) {
          found.set(
            app.category,
            app.categoryLabel,
          );
        }

        return [
          ...found.entries(),
        ].map(
          (
            [
              key,
              label,
            ],
          ) => ({
            key,
            label,
          }),
        );
      },
      [
        modules,
      ],
    );


  const categoryCounts =
    useMemo(
      () => {
        const counts =
          new Map<
            string,
            number
          >();

        for (
          const app
          of modules
        ) {
          counts.set(
            app.category,
            (
              counts.get(
                app.category,
              ) ||
              0
            ) +
            1,
          );
        }

        return counts;
      },
      [
        modules,
      ],
    );

  const visibleApps =
    useMemo(
      () => {
        const query =
          deferredSearch
            .trim()
            .toLowerCase();

        return modules.filter(
          app => {
            if (
              category !==
                'all' &&
              app.category !==
                category
            ) {
              return false;
            }

            if (
              !query
            ) {
              return true;
            }

            return [
              app.name,
              app.description,
              app.categoryLabel,
              app.registryKey,
              ...app.keywords,
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
        category,
        deferredSearch,
        modules,
      ],
    );

  useEffect(
    () => {
      function handleKeyDown(
        event:
          KeyboardEvent,
      ) {
        if (
          event.key ===
            '/' &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          document.activeElement
            ?.tagName !==
            'INPUT' &&
          document.activeElement
            ?.tagName !==
            'TEXTAREA'
        ) {
          event.preventDefault();

          searchRef.current
            ?.focus();
        }
      }

      window.addEventListener(
        'keydown',
        handleKeyDown,
      );

      return () =>
        window.removeEventListener(
          'keydown',
          handleKeyDown,
        );
    },
    [],
  );

  return (
    <WorkspaceShell
      user={
        user
      }
      tenant={
        tenant
      }
      membership={
        membership
      }
      subscription={
        subscription
      }
      modules={
        modules
      }
      sidebarCapabilities={
        sidebarCapabilities
      }
      title="Apps"
      description="Your permission-aware business applications, organized as one SaMi workspace."
      contextLabel={
        tenant?.name ||
        null
      }
      actions={
        canManageApps ? (
          <Link
            href="/settings?tab=apps"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs font-semibold text-slate-600 shadow-[var(--sami-shadow-sm)] transition hover:-translate-y-px hover:bg-[var(--sami-surface-soft)] dark:text-slate-300"
          >
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">
              Manage apps
            </span>
          </Link>
        ) : null
      }
      contentClassName="max-w-[1500px]"
    >
      <section className="sami-ai-sheen overflow-hidden rounded-[28px] border border-[var(--sami-border)] p-4 shadow-[var(--sami-shadow-md)] sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/70 bg-white/70 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-indigo-700 shadow-sm backdrop-blur dark:border-indigo-500/20 dark:bg-white/[0.05] dark:text-indigo-300">
              <Sparkles className="h-3 w-3" />
              AI-powered workspace
            </div>

            <h1 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">
              Your business apps
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Open the tools available to your role. Each app keeps the same company context, permissions, search, activity and SaMi AI foundation.
            </p>
          </div>

          <div className="relative w-full xl:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              ref={
                searchRef
              }
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
              placeholder="Search apps"
              aria-label="Search apps"
              className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] pl-10 pr-12 text-sm shadow-[var(--sami-shadow-sm)] outline-none transition focus:border-[var(--sami-brand)] focus:ring-4 focus:ring-blue-500/10"
            />

            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-[var(--sami-border)] bg-[var(--sami-surface-soft)] px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 sm:inline">
              /
            </kbd>
          </div>
        </div>

        {categories.length >
          1 && (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <CategoryButton
              label="All"
              count={
                modules.length
              }
              selected={
                category ===
                'all'
              }
              onClick={() =>
                setCategory(
                  'all',
                )
              }
            />

            {categories.map(
              item => (
                <CategoryButton
                  key={
                    item.key
                  }
                  label={
                    item.label
                  }
                  count={
                    categoryCounts.get(
                      item.key,
                    ) ||
                    0
                  }
                  selected={
                    category ===
                    item.key
                  }
                  onClick={() =>
                    setCategory(
                      item.key,
                    )
                  }
                />
              ),
            )}
          </div>
        )}
      </section>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold">
            {category ===
            'all'
              ? 'All available apps'
              : categories.find(
                  item =>
                    item.key ===
                    category,
                )
                  ?.label ||
                'Apps'}
          </p>

          <p className="mt-0.5 text-[11px] text-slate-400">
            {visibleApps.length}{' '}
            {visibleApps.length ===
            1
              ? 'application'
              : 'applications'}
          </p>
        </div>
      </div>

      {visibleApps.length >
        0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {visibleApps.map(
            app => (
              <AppCard
                key={
                  app.key
                }
                app={
                  app
                }
              />
            ),
          )}
        </div>
      ) : modules.length >
        0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[var(--sami-border-strong)] bg-[var(--sami-surface)] px-5 py-10 text-center dark:border-white/10 dark:bg-white/[0.025]">
          <Search className="mx-auto h-6 w-6 text-slate-300" />

          <p className="mt-3 text-sm font-bold">
            No matching apps
          </p>

          <p className="mt-1 text-xs text-slate-400">
            Change the search or category filter.
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-[var(--sami-border-strong)] bg-[var(--sami-surface)] px-5 py-10 text-center dark:border-white/10 dark:bg-white/[0.025]">
          <Grid2X2 className="mx-auto h-7 w-7 text-slate-300" />

          <p className="mt-3 text-sm font-bold">
            No apps available
          </p>

          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-400">
            Your current workspace role does not provide access to an installed business application.
          </p>

          {canManageApps && (
            <Link
              href="/settings?tab=apps"
              className="mt-4 inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-700"
            >
              Manage workspace apps
            </Link>
          )}
        </div>
      )}
    </WorkspaceShell>
  );
}

function CategoryButton({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={
        selected
          ? 'inline-flex h-9 shrink-0 items-center gap-2 rounded-xl bg-slate-950 px-3 text-[11px] font-semibold text-white dark:bg-white dark:text-slate-950'
          : 'inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-300 dark:hover:bg-white/10'
      }
    >
      {label}

      <span
        className={
          selected
            ? 'text-white/60 dark:text-slate-500'
            : 'text-slate-400'
        }
      >
        {count}
      </span>
    </button>
  );
}

function AppCard({
  app,
}: {
  app: ModuleData;
}) {
  const visual =
    getSaMiAppVisual(
      app.registryKey ||
        app.key,
      app.category,
    );

  return (
    <Link
      href={
        app.href
      }
      className={[
        'group relative overflow-hidden rounded-[22px] border bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)] transition duration-200 hover:-translate-y-1 hover:shadow-[var(--sami-shadow-md)]',
        visual.border,
      ].join(
        ' ',
      )}
    >
      <div
        aria-hidden="true"
        className={[
          'absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-[0.10] blur-2xl',
          visual.dot,
        ].join(
          ' ',
        )}
      />

      <div className="relative flex items-start gap-3">
        <SamiAppIconTile
          appKey={
            app.registryKey ||
            app.key
          }
          category={
            app.category
          }
          iconKey={
            app.iconKey
          }
          size="lg"
          className="transition duration-200 group-hover:scale-[1.04]"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-[13px] font-bold tracking-[-0.01em] text-slate-900 dark:text-white">
              {app.name}
            </p>

            <ArrowRight
              className={[
                'mt-0.5 h-4 w-4 shrink-0 transition duration-200 group-hover:translate-x-0.5',
                visual.text,
              ].join(
                ' ',
              )}
            />
          </div>

          <p
            className={[
              'mt-1 text-[9px] font-bold uppercase tracking-[0.11em]',
              visual.text,
            ].join(
              ' ',
            )}
          >
            {app.categoryLabel}
          </p>
        </div>
      </div>

      <p className="relative mt-4 line-clamp-2 min-h-10 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
        {app.description}
      </p>

      <div className="relative mt-4 flex items-center justify-between">
        <span className="text-[9px] font-semibold text-slate-400">
          Open workspace
        </span>
        <span
          className={[
            'h-1.5 w-1.5 rounded-full',
            visual.dot,
          ].join(
            ' ',
          )}
        />
      </div>
    </Link>
  );
}
