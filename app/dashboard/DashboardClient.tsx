'use client';

import Link from 'next/link';

import {
  Activity,
  ArrowRight,
  Bell,
  Boxes,
  CheckCircle2,
  Clock3,
  Search,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';

import {
  useMemo,
  type ReactNode,
} from 'react';

import CompanyAvatar from '@/app/components/workspace/CompanyAvatar';
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

type ActivityItem = {
  id: string;
  label: string;
  summary: string | null;
  module: string | null;
  result: string | null;
  createdAt: string;
  actor: {
    name: string;
  };
};

type ActivitySummary =
  | {
      todayCount: number;
      failed7d: number;
      actors7d: number;
      modules7d: number;
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
  recentActivity: ActivityItem[];
  activitySummary: ActivitySummary;
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
  recentActivity,
  activitySummary,
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
        4,
      );

  const work =
    dashboard.work
      .slice(
        0,
        4,
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
        5,
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
      description="Open an app or ask SaMi to work across the business capabilities available to you."
      contextLabel={
        company
          ?.currentCompany
          .name ||
        tenant?.name ||
        null
      }
      contentClassName="max-w-[1540px]"
    >
      <div className="space-y-6 sm:space-y-7">
        <section className="sami-ai-sheen relative overflow-hidden rounded-[28px] border border-[var(--sami-border)] p-4 shadow-[var(--sami-shadow-sm)] sm:p-5">
          <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" />

          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-300">
                <Sparkles className="h-3.5 w-3.5" />
                SaMi AI
              </div>

              <h1 className="mt-2 text-xl font-black tracking-[-0.03em] text-slate-950 sm:text-2xl dark:text-white">
                {greeting()}, {firstName}
              </h1>

              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 sm:text-sm dark:text-slate-400">
                {dashboard.brief.message}
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-[620px]">
              {capabilities.ai && (
                <Link
                  href="/ai"
                  className="group flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-indigo-200/80 bg-white/85 px-4 text-left shadow-sm transition hover:-translate-y-px hover:border-indigo-300 hover:shadow-md dark:border-indigo-500/20 dark:bg-white/[0.055] dark:hover:border-indigo-400/30"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-sm">
                    <Sparkles className="h-4 w-4" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-black text-slate-800 dark:text-slate-100">
                      Ask SaMi anything about your business
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                      Works across the apps and records your permissions allow
                    </span>
                  </span>

                  <ArrowRight className="h-4 w-4 shrink-0 text-indigo-500 transition group-hover:translate-x-0.5" />
                </Link>
              )}

              <Link
                href="/search"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-4 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-[var(--sami-surface-soft)] dark:text-slate-300"
              >
                <Search className="h-4 w-4" />
                Search
              </Link>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                Workspace
              </p>

              <h2 className="mt-1 text-lg font-black tracking-[-0.02em] text-slate-950 dark:text-white">
                Apps
              </h2>

              <p className="mt-1 text-[11px] text-slate-400">
                Only apps available to your role and current workspace are shown.
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
                      className="group flex min-w-0 flex-col items-center rounded-2xl px-1.5 py-2 text-center outline-none transition hover:bg-[var(--sami-surface-soft)] focus-visible:ring-2 focus-visible:ring-indigo-500/40"
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
                        className="transition duration-200 group-hover:-translate-y-0.5 group-hover:scale-[1.04]"
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
            <div className="sami-surface rounded-[24px] p-5">
              <EmptyState
                icon={
                  Boxes
                }
                title="No business apps available"
                description="Apps will appear here when they are installed and granted to your account."
              />
            </div>
          )}
        </section>

        {(attention.length >
          0 ||
          work.length >
          0 ||
          metrics.length >
          0 ||
          recent.length >
          0 ||
          recentActivity.length >
          0) && (
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
            <div className="space-y-4">
              {(attention.length >
                0 ||
                work.length >
                0) && (
                <Section
                  title="Work & attention"
                  description="Real work contributed by the installed apps you can access."
                >
                  <div className="grid gap-2 md:grid-cols-2">
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

              {metrics.length >
                0 && (
                <Section
                  title="Business snapshot"
                  description="Metrics supplied by modules available to your account."
                >
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

              {recent.length >
                0 && (
                <Section
                  title="Recent records"
                  description="Records surfaced by the apps you can access."
                >
                  <div className="grid gap-2 sm:grid-cols-2">
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

            <div className="space-y-4">
              <Section
                title="My activity"
                description="Only your recent activity in the current company."
                action={
                  <Link
                    href="/activity"
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-300"
                  >
                    Open
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                }
              >
                {recentActivity.length >
                  0 ? (
                  <div className="divide-y divide-slate-100 dark:divide-white/5">
                    {recentActivity
                      .slice(
                        0,
                        5,
                      )
                      .map(
                        item => (
                          <div
                            key={
                              item.id
                            }
                            className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                          >
                            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                              {item.result ===
                                'failed' ||
                              item.result ===
                                'denied' ? (
                                <TriangleAlert className="h-4 w-4" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-bold">
                                {item.label}
                              </p>
                              <p className="mt-1 truncate text-[10px] text-slate-400">
                                {relativeTime(
                                  item.createdAt,
                                )}
                                {item.module
                                  ? ` · ${item.module}`
                                  : ''}
                              </p>
                            </div>
                          </div>
                        ),
                      )}
                  </div>
                ) : (
                  <EmptyState
                    icon={
                      Activity
                    }
                    title="No recent activity"
                    description="Your actions in this company will appear here."
                  />
                )}
              </Section>

              <div className="sami-surface rounded-[24px] p-4">
                <div className="flex items-center gap-3">
                  <CompanyAvatar
                    name={
                      company
                        ?.currentCompany
                        .name ||
                      'Company'
                    }
                    logoUrl={
                      company
                        ?.currentCompany
                        .logoUrl ||
                      null
                    }
                    size="md"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-black text-slate-800 dark:text-slate-100">
                      {company
                        ?.currentCompany
                        .name ||
                      tenant?.name ||
                      'Workspace'}
                    </p>

                    <p className="mt-0.5 truncate text-[10px] text-slate-400">
                      Current company context
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Link
                      href="/notifications"
                      aria-label="Messages"
                      className="relative flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-[var(--sami-surface-soft)] dark:text-slate-300"
                    >
                      <Bell className="h-4 w-4" />
                      {unreadNotifications >
                        0 && (
                        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500" />
                      )}
                    </Link>

                    <Link
                      href="/activity"
                      aria-label="My activity"
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-[var(--sami-surface-soft)] dark:text-slate-300"
                    >
                      <Activity className="h-4 w-4" />
                    </Link>
                  </div>
                </div>

                {activitySummary && (
                  <div className="mt-3 flex items-center gap-2 border-t border-[var(--sami-border)] pt-3 text-[9px] font-semibold text-slate-400">
                    <span>
                      {activitySummary.todayCount} of your actions today
                    </span>
                    <span aria-hidden="true">
                      ·
                    </span>
                    <span>
                      {company?.allowedCompanyCount || 0} companies available
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>
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
    <section className="sami-surface rounded-[24px] p-4 sm:p-5">
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
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-7 text-center dark:border-white/10">
      <Icon className="mx-auto h-5 w-5 text-slate-300 dark:text-slate-600" />

      <p className="mt-2 text-xs font-bold">
        {title}
      </p>

      <p className="mx-auto mt-1 max-w-sm text-[10px] leading-5 text-slate-400">
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
    <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
        {metric.label}
      </p>

      <p className="mt-2 text-xl font-black">
        {metric.value}
      </p>

      {metric.description && (
        <p className="mt-1 text-[10px] leading-5 text-slate-400">
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
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/20 dark:bg-amber-500/[0.06]">
      <p className="text-xs font-bold">
        {item.title}
      </p>

      {item.description && (
        <p className="mt-1 text-[10px] leading-5 text-slate-500 dark:text-slate-400">
          {item.description}
        </p>
      )}
    </div>
  );

  return item.href ? (
    <Link
      href={
        item.href
      }
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
    <div className="rounded-xl border border-slate-200 p-3 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.04]">
      <p className="text-xs font-bold">
        {item.title}
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] text-slate-400">
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
  );

  return item.href ? (
    <Link
      href={
        item.href
      }
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
    <div className="rounded-xl border border-slate-200 p-3 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.04]">
      <p className="truncate text-xs font-bold">
        {item.title}
      </p>

      <p className="mt-1 text-[9px] text-slate-400">
        {relativeTime(
          item.occurredAt,
        )}
      </p>
    </div>
  );

  return item.href ? (
    <Link
      href={
        item.href
      }
    >
      {content}
    </Link>
  ) : (
    content
  );
}
