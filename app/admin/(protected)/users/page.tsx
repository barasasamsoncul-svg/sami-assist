import {
  ShieldCheck,
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

  const data =
    await listAdminUsers({
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
          'security',
        label:
          'Security',
        render:
          row => (
            <div className="min-w-[150px] space-y-1 text-[11px]">
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
          'workspaces',
        label:
          'Workspaces',
        render:
          row => (
            <span className="font-black">
              {row.workspaceCount}
            </span>
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

      ...(canManageSecurity
        ? [
            {
              key:
                'actions',
              label:
                'Security controls',
              render:
                (row: Row) => (
                  <UserControlActions
                    userId={
                      row.id
                    }
                    status={
                      row.status
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
      title="Users"
      description="Search global SaMi identities, account state, security posture and workspace membership count. User identity is global; business permissions remain isolated inside each workspace."
      baseHref="/admin/users"
      search={
        params.q ||
        ''
      }
      searchPlaceholder="Search name or email"
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
      emptyMessage="No users match this search."
      actions={
        <div className="hidden items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-[11px] font-bold text-zinc-500 sm:flex dark:border-zinc-800">
          <ShieldCheck className="h-4 w-4" />
          Global identity registry
        </div>
      }
    />
  );
}
