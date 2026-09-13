'use client';
import AdminAttentionPanel from './AdminAttentionPanel';
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  Building2,
  CircleDollarSign,
  ShieldCheck,
  Users,
} from 'lucide-react';
import AdminStatCard from './AdminStatCard';
import AdminActivityFeed from './AdminActivityFeed';
import AdminQuickActions from './AdminQuickActions';
type StatusCount = {
  status: string;
  count: number;
};

type RecentUser = {
  id: string;
  name: string;
  email: string;
  status: string | null;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
};

type RecentTenant = {
  id: string;
  name: string;
  slug: string;
  status: string | null;
  createdAt: string;
};

type ActivityItem = {
  id: string;
  actorType: string | null;
  action: string;
  eventType: string | null;
  resourceType: string | null;
  resourceId: string | null;
  result: string | null;
  tenantId: string | null;
  userId: string | null;
  createdAt: string;
};

type SecurityEvent = {
  id: string;
  type: 'login_failure' | 'admin_audit';
  adminId: string | null;
  eventType: string | null;
  action: string | null;
  failureReason: string | null;
  ipAddress: string | null;
  createdAt: string;
};

export type AdminDashboardData = {
  generatedAt: string;

  users: {
    total: number;
    active: number;
    unverified: number;
    locked: number;
    twoFactorEnabled: number;
    newLast7Days: number;
    newLast30Days: number;
    statuses: StatusCount[];
    recent: RecentUser[];
  };

  tenants: {
    total: number;
    active: number;
    newLast7Days: number;
    newLast30Days: number;
    statuses: StatusCount[];
    recent: RecentTenant[];
  };

  subscriptions: {
    total: number;
    active: number;
    trialing: number;
    pastDue: number;
    cancelled: number;
    trialsEndingNext7Days: number;
    statuses: StatusCount[];
  };

  modules: {
    total: number;
    active: number;
    core: number;
    aiEnabled: number;
    statuses: StatusCount[];
  };

  security: {
    lockedUsers: number;
    failedUserLoginsLast24Hours: number;
    failedAdminLoginsLast24Hours: number;
    activeAdminSessions: number;
  };

  attention: {
    unverifiedUsers: number;
    lockedUsers: number;
    trialsEndingNext7Days: number;
    pastDueSubscriptions: number;
    failedAdminLoginsLast24Hours: number;
  };

  activity: {
    recentPlatformActivity: ActivityItem[];
    recentSecurityEvents: SecurityEvent[];
  };
};

type AdminDashboardProps = {
  dashboard: AdminDashboardData;
};

function numberFormat(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function statusLabel(value: string | null) {
  if (!value) {
    return 'Unknown';
  }

  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}


export default function AdminDashboard({
  dashboard,
}: AdminDashboardProps) {
  

  return (
    <div className="space-y-8">
      {/* ======================================================
          HEADER
          ====================================================== */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Platform overview
          </p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
            Dashboard
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Monitor SaMi users, workspaces, subscriptions, platform activity,
            modules, and security from one place.
          </p>
        </div>

        <div className="text-xs text-zinc-400">
          Updated {formatDate(dashboard.generatedAt)}
        </div>
      </div>

      {/* ======================================================
          PRIMARY METRICS
          ====================================================== */}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
  <AdminStatCard
    title="Users"
    value={dashboard.users.total}
    hint={`${numberFormat(
      dashboard.users.newLast7Days
    )} new in the last 7 days`}
    icon={Users}
  />

  <AdminStatCard
    title="Businesses"
    value={dashboard.tenants.total}
    hint={`${numberFormat(
      dashboard.tenants.newLast7Days
    )} new in the last 7 days`}
    icon={Building2}
  />

  <AdminStatCard
    title="Active subscriptions"
    value={dashboard.subscriptions.active}
    hint={`${numberFormat(
      dashboard.subscriptions.trialing
    )} currently on trial`}
    icon={CircleDollarSign}
  />

  <AdminStatCard
    title="Available modules"
    value={dashboard.modules.total}
    hint={`${numberFormat(
      dashboard.modules.active
    )} currently active`}
    icon={Boxes}
  />
</section>

<AdminQuickActions />

      {/* ======================================================
          SECONDARY PLATFORM OVERVIEW
          ====================================================== */}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-zinc-950 dark:text-white">
                User health
              </h2>

              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Current account condition across SaMi.
              </p>
            </div>

            <Users className="h-5 w-5 text-zinc-400" />
          </div>

          <div className="mt-6 space-y-4">
            <MetricRow
              label="Active"
              value={dashboard.users.active}
            />

            <MetricRow
              label="Email unverified"
              value={dashboard.users.unverified}
            />

            <MetricRow
              label="Locked"
              value={dashboard.users.locked}
            />

            <MetricRow
              label="2FA enabled"
              value={dashboard.users.twoFactorEnabled}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-zinc-950 dark:text-white">
                Subscription health
              </h2>

              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Current subscription lifecycle.
              </p>
            </div>

            <CircleDollarSign className="h-5 w-5 text-zinc-400" />
          </div>

          <div className="mt-6 space-y-4">
            <MetricRow
              label="Active"
              value={dashboard.subscriptions.active}
            />

            <MetricRow
              label="Trialing"
              value={dashboard.subscriptions.trialing}
            />

            <MetricRow
              label="Past due"
              value={dashboard.subscriptions.pastDue}
            />

            <MetricRow
              label="Cancelled"
              value={dashboard.subscriptions.cancelled}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-zinc-950 dark:text-white">
                Security
              </h2>

              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Authentication and admin-session overview.
              </p>
            </div>

            <ShieldCheck className="h-5 w-5 text-zinc-400" />
          </div>

          <div className="mt-6 space-y-4">
            <MetricRow
              label="Locked users"
              value={dashboard.security.lockedUsers}
            />

            <MetricRow
              label="Failed user logins · 24h"
              value={dashboard.security.failedUserLoginsLast24Hours}
            />

            <MetricRow
              label="Failed admin logins · 24h"
              value={dashboard.security.failedAdminLoginsLast24Hours}
            />

            <MetricRow
              label="Active admin sessions"
              value={dashboard.security.activeAdminSessions}
            />
          </div>
        </div>
      </section>

     <AdminAttentionPanel
  attention={dashboard.attention}
/>

      {/* ======================================================
          RECENT USERS + BUSINESSES
          ====================================================== */}

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <div>
              <h2 className="font-semibold text-zinc-950 dark:text-white">
                Recent users
              </h2>

              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Latest customer accounts created on SaMi.
              </p>
            </div>

            <ArrowUpRight className="h-4 w-4 text-zinc-400" />
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {dashboard.users.recent.length === 0 ? (
              <EmptyRow label="No users yet." />
            ) : (
              dashboard.users.recent.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {user.name}
                    </p>

                    <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {user.email}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      {statusLabel(user.status)}
                    </p>

                    <p className="mt-1 text-xs text-zinc-400">
                      {formatDate(user.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <div>
              <h2 className="font-semibold text-zinc-950 dark:text-white">
                Recent businesses
              </h2>

              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Latest workspaces created on the platform.
              </p>
            </div>

            <Building2 className="h-4 w-4 text-zinc-400" />
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {dashboard.tenants.recent.length === 0 ? (
              <EmptyRow label="No businesses yet." />
            ) : (
              dashboard.tenants.recent.map((tenant) => (
                <div
                  key={tenant.id}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {tenant.name}
                    </p>

                    <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {tenant.slug}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      {statusLabel(tenant.status)}
                    </p>

                    <p className="mt-1 text-xs text-zinc-400">
                      {formatDate(tenant.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

    <AdminActivityFeed
  platformActivity={
    dashboard.activity.recentPlatformActivity
  }
  securityEvents={
    dashboard.activity.recentSecurityEvents
  }
/>
    </div>
  );
}

function MetricRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-zinc-500 dark:text-zinc-400">
        {label}
      </span>

      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {numberFormat(value)}
      </span>
    </div>
  );
}

function EmptyRow({
  label,
}: {
  label: string;
}) {
  return (
    <div className="px-5 py-8 text-sm text-zinc-500 dark:text-zinc-400">
      {label}
    </div>
  );
}