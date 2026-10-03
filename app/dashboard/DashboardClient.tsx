'use client';

import Link from 'next/link';

import {
  ArrowRight,
  Bell,
  Boxes,
  Clock3,
  Search,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import WorkspaceShell from '@/app/components/workspace/WorkspaceShell';
import SamiAppIconTile from '@/app/components/apps/SamiAppIconTile';

import {
  getSaMiAppVisual,
} from '@/lib/apps/visual-registry';

import type {
  DashboardAttentionItem,
  DashboardMetric,
  DashboardRecentItem,
  DashboardViewModel,
  DashboardWorkItem,
} from '@/lib/dashboard/types';


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
  registryKey?: string;
  name: string;
  status: string;
  href?: string | null;
  description?: string | null;
  iconKey?: string | null;
  category?: string;
  categoryLabel?: string;
};

type CompanyData =
  | {
      currentCompany: {
        id: string;
        name: string;
        logoUrl: string | null;
        currency: string;
        timezone: string;
      };
      selectedCompanyCount: number;
      allowedCompanyCount: number;
    }
  | null;

type Props = {
  user: UserData;
  tenant: TenantData;
  membership: MembershipData;
  subscription: SubscriptionData;
  modules: ModuleData[];
  company: CompanyData;
  dashboard: DashboardViewModel;
  unreadNotifications: number;
  capabilities: {
    ai: boolean;
    files: boolean;
  };
};


function greeting() {
  const hour =
    new Date()
      .getHours();

  if (
    hour <
    12
  ) {
    return 'Good morning';
  }

  if (
    hour <
    17
  ) {
    return 'Good afternoon';
  }

  return 'Good evening';
}


function relativeTime(
  value:
    string,
) {
  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '';
  }

  const diff =
    Date.now() -
    date.getTime();

  if (
    diff <
    60_000
  ) {
    return 'Now';
  }

  if (
    diff <
    3_600_000
  ) {
    return (
      Math.max(
        1,
        Math.floor(
          diff /
          60_000,
        ),
      ) +
      'm ago'
    );
  }

  if (
    diff <
    86_400_000
  ) {
    return (
      Math.floor(
        diff /
        3_600_000,
      ) +
      'h ago'
    );
  }

  return date
    .toLocaleDateString(
      undefined,
      {
        month:
          'short',
        day:
          'numeric',
      },
    );
}


export default function DashboardClient({
  user,
  tenant,
  membership,
  subscription,
  modules,
  company,
  dashboard,
  unreadNotifications,
  capabilities,
}: Props) {
  const visibleApps =
    useMemo(
      () =>
        modules
          .filter(
            module =>
              module.status !==
                'disabled' &&
              module.status !==
                'failed' &&
              module.status !==
                'uninstalled',
          ),
      [
        modules,
      ],
    );

  const attention =
    dashboard.attention
      .slice(
        0,
        6,
      );

  const work =
    dashboard.work
      .slice(
        0,
        6,
      );

  const metrics =
    dashboard.metrics
      .slice(
        0,
        4,
      );

  const recent =
    dashboard.recent
      .slice(
        0,
        6,
      );

  const firstName =
    user.firstName
      ?.trim() ||
    user.fullName
      ?.trim()
      .split(
        /\s+/,
      )[0] ||
    'there';

  const [
    aiBrief,
    setAiBrief,
  ] =
    useState(
      dashboard.brief
        .message,
    );

  const [
    aiBriefGenerated,
    setAiBriefGenerated,
  ] =
    useState(
      false,
    );

  useEffect(
    () => {
      if (
        !capabilities.ai
      ) {
        return;
      }

      const signalKey = [
        dashboard.attention[0]
          ?.id,
        dashboard.work[0]
          ?.id,
        dashboard.metrics[0]
          ?.id,
        dashboard.aiContext[0]
          ?.id,
      ]
        .filter(
          Boolean,
        )
        .join(
          ':',
        ) ||
        'none';

      const cacheKey =
        'sami:dashboard-analysis:' +
        (
          tenant?.id ||
          'workspace'
        ) +
        ':' +
        (
          company
            ?.currentCompany
            .id ||
          'company'
        ) +
        ':' +
        signalKey;

      try {
        const cached =
          window.sessionStorage
            .getItem(
              cacheKey,
            );

        if (
          cached
        ) {
          const parsed =
            JSON.parse(
              cached,
            ) as {
              message?: string;
              generatedByAi?: boolean;
              savedAt?: number;
            };

          if (
            typeof parsed.message ===
              'string' &&
            parsed.message
              .trim() &&
            Number(
              parsed.savedAt ||
              0,
            ) >
              Date.now() -
              60_000
          ) {
            setAiBrief(
              parsed.message
                .trim(),
            );
            setAiBriefGenerated(
              parsed.generatedByAi ===
              true,
            );
            return;
          }
        }
      } catch {
        // Session cache is only an optimization.
      }

      const controller =
        new AbortController();

      const timer =
        window.setTimeout(
          () => {
            void fetch(
              '/api/workspace/dashboard/ai-summary',
              {
                credentials:
                  'same-origin',
                cache:
                  'no-store',
                signal:
                  controller.signal,
              },
            )
              .then(
                response =>
                  response.json(),
              )
              .then(
                data => {
                  if (
                    data.success &&
                    typeof data.summary
                      ?.message ===
                      'string' &&
                    data.summary.message
                      .trim()
                  ) {
                    const message =
                      data.summary
                        .message
                        .trim();

                    const generatedByAi =
                      data.summary
                        .generatedByAi ===
                        true;

                    setAiBrief(
                      message,
                    );
                    setAiBriefGenerated(
                      generatedByAi,
                    );

                    try {
                      window.sessionStorage
                        .setItem(
                          cacheKey,
                          JSON.stringify({
                            message,
                            generatedByAi,
                            savedAt:
                              Date.now(),
                          }),
                        );
                    } catch {
                      // Session cache is only an optimization.
                    }
                  }
                },
              )
              .catch(
                () =>
                  undefined,
              );
          },
          250,
        );

      return () => {
        window.clearTimeout(
          timer,
        );
        controller.abort();
      };
    },
    [
      capabilities.ai,
      company
        ?.currentCompany
        .id,
      dashboard,
      tenant?.id,
    ],
  );

  const hasBusinessSignals =
    attention.length >
      0 ||
    work.length >
      0 ||
    metrics.length >
      0 ||
    recent.length >
      0;

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
      sidebarCapabilities={{
        aiEnabled:
          capabilities.ai,
        filesEnabled:
          capabilities.files,
        notificationsEnabled:
          true,
      }}
      unreadNotifications={
        unreadNotifications
      }
      title="Home"
      description="A focused operating view built from the apps and records available to you."
      contextLabel={
        company
          ?.currentCompany
          .name ||
        tenant?.name ||
        null
      }
      contentClassName="max-w-[1540px]"
    >
      <div className="space-y-7 sm:space-y-8">
        <section className="border-b border-[var(--sami-border)] pb-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-300">
                <Sparkles className="h-3.5 w-3.5" />
                SaMi analysis
                <span className="text-[9px] font-semibold normal-case tracking-normal text-slate-500 dark:text-slate-400">
                  {aiBriefGenerated
                    ? 'live business analysis'
                    : 'business briefing'}
                </span>
              </div>

              <h1 className="mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950 sm:text-3xl dark:text-white">
                {greeting()}, {firstName}
              </h1>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                {aiBrief}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {capabilities.ai && (
                <Link
                  href="/ai"
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white transition hover:opacity-90 dark:bg-white dark:text-slate-950"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Ask SaMi
                </Link>
              )}

              <Link
                href="/search"
                className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold text-slate-600 transition hover:bg-[var(--sami-surface-soft)] dark:text-slate-300"
              >
                <Search className="h-3.5 w-3.5" />
                Search
              </Link>

              <Link
                href="/notifications"
                aria-label="Notifications"
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-[var(--sami-surface-soft)] dark:text-slate-300"
              >
                <Bell className="h-4 w-4" />
                {unreadNotifications >
                  0 && (
                  <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500" />
                )}
              </Link>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Workspace
              </p>

              <h2 className="mt-1 text-lg font-black tracking-[-0.02em] text-slate-950 dark:text-white">
                Apps
              </h2>

              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Only apps available to your role are shown.
              </p>
            </div>

            <Link
              href="/apps"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[11px] font-bold text-blue-600 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/10"
            >
              All apps
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {visibleApps.length >
            0 ? (
            <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-9">
              {visibleApps.map(
                module => {
                  const visual =
                    getSaMiAppVisual(
                      module.registryKey ||
                        module.key,
                      module.category,
                    );

                  return (
                    <Link
                      key={
                        module.key
                      }
                      href={
                        module.href ||
                        '/apps'
                      }
                      title={
                        module.name
                      }
                      className="group flex min-w-0 flex-col items-center px-1.5 py-2 text-center outline-none transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-indigo-500/40"
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
                        size="xl"
                        className="transition duration-200 group-hover:scale-[1.04]"
                      />

                      <span className="mt-2.5 w-full truncate text-[11px] font-bold text-slate-700 sm:text-xs dark:text-slate-200">
                        {module.name}
                      </span>

                      <span
                        className={[
                          'mt-0.5 w-full truncate text-[9px] font-semibold opacity-80',
                          visual.text,
                        ].join(
                          ' ',
                        )}
                      >
                        {module.categoryLabel ||
                          'Business app'}
                      </span>
                    </Link>
                  );
                },
              )}
            </div>
          ) : (
            <EmptyState
              icon={
                Boxes
              }
              title="No business apps available"
              description="Apps appear here when they are installed and granted to your account."
            />
          )}
        </section>

        {hasBusinessSignals && (
          <div className="space-y-7">
            {metrics.length >
              0 && (
              <Section
                title="Workspace snapshot"
                description="Current metrics contributed only by apps and records you are allowed to view."
              >
                <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
                  {metrics.map(
                    metric => (
                      <MetricCard
                        key={
                          metric.id
                        }
                        metric={
                          metric
                        }
                      />
                    ),
                  )}
                </div>
              </Section>
            )}

            {(attention.length >
              0 ||
              work.length >
              0) && (
              <Section
                title="Needs attention"
                description="Exceptions and work items that may require action."
              >
                <div className="divide-y divide-[var(--sami-border)]">
                  {attention.map(
                    item => (
                      <AttentionRow
                        key={
                          item.id
                        }
                        item={
                          item
                        }
                      />
                    ),
                  )}

                  {work.map(
                    item => (
                      <WorkRow
                        key={
                          item.id
                        }
                        item={
                          item
                        }
                      />
                    ),
                  )}
                </div>
              </Section>
            )}

            {recent.length >
              0 && (
              <Section
                title="Recent business records"
                description="Recent records surfaced by the business apps you can access."
              >
                <div className="divide-y divide-[var(--sami-border)]">
                  {recent.map(
                    item => (
                      <RecentRow
                        key={
                          item.id
                        }
                        item={
                          item
                        }
                      />
                    ),
                  )}
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </WorkspaceShell>
  );
}


function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-[var(--sami-border)] pt-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-black tracking-tight">
            {title}
          </h2>

          <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            {description}
          </p>
        </div>

        {action}
      </div>

      {children}
    </section>
  );
}


function EmptyState({
  icon:
    Icon,
  title,
  description,
}: {
  icon:
    LucideIcon;
  title:
    string;
  description:
    string;
}) {
  return (
    <div className="border-t border-dashed border-[var(--sami-border)] py-8 text-center">
      <Icon className="mx-auto h-5 w-5 text-slate-300 dark:text-slate-600" />

      <p className="mt-2 text-xs font-bold">
        {title}
      </p>

      <p className="mx-auto mt-1 max-w-sm text-[10px] leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}


function MetricCard({
  metric,
}: {
  metric:
    DashboardMetric;
}) {
  return (
    <div className="border-l-2 border-slate-200 pl-4 dark:border-white/10">
      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
        {metric.label}
      </p>

      <p className="mt-1.5 text-xl font-black tracking-tight">
        {metric.value}
      </p>

      {metric.description && (
        <p className="mt-1 text-[10px] leading-5 text-slate-500 dark:text-slate-400">
          {metric.description}
        </p>
      )}
    </div>
  );
}


function AttentionRow({
  item,
}: {
  item:
    DashboardAttentionItem;
}) {
  const content = (
    <div className="flex items-start gap-3 py-3.5">
      <span
        aria-hidden="true"
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500"
      />

      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold">
          {item.title}
        </p>

        {item.description && (
          <p className="mt-1 text-[10px] leading-5 text-slate-500 dark:text-slate-400">
            {item.description}
          </p>
        )}
      </div>

      {item.href && (
        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      )}
    </div>
  );

  return item.href ? (
    <Link
      href={
        item.href
      }
      className="block transition hover:bg-[var(--sami-surface-soft)]"
    >
      {content}
    </Link>
  ) : (
    content
  );
}


function WorkRow({
  item,
}: {
  item:
    DashboardWorkItem;
}) {
  const content = (
    <div className="flex items-start gap-3 py-3.5">
      <span
        aria-hidden="true"
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500"
      />

      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold">
          {item.title}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] text-slate-500 dark:text-slate-400">
          {item.status && (
            <span>
              {item.status}
            </span>
          )}

          {item.dueAt && (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3" />
              {relativeTime(
                item.dueAt,
              )}
            </span>
          )}
        </div>
      </div>

      {item.href && (
        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      )}
    </div>
  );

  return item.href ? (
    <Link
      href={
        item.href
      }
      className="block transition hover:bg-[var(--sami-surface-soft)]"
    >
      {content}
    </Link>
  ) : (
    content
  );
}


function RecentRow({
  item,
}: {
  item:
    DashboardRecentItem;
}) {
  const content = (
    <div className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold">
          {item.title}
        </p>

        <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">
          {relativeTime(
            item.occurredAt,
          )}
        </p>
      </div>

      {item.href && (
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      )}
    </div>
  );

  return item.href ? (
    <Link
      href={
        item.href
      }
      className="block transition hover:bg-[var(--sami-surface-soft)]"
    >
      {content}
    </Link>
  ) : (
    content
  );
}
