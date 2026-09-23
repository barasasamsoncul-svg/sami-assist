import {
  CreditCard,
  UsersRound,
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
};


function money(
  value:
    number |
    null |
    undefined,
  currency =
    'KES',
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    !Number.isFinite(
      value,
    )
  ) {
    return '—';
  }

  return `${currency} ${value.toLocaleString(
    'en-KE',
    {
      minimumFractionDigits:
        0,
      maximumFractionDigits:
        2,
    },
  )}`;
}


function settlementLabel(
  value:
    string,
) {
  switch (
    value
  ) {
    case 'cleared':
      return 'Cleared';
    case 'due':
      return 'Not cleared';
    case 'pending':
      return 'Payment pending';
    case 'trial':
      return 'Trial — no charge due';
    case 'free':
      return 'Free — no charge';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Unknown';
  }
}


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
          'owner',
        label:
          'Owner',
        render:
          row =>
            row.owner ? (
              <div className="min-w-[210px]">
                <p className="font-black text-zinc-950 dark:text-white">
                  {row.owner.name}
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {row.owner.email}
                </p>
                <div className="mt-2">
                  <AdminStatusPill
                    value={
                      row.owner.status
                    }
                  />
                </div>
              </div>
            ) : (
              <span className="font-bold text-amber-600">
                Owner not resolved
              </span>
            ),
      },
      {
        key:
          'workspace',
        label:
          'Workspace',
        render:
          row => (
            <div className="min-w-[185px]">
              <p className="font-black text-zinc-950 dark:text-white">
                {row.workspace.name}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {row.workspace.slug}
              </p>
              <div className="mt-2">
                <AdminStatusPill
                  value={
                    row.workspace.status
                  }
                />
              </div>
            </div>
          ),
      },
      {
        key:
          'users',
        label:
          'Users',
        render:
          row => (
            <details className="group min-w-[210px]">
              <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-black text-zinc-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-blue-500/30 dark:hover:bg-blue-500/10 dark:hover:text-blue-300">
                <UsersRound className="h-4 w-4" />
                {row.users.billable.toLocaleString(
                  'en-KE',
                )} billable {row.users.billable === 1 ? 'user' : 'users'}
              </summary>

              <div className="mt-2 w-[320px] max-w-[75vw] rounded-2xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-2 dark:border-zinc-900">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">
                      Workspace users
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                      {row.users.activeInternal.toLocaleString(
                        'en-KE',
                      )} active internal · {row.users.allInternal.length.toLocaleString(
                        'en-KE',
                      )} total internal
                    </p>
                  </div>
                </div>

                <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
                  {row.users.allInternal.map(
                    member => (
                      <div
                        key={
                          member.id
                        }
                        className="rounded-xl border border-zinc-100 px-3 py-2 dark:border-zinc-900"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-black text-zinc-900 dark:text-white">
                              {member.name}
                              {member.isOwner
                                ? ' · Owner'
                                : ''}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] text-zinc-500">
                              {member.email}
                            </p>
                          </div>

                          <AdminStatusPill
                            value={
                              member.status
                            }
                          />
                        </div>

                        {member.lastLoginAt && (
                          <p className="mt-1 text-[9px] text-zinc-400">
                            Last login {new Date(
                              member.lastLoginAt,
                            ).toLocaleString(
                              'en-KE',
                              {
                                dateStyle:
                                  'medium',
                                timeStyle:
                                  'short',
                              },
                            )}
                          </p>
                        )}
                      </div>
                    ),
                  )}

                  {row.users.allInternal.length ===
                    0 && (
                    <p className="px-1 py-3 text-[11px] text-zinc-500">
                      No internal users are currently attached to this workspace.
                    </p>
                  )}
                </div>
              </div>
            </details>
          ),
      },
      {
        key:
          'charge',
        label:
          'Monthly charge',
        render:
          row => (
            <div className="min-w-[165px]">
              <p className="text-sm font-black text-zinc-950 dark:text-white">
                {money(
                  row.billing
                    .expectedMonthlyAmount,
                  row.billing
                    .currency,
                )}
              </p>

              <p className="mt-1 text-[10px] leading-4 text-zinc-500">
                {row.billing
                  .pricePerUserMonthly !==
                  null
                  ? `${row.users.billable.toLocaleString(
                      'en-KE',
                    )} × ${money(
                      row.billing
                        .pricePerUserMonthly,
                      row.billing
                        .currency,
                    )}`
                  : 'No pricing authority'}
              </p>

              <p className="mt-2 text-[10px] font-bold text-zinc-500">
                {row.subscription
                  ?.planName ||
                  row.subscription
                    ?.planKey ||
                  'No subscription'}
              </p>
            </div>
          ),
      },
      {
        key:
          'payment',
        label:
          'Payment',
        render:
          row => (
            <div className="min-w-[175px]">
              <AdminStatusPill
                value={
                  row.billing
                    .settlement
                }
              />

              <p className={[
                'mt-2 text-[11px] font-black',
                row.billing
                  .cleared
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : row.billing
                      .settlement ===
                      'pending'
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-red-700 dark:text-red-300',
              ].join(
                ' ',
              )}>
                {settlementLabel(
                  row.billing
                    .settlement,
                )}
              </p>

              {row.latestPayment && (
                <div className="mt-2 space-y-1 text-[10px] text-zinc-500">
                  <p>
                    Latest: {money(
                      row.latestPayment
                        .amount,
                      row.latestPayment
                        .currency,
                    )} · {row.latestPayment.status}
                  </p>
                  <p className="capitalize">
                    {row.latestPayment.provider || 'provider not recorded'}
                  </p>
                  {row.latestPayment.updatedAt && (
                    <AdminDate
                      value={
                        row.latestPayment
                          .updatedAt
                      }
                    />
                  )}
                </div>
              )}
            </div>
          ),
      },
      {
        key:
          'period',
        label:
          'Billing period',
        render:
          row => (
            <div className="min-w-[155px] space-y-2 text-[10px]">
              <div>
                <p className="font-black uppercase tracking-wide text-zinc-400">
                  Subscription
                </p>
                <div className="mt-1">
                  <AdminStatusPill
                    value={
                      row.subscription
                        ?.status ||
                      'missing'
                    }
                  />
                </div>
              </div>

              <div>
                <p className="font-black uppercase tracking-wide text-zinc-400">
                  Period ends
                </p>
                <div className="mt-1">
                  <AdminDate
                    value={
                      row.subscription
                        ?.currentPeriodEnd ||
                      row.subscription
                        ?.trialEndsAt ||
                      null
                    }
                  />
                </div>
              </div>
            </div>
          ),
      },

      ...(canManageSecurity
        ? [
            {
              key:
                'actions',
              label:
                'Owner security',
              render:
                (row: Row) =>
                  row.owner ? (
                    <UserControlActions
                      userId={
                        row.owner
                          .userId
                      }
                      status={
                        row.owner
                          .status
                      }
                      lockedUntil={
                        row.owner
                          .lockedUntil
                      }
                    />
                  ) : null,
            } satisfies AdminTableColumn<Row>,
          ]
        : []),
    ];

  return (
    <AdminResourcePage
      title="Workspace customers"
      description="One row per SaMi workspace. See the owner, open the billable-user count to inspect every internal user, compare the current monthly charge with the plan and seat count, and immediately see whether the workspace is cleared, pending or unpaid."
      baseHref="/admin/users"
      search={
        params.q ||
        ''
      }
      searchPlaceholder="Search owner, user or workspace"
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
          row.workspace.id
      }
      emptyMessage="No workspaces match this search."
      persistentQuery={{
        workspace:
          selectedWorkspace ||
          null,
      }}
      filterFields={
        <select
          name="workspace"
          defaultValue={
            selectedWorkspace
          }
          aria-label="Filter customers by workspace"
          className="h-11 min-w-[190px] rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
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
      }
      actions={
        <div className="hidden items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-[11px] font-bold text-zinc-500 sm:flex dark:border-zinc-800">
          <CreditCard className="h-4 w-4" />
          Owner → workspace → users → billing
        </div>
      }
    />
  );
}
