import AdminResourcePage, {
  AdminDate,
  AdminStatusPill,
  type AdminTableColumn,
} from '@/app/admin/components/AdminResourcePage';

import {
  listAdminJobRuns,
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


export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams:
    Promise<SearchParams>;
}) {
  await requireAdminCapability(
    'jobs.read',
  );

  const params =
    await searchParams;

  const data =
    await listAdminJobRuns({
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
          'job',
        label:
          'Job',
        render:
          row => (
            <div className="min-w-[210px]">
              <p className="font-black text-zinc-950 dark:text-white">
                {row.jobKey}
              </p>
              <p className="mt-1 font-mono text-[10px] text-zinc-400">
                {row.correlationId}
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
            <span className="capitalize">
              {row.provider || 'internal'}
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
            <div className="min-w-[150px]">
              <p className="font-bold">
                {row.tenantName || 'Platform'}
              </p>
              <p className="mt-1 font-mono text-[10px] text-zinc-400">
                {row.tenantId || '—'}
              </p>
            </div>
          ),
      },
      {
        key:
          'duration',
        label:
          'Duration',
        render:
          row => (
            <span>
              {row.durationMs === null ? '—' : `${row.durationMs} ms`}
            </span>
          ),
      },
      {
        key:
          'error',
        label:
          'Error',
        render:
          row => (
            <div className="max-w-[260px]">
              <p className="font-mono text-[10px] font-bold text-red-600 dark:text-red-400">
                {row.errorCode || ''}
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] text-zinc-500">
                {row.errorMessage || '—'}
              </p>
            </div>
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
    ];

  return (
    <AdminResourcePage
      title="Jobs & Workers"
      description="Platform background work such as billing reconciliation, scheduled checks and internal workers should register here with correlation IDs and failure context."
      baseHref="/admin/operations/jobs"
      search={
        params.q ||
        ''
      }
      searchPlaceholder="Search job, provider, status or error code"
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
      emptyMessage="No platform job runs have been recorded yet."
    />
  );
}
