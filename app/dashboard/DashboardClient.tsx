'use client';

import Link from 'next/link';

import {
  Activity,
  ArrowRight,
  Bell,
  Boxes,
  Building2,
  CheckCircle2,
  Clock3,
  LayoutGrid,
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

import {
  getSaMiAppIcon,
} from '@/lib/apps/icon-registry';

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

function resultTone(
  result:
    string | null,
) {
  if (
    result ===
      'failed' ||
    result ===
      'denied'
  ) {
    return 'text-rose-600 dark:text-rose-300';
  }

  return 'text-emerald-600 dark:text-emerald-300';
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
          )
          .slice(
            0,
            8,
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
      title="Dashboard"
      description="Your current company, work, apps and recent activity."
      contextLabel={
        company
          ?.currentCompany
          .name ||
        tenant?.name ||
        null
      }
      contentClassName="max-w-[1540px]"
    >
      <div className="space-y-5">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0F131B]">
          <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-center">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">
                {greeting()}, {firstName}
              </p>

              <h1 className="mt-2 max-w-3xl text-2xl font-black tracking-tight text-slate-950 sm:text-3xl dark:text-white">
                {dashboard
                  .brief.title}
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                {dashboard
                  .brief.message}
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href="/search"
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                >
                  <Search className="h-4 w-4" />
                  Search workspace
                </Link>

                {capabilities.ai && (
                  <Link
                    href="/ai"
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-xs font-bold text-blue-700 transition hover:bg-blue-100 dark:border-blue-500/20 dark:bg-blue-500/[0.08] dark:text-blue-300 dark:hover:bg-blue-500/[0.12]"
                  >
                    <Sparkles className="h-4 w-4" />
                    Ask SaMi
                  </Link>
                )}

                <Link
                  href="/activity"
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                >
                  <Activity className="h-4 w-4" />
                  Activity
                </Link>

                <Link
                  href="/notifications"
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                >
                  <Bell className="h-4 w-4" />
                  Messages
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <HomeStat
                icon={
                  LayoutGrid
                }
                label="Apps"
                value={
                  modules.length
                }
                detail="Available to you"
              />

              <HomeStat
                icon={
                  Bell
                }
                label="Unread"
                value={
                  unreadNotifications
                }
                detail="Notifications"
              />

              <HomeStat
                icon={
                  Activity
                }
                label="Today"
                value={
                  activitySummary
                    ?.todayCount ||
                  0
                }
                detail="Recorded activity"
              />

              <HomeStat
                icon={
                  Building2
                }
                label="Companies"
                value={
                  company
                    ?.allowedCompanyCount ||
                  0
                }
                detail="Accessible"
              />
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
          <div className="space-y-5">
            <Section
              title="Your apps"
              description="Installed business apps available to your current access."
              action={
                <Link
                  href="/apps"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-300"
                >
                  All apps
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            >
              {visibleApps.length >
                0 ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {visibleApps.map(
                    module => {
                      const Icon =
                        getSaMiAppIcon(
                          module.iconKey ||
                          module.key,
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
                          className="group rounded-2xl border border-slate-200 bg-slate-50/60 p-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white hover:shadow-sm dark:border-white/10 dark:bg-white/[0.025] dark:hover:border-blue-500/30 dark:hover:bg-white/[0.05]"
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 dark:bg-[#0B0E14] dark:text-slate-300 dark:ring-white/10">
                            <Icon className="h-5 w-5" />
                          </div>

                          <p className="mt-4 truncate text-sm font-black tracking-tight">
                            {module.name}
                          </p>

                          <p className="mt-1 line-clamp-2 min-h-10 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                            {module.description ||
                              module.categoryLabel ||
                              'Open app'}
                          </p>
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
                  description="Installed apps will appear here when they are available to your role."
                />
              )}
            </Section>

            {metrics.length >
              0 && (
              <Section
                title="Business snapshot"
                description="Metrics contributed by the apps you can access."
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

            <Section
              title="Recent activity"
              description="What has recently happened in the current company."
              action={
                <Link
                  href="/activity"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-300"
                >
                  Full timeline
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            >
              {recentActivity.length >
                0 ? (
                <div className="divide-y divide-slate-100 dark:divide-white/5">
                  {recentActivity.map(
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
                          <div className="flex items-start justify-between gap-3">
                            <p className="truncate text-xs font-bold">
                              {item.label}
                            </p>

                            <span className="shrink-0 text-[10px] text-slate-400">
                              {relativeTime(
                                item.createdAt,
                              )}
                            </span>
                          </div>

                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {item.actor.name}
                            {item.module
                              ? ` · ${item.module}`
                              : ''}
                          </p>

                          {item.summary && (
                            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-400">
                              {item.summary}
                            </p>
                          )}
                        </div>

                        <span
                          className={[
                            'mt-0.5 shrink-0 text-[9px] font-black uppercase',
                            resultTone(
                              item.result,
                            ),
                          ].join(
                            ' ',
                          )}
                        >
                          {item.result ||
                            'recorded'}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={
                    Activity
                  }
                  title="No recent company activity"
                  description="New trusted activity will appear here automatically."
                />
              )}
            </Section>
          </div>

          <div className="space-y-5">
            <Section
              title="Current company"
              description="Your active operating context."
            >
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.025]">
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
                    size="lg"
                  />

                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">
                      {company
                        ?.currentCompany
                        .name ||
                      'No company selected'}
                    </p>

                    <p className="mt-1 text-[10px] text-slate-400">
                      {company
                        ? `${company.currentCompany.currency} · ${company.currentCompany.timezone}`
                        : 'Select a company to work with company-scoped data.'}
                    </p>
                  </div>
                </div>

                {company && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <SmallFact
                      label="Selected"
                      value={
                        String(
                          company
                            .selectedCompanyCount,
                        )
                      }
                    />

                    <SmallFact
                      label="Accessible"
                      value={
                        String(
                          company
                            .allowedCompanyCount,
                        )
                      }
                    />
                  </div>
                )}
              </div>
            </Section>

            <Section
              title="Work & attention"
              description="Only real work contributed by installed apps."
            >
              {attention.length ===
                0 &&
              work.length ===
                0 ? (
                <EmptyState
                  icon={
                    CheckCircle2
                  }
                  title="Nothing needs your attention"
                  description="Approvals, due work and assigned tasks appear here when an installed app provides them."
                />
              ) : (
                <div className="space-y-2">
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
              )}
            </Section>

            <Section
              title="Quick access"
              description="Trusted core workspace surfaces."
            >
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <QuickLink
                  href="/search"
                  icon={
                    Search
                  }
                  label="Search"
                />

                <QuickLink
                  href="/notifications"
                  icon={
                    Bell
                  }
                  label="Messages"
                />

                <QuickLink
                  href="/activity"
                  icon={
                    Activity
                  }
                  label="Activity"
                />

                <QuickLink
                  href="/apps"
                  icon={
                    LayoutGrid
                  }
                  label="Apps"
                />

                {capabilities.ai && (
                  <QuickLink
                    href="/ai"
                    icon={
                      Sparkles
                    }
                    label="SaMi AI"
                  />
                )}
              </div>
            </Section>

            {recent.length >
              0 && (
              <Section
                title="Recent records"
                description="Recent items contributed by your installed apps."
              >
                <div className="space-y-2">
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
        </div>
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
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-white/10 dark:bg-[#0F131B]">
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

function HomeStat({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.025]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
          {label}
        </p>

        <Icon className="h-3.5 w-3.5 text-slate-400" />
      </div>

      <p className="mt-2 text-xl font-black tracking-tight">
        {value}
      </p>

      <p className="mt-1 text-[9px] text-slate-400">
        {detail}
      </p>
    </div>
  );
}

function SmallFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-white p-3 text-center ring-1 ring-slate-200 dark:bg-[#0B0E14] dark:ring-white/10">
      <p className="text-lg font-black">
        {value}
      </p>

      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
        {label}
      </p>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={
        href
      }
      className="flex h-11 items-center gap-3 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50/50 hover:text-blue-700 dark:border-white/10 dark:text-slate-300 dark:hover:border-blue-500/30 dark:hover:bg-blue-500/[0.06] dark:hover:text-blue-300"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
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
