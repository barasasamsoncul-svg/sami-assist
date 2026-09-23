import AdminResourcePage, {
  AdminDate,
  AdminStatusPill,
  type AdminTableColumn,
} from '@/app/admin/components/AdminResourcePage';

import {
  listAdminSubscriptions,
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


export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams:
    Promise<SearchParams>;
}) {
  await requireAdminCapability(
    'subscriptions.read',
  );

  const params =
    await searchParams;

  const data =
    await listAdminSubscriptions({
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
          'Workspace',
        render:
          row => (
            <div className="min-w-[200px]">
              <p className="font-black text-zinc-950 dark:text-white">
                {row.tenantName}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {row.tenantSlug}
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
            <div className="min-w-[120px]">
              <p className="font-black">
                {row.planName || row.planKey || 'Unknown'}
              </p>
              <p className="mt-1 text-[11px] uppercase text-zinc-400">
                {row.billingCycle || '—'}
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
            <AdminStatusPill
              value={
                row.status
              }
            />
          ),
      },
      {
        key:
          'provider',
        label:
          'Provider',
        render:
          row => (
            <div className="min-w-[120px]">
              <p className="font-bold capitalize">
                {row.provider || 'Not pinned'}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {row.recurringStatus || 'No recurring status'}
              </p>
            </div>
          ),
      },
      {
        key:
          'trial',
        label:
          'Trial ends',
        render:
          row => (
            <AdminDate
              value={
                row.trialEndsAt
              }
            />
          ),
      },
      {
        key:
          'period',
        label:
          'Period ends',
        render:
          row => (
            <AdminDate
              value={
                row.currentPeriodEnd
              }
            />
          ),
      },
    ];

  return (
    <AdminResourcePage
      title="Subscriptions"
      description="Track workspace plans, lifecycle state, billing-provider pinning, recurring status, trial deadlines and current billing periods across SaMi."
      baseHref="/admin/subscriptions"
      search={
        params.q ||
        ''
      }
      searchPlaceholder="Search workspace, plan or status"
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
      emptyMessage="No subscriptions match this search."
    />
  );
}
