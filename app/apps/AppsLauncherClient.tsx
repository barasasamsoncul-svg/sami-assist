'use client';

import Link from 'next/link';

import {
  ArrowRight,
  Grid2X2,
  Search,
  Settings2,
} from 'lucide-react';

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import WorkspaceShell from '@/app/components/workspace/WorkspaceShell';

import {
  getSaMiAppIcon,
} from '@/lib/apps/icon-registry';

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
      description="Open the business tools available to your role."
      contextLabel={
        tenant?.name ||
        null
      }
      actions={
        canManageApps ? (
          <Link
            href="/settings?tab=apps"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-300 dark:hover:bg-white/10"
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
      <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0F131B] sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-400">
              App launcher
            </p>

            <h1 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">
              Your business workspace
            </h1>

            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">
              Only installed applications you are authorized to use appear here.
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
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-12 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/[0.04] dark:focus:border-blue-500/50 dark:focus:bg-white/[0.06]"
            />

            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 sm:inline dark:border-white/10 dark:bg-white/[0.06]">
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
                    modules.filter(
                      app =>
                        app.category ===
                        item.key,
                    ).length
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
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center dark:border-white/10 dark:bg-white/[0.025]">
          <Search className="mx-auto h-6 w-6 text-slate-300" />

          <p className="mt-3 text-sm font-bold">
            No matching apps
          </p>

          <p className="mt-1 text-xs text-slate-400">
            Change the search or category filter.
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center dark:border-white/10 dark:bg-white/[0.025]">
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
  const Icon =
    getSaMiAppIcon(
      app.iconKey,
    );

  return (
    <Link
      href={
        app.href
      }
      className="group rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-blue-500/40"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-sm">
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-bold">
              {app.name}
            </p>

            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
          </div>

          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            {app.categoryLabel}
          </p>
        </div>
      </div>

      <p className="mt-4 line-clamp-2 min-h-10 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {app.description}
      </p>
    </Link>
  );
}
