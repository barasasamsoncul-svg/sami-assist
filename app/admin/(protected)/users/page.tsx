import {
  CreditCard,
} from 'lucide-react';

import AdminResourcePage, {
  AdminDate,
  AdminStatusPill,
  type AdminTableColumn,
} from '@/app/admin/components/AdminResourcePage';

import UserControlActions from '@/app/admin/components/UserControlActions';

import {
  hasAdminCapability,
} from '@/lib/admin/capabilities';

import {
  listAdminUsers,
  listAdminUserWorkspaceFilters,
} from '@/lib/admin/oversight';

import {
  requireAdminCapability,
} from '@/lib/admin/require-capability';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


type SearchParams = {
  q?:
    string;
  page?:
    string;
  workspace?:
    string;
  seat?:
    string;
};


export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams:
    Promise<SearchParams>;
}) {
  const session =
    await requireAdminCapability(
      'users.read',
    );

  const canManageSecurity =
    hasAdminCapability(
      session.role,
      'users.security.manage',
    );

  const params =
    await searchParams;

  const seatFilter =
    params.seat ===
        'paid' ||
      params.seat ===
        'all'
      ? params.seat
      : 'billing';

  const [
    data,
    workspaces,
  ] =
    await Promise.all([
      listAdminUsers({
        page:
          params.page,
        search:
          params.q,
        workspaceId:
          params.workspace,
        seatFilter,
      }),
      listAdminUserWorkspaceFilters(),
    ]);

  const selectedWorkspace =
    workspaces.some(
      workspace =>
        workspace.id ===
        params.workspace,
    )
      ? params.workspace ||
        ''
      : '';

  type Row =
    (typeof data.items)[number];

  const columns:
    readonly AdminTableColumn<Row>[] = [
      {
        key:
          'workspace',
        label:
          'Workspace',
        render:
          row => (
            <div className="min-w-[180px]">
              <p className="font-black text-zinc-950 dark:text-white">
                {row.workspace.name}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {row.workspace.slug}
              </p>
            </div>
          ),
      },
      {
        key:
          'user',
        label:
          'User',
        render:
          row => (
            <div className="min-w-[210px]">
              <p className="font-black text-zinc-950 dark:text-white">
                {row.name}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {row.email}
              </p>
            </div>
          ),
      },
      {
        key:
          'membership',
        label:
          'Membership',
        render:
          row => (
            <div className="min-w-[135px] space-y-1">
              <p className="text-[11px] font-black text-zinc-700 dark:text-zinc-200">
                {row.membership.label}
              </p>
              <AdminStatusPill
                value={
                  row.membership.status
                }
              />
            </div>
          ),
      },
      {
        key:
          'billing-seat',
        label:
          'Billing seat',
        render:
          row => (
            <div className="min-w-[150px]">
              <p className={[
                'text-[11px] font-black',
                row.billing
                  .isBillingSeat
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-zinc-400',
              ].join(
                ' ',
              )}>
                {row.billing
                  .isBillingSeat
                  ? row.billing
                      .isPaidPlanSeat
                    ? 'Billable seat'
                    : 'Active seat'
                  : 'Not billed'}
              </p>

              <p className="mt-1 text-[11px] text-zinc-500">
                {row.billing
                  .pricePerUserMonthly ===
                  null
                  ? 'Price unavailable'
                  : `KES ${row.billing.pricePerUserMonthly.toLocaleString(
                      'en-KE',
                    )} / month`}
              </p>
            </div>
          ),
      },
      {
        key:
          'plan',
        label:
          'Plan',
        render:
          row => (
            <div className="min-w-[125px]">
              <p className="text-[11px] font-black text-zinc-800 dark:text-zinc-200">
                {row.subscription
                  ?.planName ||
                  row.subscription
                    ?.planKey ||
                  'No plan'}
              </p>
              <div className="mt-1">
                <AdminStatusPill
                  value={
                    row.subscription
                      ?.status ||
                    'unknown'
                  }
                />
              </div>
            </div>
          ),
      },
      {
        key:
          'security',
        label:
          'Account',
        render:
          row => (
            <div className="min-w-[155px] space-y-1 text-[11px]">
              <div className="flex items-center gap-2">
                <AdminStatusPill
                  value={
                    row.userStatus
                  }
                />
              </div>
              <p>
                Email: {row.emailVerified ? 'verified' : 'unverified'}
              </p>
              <p>
                2FA: {row.twoFactorEnabled ? 'enabled' : 'off'}
              </p>
              {row.lockedUntil && (
                <p className="font-bold text-amber-600">
                  Locked
                </p>
              )}
            </div>
          ),
      },
      {
        key:
          'last-login',
        label:
          'Last login',
        render:
          row => (
            <AdminDate
              value={
                row.lastLoginAt
              }
            />
          ),
      },

      ...(canManageSecurity
        ? [
            {
              key:
                'actions',
              label:
                'Global security',
              render:
                (row: Row) => (
                  <UserControlActions
                    userId={
                      row.userId
                    }
                    status={
                      row.userStatus
                    }
                    lockedUntil={
                      row.lockedUntil
                    }
                  />
                ),
            } satisfies AdminTableColumn<Row>,
          ]
        : []),
    ];

  return (
    <AdminResourcePage
      title="Users & billing seats"
      description="Review users in the workspace context that SaMi actually bills. The default view mirrors the billing engine: one row per active internal workspace membership. Filter by workspace, narrow to paid-plan seats, or include inactive internal memberships when investigating access."
      baseHref="/admin/users"
      search={
        params.q ||
        ''
      }
      searchPlaceholder="Search user or workspace"
      total={
        data.total
      }
      page={
        data.page
      }
      totalPages={
        data.totalPages
      }
      rows={
        data.items
      }
      columns={
        columns
      }
      rowKey={
        row =>
          row.membershipId
      }
      emptyMessage="No workspace user seats match these filters."
      persistentQuery={{
        workspace:
          selectedWorkspace ||
          null,
        seat:
          seatFilter ===
            'billing'
            ? null
            : seatFilter,
      }}
      filterFields={
        <>
          <select
            name="workspace"
            defaultValue={
              selectedWorkspace
            }
            aria-label="Filter users by workspace"
            className="h-11 min-w-[180px] rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
          >
            <option value="">
              All workspaces
            </option>

            {workspaces.map(
              workspace => (
                <option
                  key={
                    workspace.id
                  }
                  value={
                    workspace.id
                  }
                >
                  {workspace.name}
                  {workspace.planName
                    ? ` — ${workspace.planName}`
                    : ''}
                </option>
              ),
            )}
          </select>

          <select
            name="seat"
            defaultValue={
              seatFilter
            }
            aria-label="Filter users by billing seat"
            className="h-11 min-w-[190px] rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
          >
            <option value="billing">
              Billing quantity
            </option>
            <option value="paid">
              Paid-plan seats
            </option>
            <option value="all">
              All internal memberships
            </option>
          </select>
        </>
      }
      actions={
        <div className="hidden items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-[11px] font-bold text-zinc-500 sm:flex dark:border-zinc-800">
          <CreditCard className="h-4 w-4" />
          Per-workspace billing seats
        </div>
      }
    />
  );
}
