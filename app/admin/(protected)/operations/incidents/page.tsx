import Link from 'next/link';

import AdminResourcePage, {
  AdminDate,
  AdminStatusPill,
  type AdminTableColumn,
} from '@/app/admin/components/AdminResourcePage';

import {
  listPlatformIncidents,
} from '@/lib/admin/incidents';

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


export default async function AdminIncidentsPage({
  searchParams,
}: {
  searchParams:
    Promise<SearchParams>;
}) {
  await requireAdminCapability(
    'incidents.read',
  );

  const params =
    await searchParams;

  const data =
    await listPlatformIncidents({
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
          'incident',
        label:
          'Incident',
        render:
          row => (
            <div className="min-w-[260px]">
              <Link
                href={`/admin/operations/incidents/${row.id}`}
                className="font-black text-zinc-950 underline-offset-4 hover:underline dark:text-white"
              >
                {row.title}
              </Link>

              <p className="mt-1 line-clamp-2 text-[11px] text-zinc-500">
                {row.message || row.errorName || 'No message'}
              </p>
            </div>
          ),
      },
      {
        key:
          'severity',
        label:
          'Severity',
        render:
          row => (
            <AdminStatusPill
              value={
                row.severity
              }
            />
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
          'source',
        label:
          'Source',
        render:
          row => (
            <div className="min-w-[120px]">
              <p className="font-bold capitalize">
                {row.provider || row.source}
              </p>
              <p className="mt-1 text-[10px] text-zinc-400">
                {row.category}
              </p>
            </div>
          ),
      },
      {
        key:
          'route',
        label:
          'Route / operation',
        render:
          row => (
            <div className="max-w-[220px] font-mono text-[10px] text-zinc-500">
              <p className="truncate">
                {row.route || '—'}
              </p>
              <p className="mt-1 truncate">
                {row.operation || row.errorCode || '—'}
              </p>
            </div>
          ),
      },
      {
        key:
          'occurrences',
        label:
          'Count',
        render:
          row => (
            <span className="font-black">
              {row.occurrenceCount.toLocaleString(
                'en-KE',
              )}
            </span>
          ),
      },
      {
        key:
          'last-seen',
        label:
          'Last seen',
        render:
          row => (
            <AdminDate
              value={
                row.lastSeenAt
              }
            />
          ),
      },
    ];

  return (
    <AdminResourcePage
      title="Incidents & Errors"
      description="Correlated platform failures across users, workspaces, providers and routes. Open an incident to inspect sanitized stack traces, database/provider error codes, affected workspace/user context and individual occurrences."
      baseHref="/admin/operations/incidents"
      search={
        params.q ||
        ''
      }
      searchPlaceholder="Search title, route, provider, message or error code"
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
      emptyMessage="No incidents match this search."
    />
  );
}
