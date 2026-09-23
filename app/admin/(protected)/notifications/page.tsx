import AdminResourcePage, {
  AdminDate,
  AdminStatusPill,
  type AdminTableColumn,
} from '@/app/admin/components/AdminResourcePage';

import {
  listAdminNotificationEvents,
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


export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams:
    Promise<SearchParams>;
}) {
  await requireAdminCapability(
    'notifications.read',
  );

  const params =
    await searchParams;

  const data =
    await listAdminNotificationEvents({
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
          'event',
        label:
          'Delivery / event',
        render:
          row => (
            <div className="min-w-[240px]">
              <p className="font-black text-zinc-950 dark:text-white">
                {row.eventType || row.action || 'Notification event'}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {row.action || '—'}
              </p>
            </div>
          ),
      },
      {
        key:
          'result',
        label:
          'Result',
        render:
          row => (
            <AdminStatusPill
              value={
                row.result
              }
            />
          ),
      },
      {
        key:
          'workspace',
        label:
          'Workspace',
        render:
          row => (
            <span className="font-mono text-[10px] text-zinc-500">
              {row.tenantId || '—'}
            </span>
          ),
      },
      {
        key:
          'user',
        label:
          'User',
        render:
          row => (
            <span className="font-mono text-[10px] text-zinc-500">
              {row.userId || 'system'}
            </span>
          ),
      },
      {
        key:
          'time',
        label:
          'Time',
        render:
          row => (
            <AdminDate
              value={
                row.createdAt
              }
            />
          ),
      },
    ];

  return (
    <AdminResourcePage
      title="Notifications"
      description="Operational notification activity and delivery-related events. Platform Admin does not expose tenant notification message bodies across isolated databases; failures and delivery state belong here instead."
      baseHref="/admin/notifications"
      search={
        params.q ||
        ''
      }
      searchPlaceholder="Search notification or billing event"
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
      emptyMessage="No notification events match this search."
    />
  );
}
