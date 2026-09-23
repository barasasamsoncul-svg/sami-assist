import {
  notFound,
} from 'next/navigation';

import {
  AppWindow,
  Bot,
  Braces,
  HardDrive,
  UsersRound,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

import WorkspaceShell from '@/app/components/workspace/WorkspaceShell';

import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';

import {
  getPermissionContext,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  requirePageSession,
} from '@/lib/auth/require-page-session';

import {
  resolveWorkspaceShellAccess,
} from '@/lib/auth/workspace-shell';

import {
  getWorkspaceUsageState,
} from '@/lib/services/workspace-usage';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


function formatNumber(
  value:
    number,
) {
  return new Intl.NumberFormat(
    'en-KE',
  ).format(
    value,
  );
}


function formatBytes(
  value:
    number,
) {
  const bytes =
    Math.max(
      0,
      value,
    );

  if (
    bytes <
    1024
  ) {
    return `${bytes} B`;
  }

  const units = [
    'KB',
    'MB',
    'GB',
    'TB',
  ];

  let current =
    bytes /
    1024;

  let unitIndex =
    0;

  while (
    current >=
      1024 &&
    unitIndex <
      units.length -
        1
  ) {
    current /=
      1024;

    unitIndex +=
      1;
  }

  return `${current.toFixed(
    current >=
      10
      ? 1
      : 2,
  )} ${units[
    unitIndex
  ]}`;
}


function formatDate(
  value:
    string,
) {
  return new Intl.DateTimeFormat(
    'en-KE',
    {
      day:
        'numeric',
      month:
        'short',
      year:
        'numeric',
    },
  ).format(
    new Date(
      value,
    ),
  );
}


type MetricCardProps = {
  icon:
    LucideIcon;
  title:
    string;
  value:
    string;
  limit:
    string | null;
  percent:
    number | null;
  label:
    string;
  enforced:
    boolean;
};


function MetricCard({
  icon:
    Icon,
  title,
  value,
  limit,
  percent,
  label,
  enforced,
}: MetricCardProps) {
  return (
    <article className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)] sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
          <Icon className="h-[18px] w-[18px]" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            {title}
          </p>

          <div className="mt-1 flex flex-wrap items-end gap-x-2 gap-y-1">
            <p className="text-2xl font-black tracking-[-0.03em] text-slate-950 dark:text-white">
              {value}
            </p>

            {limit && (
              <p className="pb-1 text-[10px] font-semibold text-slate-400">
                of {limit}
              </p>
            )}
          </div>
        </div>

        <span className={[
          'rounded-full px-2.5 py-1 text-[9px] font-black',
          enforced
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
            : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400',
        ].join(
          ' ',
        )}>
          {enforced
            ? 'Enforced'
            : 'Metered'}
        </span>
      </div>

      {percent !==
        null && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{
                width:
                  `${Math.max(
                    2,
                    Math.min(
                      100,
                      percent,
                    ),
                  )}%`,
              }}
            />
          </div>

          <p className="mt-2 text-[10px] font-semibold text-slate-400">
            {percent}% used
          </p>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
        {label}
      </p>
    </article>
  );
}


export default async function UsagePage() {
  const session =
    await requirePageSession(
      '/usage',
    );

  const [
    account,
    permissions,
  ] =
    await Promise.all([
      getAccountContextForUser(
        session.user.id,
        session.currentTenantId,
      ),

      getPermissionContext(),
    ]);

  const canViewUsage =
    permissions.isOwner ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .BILLING_VIEW,
    ) ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .BILLING_MANAGE,
    );

  if (
    !canViewUsage
  ) {
    notFound();
  }

  const [
    shell,
    usage,
  ] = [
    resolveWorkspaceShellAccess({
      modules:
        account.modules,
      subscription:
        account.subscription,
      permissions,
    }),

    await getWorkspaceUsageState(),
  ];

  const metrics =
    usage.usage;

  const metricCards:
    MetricCardProps[] = [
      {
        icon:
          Bot,
        title:
          'Your SaMi AI',
        value:
          formatNumber(
            metrics
              .aiQueriesUserMonth
              .used,
          ),
        limit:
          metrics
            .aiQueriesUserMonth
            .limit ===
            null
            ? null
            : formatNumber(
                metrics
                  .aiQueriesUserMonth
                  .limit,
              ),
        percent:
          metrics
            .aiQueriesUserMonth
            .percent,
        label:
          metrics
            .aiQueriesUserMonth
            .label,
        enforced:
          metrics
            .aiQueriesUserMonth
            .enforced,
      },
      {
        icon:
          HardDrive,
        title:
          'Cloud storage',
        value:
          formatBytes(
            metrics
              .storageBytesWorkspace
              .used,
          ),
        limit:
          metrics
            .storageBytesWorkspace
            .limit ===
            null
            ? null
            : formatBytes(
                metrics
                  .storageBytesWorkspace
                  .limit,
              ),
        percent:
          metrics
            .storageBytesWorkspace
            .percent,
        label:
          metrics
            .storageBytesWorkspace
            .label,
        enforced:
          metrics
            .storageBytesWorkspace
            .enforced,
      },
      {
        icon:
          Workflow,
        title:
          'Automation runs',
        value:
          formatNumber(
            metrics
              .automationRunsWorkspaceMonth
              .used,
          ),
        limit:
          null,
        percent:
          null,
        label:
          metrics
            .automationRunsWorkspaceMonth
            .label,
        enforced:
          false,
      },
      {
        icon:
          Braces,
        title:
          'Developer API',
        value:
          formatNumber(
            metrics
              .apiRequestsWorkspaceMonth
              .used,
          ),
        limit:
          null,
        percent:
          null,
        label:
          metrics
            .apiRequestsWorkspaceMonth
            .label,
        enforced:
          false,
      },
      {
        icon:
          UsersRound,
        title:
          'Active internal users',
        value:
          formatNumber(
            metrics
              .activeInternalUsers
              .used,
          ),
        limit:
          metrics
            .activeInternalUsers
            .limit ===
            null
            ? null
            : formatNumber(
                metrics
                  .activeInternalUsers
                  .limit,
              ),
        percent:
          metrics
            .activeInternalUsers
            .percent,
        label:
          metrics
            .activeInternalUsers
            .label,
        enforced:
          metrics
            .activeInternalUsers
            .enforced,
      },
      {
        icon:
          AppWindow,
        title:
          'Installed business apps',
        value:
          formatNumber(
            metrics
              .installedBusinessApps
              .used,
          ),
        limit:
          metrics
            .installedBusinessApps
            .limit ===
            null
            ? null
            : formatNumber(
                metrics
                  .installedBusinessApps
                  .limit,
              ),
        percent:
          metrics
            .installedBusinessApps
            .percent,
        label:
          metrics
            .installedBusinessApps
            .label,
        enforced:
          metrics
            .installedBusinessApps
            .enforced,
      },
    ];

  return (
    <WorkspaceShell
      user={
        session.user
      }
      tenant={
        account.tenant
      }
      membership={
        account.membership
      }
      subscription={
        shell.subscription
      }
      modules={
        shell.accessibleModules
      }
      sidebarCapabilities={{
        aiEnabled:
          shell.aiAvailable,
        filesEnabled:
          permissions
            .permissionSet
            .has(
              SAMI_PERMISSIONS
                .FILES_VIEW,
            ),
        notificationsEnabled:
          true,
      }}
      title="Usage & Limits"
      description="See the live usage SaMi uses to enforce your workspace plan and cost controls."
      contextLabel={
        account.tenant
          ?.name ||
        null
      }
      contentClassName="max-w-[1540px]"
    >
      <div className="space-y-5">
        <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)] sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600 dark:text-blue-300">
                Current usage period
              </p>

              <h1 className="mt-1 text-xl font-black tracking-[-0.03em] text-slate-950 dark:text-white">
                {formatDate(
                  usage.period
                    .start,
                )}
                {' '}
                –
                {' '}
                {formatDate(
                  usage.period
                    .end,
                )}
              </h1>

              <p className="mt-1 max-w-3xl text-xs leading-6 text-slate-500 dark:text-slate-400">
                SaMi reads usage from the same authoritative records that power AI, files, automations and the Developer API. Fixed plan limits are enforced before new work is accepted.
              </p>
            </div>

            <div className="shrink-0 rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface-soft)] px-4 py-3">
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                Subscription
              </p>
              <p className="mt-1 text-sm font-black capitalize text-slate-900 dark:text-white">
                {usage.subscription
                  .planKey}
                {' · '}
                {usage.subscription
                  .status}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {metricCards.map(
            card => (
              <MetricCard
                key={
                  card.title
                }
                {...card}
              />
            ),
          )}
        </section>

        <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)] sm:p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Entitlements
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(
              usage.entitlements,
            ).map(
              ([
                key,
                enabled,
              ]) => (
                <div
                  key={
                    key
                  }
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--sami-border)] px-3 py-2.5"
                >
                  <span className="truncate text-[11px] font-bold capitalize text-slate-600 dark:text-slate-300">
                    {key.replace(
                      /([A-Z])/g,
                      ' $1',
                    )}
                  </span>

                  <span className={[
                    'rounded-full px-2 py-1 text-[9px] font-black',
                    enabled
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400',
                  ].join(
                    ' ',
                  )}>
                    {enabled
                      ? 'Included'
                      : 'Not included'}
                  </span>
                </div>
              ),
            )}
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
