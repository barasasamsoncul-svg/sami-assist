import AdminResourcePage, {
  AdminDate,
  AdminStatusPill,
  type AdminTableColumn,
} from '@/app/admin/components/AdminResourcePage';

import WorkspaceControlActions from '@/app/admin/components/WorkspaceControlActions';

import {
  hasAdminCapability,
} from '@/lib/admin/capabilities';

import {
  listAdminTenants,
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
};


export default async function AdminBusinessesPage({
  searchParams,
}: {
  searchParams:
    Promise<SearchParams>;
}) {
  const session =
    await requireAdminCapability(
      'tenants.read',
    );

  const canManage =
    hasAdminCapability(
      session.role,
      'tenants.manage',
    );

  const params =
    await searchParams;

  const data =
    await listAdminTenants({
      page:
        params.page,
      search:
        params.q,
    });

  type Row =
    (typeof data.items)[number];

  const columns:
    readonly AdminTableColumn<Row>[] = [
      {
        key:
          'workspace',
        label:
          'Business / workspace',
        render:
          row => (
            <div className="min-w-[220px]">
              <p className="font-black text-zinc-950 dark:text-white">
                {row.name}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {row.slug}
              </p>
            </div>
          ),
      },
      {
        key:
          'status',
        label:
          'Status',
        render:
          row => (
            <div className="min-w-[140px] space-y-1.5">
              <AdminStatusPill
                value={
                  row.status
                }
              />

              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[9px] font-black uppercase tracking-wide text-zinc-400">
                  DB
                </span>

                <AdminStatusPill
                  value={
                    row.database
                      .lifecycleStatus
                  }
                />

                <AdminStatusPill
                  value={
                    row.database
                      .healthStatus
                  }
                />
              </div>

              {row.database.failureCode && (
                <p className="font-mono text-[9px] text-red-600 dark:text-red-400">
                  {row.database.failureCode}
                </p>
              )}
            </div>
          ),
      },
      {
        key:
          'owner',
        label:
          'Owner',
        render:
          row => (
            <div className="min-w-[210px]">
              <p className="font-bold">
                {row.owner.name || '—'}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {row.owner.email || 'No owner email'}
              </p>
            </div>
          ),
      },
      {
        key:
          'members',
        label:
          'Members',
        render:
          row => (
            <span className="font-black">
              {row.activeMembers}
            </span>
          ),
      },
      {
        key:
          'subscription',
        label:
          'Subscription',
        render:
          row =>
            row.subscription ? (
              <div className="min-w-[150px]">
                <p className="font-black">
                  {row.subscription.planName || row.subscription.planKey || 'Plan'}
                </p>
                <div className="mt-1">
                  <AdminStatusPill
                    value={
                      row.subscription.status
                    }
                  />
                </div>
              </div>
            ) : (
              <span className="text-zinc-400">
                None
              </span>
            ),
      },
      {
        key:
          'health-check',
        label:
          'DB checked',
        render:
          row => (
            <AdminDate
              value={
                row.database
                  .lastHealthCheckAt
              }
            />
          ),
      },

      {
        key:
          'created',
        label:
          'Created',
        render:
          row => (
            <AdminDate
              value={
                row.createdAt
              }
            />
          ),
      },

      ...(canManage
        ? [
            {
              key:
                'actions',
              label:
                'Operations',
              render:
                (row: Row) => (
                  <WorkspaceControlActions
                    tenantId={
                      row.id
                    }
                    workspaceStatus={
                      row.status
                    }
                    databaseHealthStatus={
                      row.database
                        .healthStatus
                    }
                  />
                ),
            } satisfies AdminTableColumn<Row>,
          ]
        : []),
    ];

  return (
    <AdminResourcePage
      title="Businesses"
      description="Platform-wide workspace oversight: owners, membership footprint, lifecycle state and subscription linkage without exposing tenant database credentials or internal connection details."
      baseHref="/admin/businesses"
      search={
        params.q ||
        ''
      }
      searchPlaceholder="Search business, slug or owner email"
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
          row.id
      }
      emptyMessage="No businesses match this search."
    />
  );
}
