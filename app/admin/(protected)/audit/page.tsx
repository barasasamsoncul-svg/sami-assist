import AdminResourcePage, {
  AdminDate,
  AdminStatusPill,
  type AdminTableColumn,
} from '@/app/admin/components/AdminResourcePage';

import {
  listAdminAuditEvents,
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


export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams:
    Promise<SearchParams>;
}) {
  await requireAdminCapability(
    'audit.read',
  );

  const params =
    await searchParams;

  const data =
    await listAdminAuditEvents({
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
          'Event',
        render:
          row => (
            <div className="min-w-[230px]">
              <p className="font-black text-zinc-950 dark:text-white">
                {row.eventType || row.action || 'Audit event'}
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
          'actor',
        label:
          'Actor',
        render:
          row => (
            <div className="min-w-[120px] text-[11px]">
              <p className="font-bold">
                {row.actorType || 'unknown'}
              </p>
              <p className="mt-1 font-mono text-[10px] text-zinc-400">
                {row.userId || 'system'}
              </p>
            </div>
          ),
      },
      {
        key:
          'resource',
        label:
          'Resource',
        render:
          row => (
            <div className="min-w-[160px] text-[11px]">
              <p className="font-bold">
                {row.resourceType || '—'}
              </p>
              <p className="mt-1 font-mono text-[10px] text-zinc-400">
                {row.resourceId || '—'}
              </p>
            </div>
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
      title="Audit Logs"
      description="Platform-level operational audit trail. Workspace users continue to see only their authorized activity/audit scope; this view is restricted to Platform Administration capabilities."
      baseHref="/admin/audit"
      search={
        params.q ||
        ''
      }
      searchPlaceholder="Search event, action, resource or result"
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
      emptyMessage="No audit events match this search."
    />
  );
}
