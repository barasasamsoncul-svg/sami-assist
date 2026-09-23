import AdminResourcePage, {
  AdminStatusPill,
  type AdminTableColumn,
} from '@/app/admin/components/AdminResourcePage';

import {
  listAdminModules,
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


export default async function AdminAppsPage({
  searchParams,
}: {
  searchParams:
    Promise<SearchParams>;
}) {
  await requireAdminCapability(
    'modules.read',
  );

  const params =
    await searchParams;

  const data =
    await listAdminModules({
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
          'module',
        label:
          'App / module',
        render:
          row => (
            <div className="min-w-[210px]">
              <p className="font-black text-zinc-950 dark:text-white">
                {row.name}
              </p>
              <p className="mt-1 font-mono text-[10px] text-zinc-500">
                {row.key}
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
          'version',
        label:
          'Version',
        render:
          row => (
            <span className="font-mono text-[11px]">
              {row.version || '—'}
            </span>
          ),
      },
      {
        key:
          'type',
        label:
          'Type',
        render:
          row => (
            <div className="space-y-1 text-[11px]">
              <p>
                {row.isCore ? 'Core platform' : 'Business app'}
              </p>
              {row.isAiModule && (
                <p className="font-bold text-blue-600 dark:text-blue-400">
                  AI-enabled
                </p>
              )}
            </div>
          ),
      },
      {
        key:
          'workspaces',
        label:
          'Active workspaces',
        render:
          row => (
            <span className="font-black">
              {row.activeWorkspaceCount}
            </span>
          ),
      },
      {
        key:
          'dependencies',
        label:
          'Dependencies',
        render:
          row => (
            <span className="max-w-[240px] text-[11px] text-zinc-500">
              {row.dependencies.length > 0 ? row.dependencies.join(', ') : 'None'}
            </span>
          ),
      },
    ];

  return (
    <AdminResourcePage
      title="Apps"
      description="Inspect the canonical SaMi app registry, runtime status, version, dependencies and active workspace footprint. SaMi AI remains a core platform capability rather than an installable app."
      baseHref="/admin/apps"
      search={
        params.q ||
        ''
      }
      searchPlaceholder="Search app name or key"
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
      emptyMessage="No apps match this search."
    />
  );
}
