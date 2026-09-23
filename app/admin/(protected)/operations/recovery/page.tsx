import {
  Archive,
  Database,
  ShieldCheck,
} from 'lucide-react';

import TenantRecoveryManager from '@/app/admin/components/TenantRecoveryManager';

import {
  hasAdminCapability,
} from '@/lib/admin/capabilities';

import {
  getPlatformRecoveryOverview,
} from '@/lib/admin/recovery-operations';

import {
  requireAdminCapability,
} from '@/lib/admin/require-capability';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default async function AdminRecoveryPage() {
  const session =
    await requireAdminCapability(
      'tenants.read',
    );

  const overview =
    await getPlatformRecoveryOverview();

  const canManage =
    hasAdminCapability(
      session.role,
      'tenants.manage',
    );

  const managedWorkspaces =
    overview.workspaces.filter(
      workspace =>
        Boolean(
          workspace.databaseName,
        ) &&
        !workspace.purgedAt,
    );

  const totalAvailable =
    managedWorkspaces.reduce(
      (
        total,
        workspace,
      ) =>
        total +
        workspace
          .availableRecoveryPoints,
      0,
    );

  return (
    <div className="space-y-6">
      <section className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
          Operations
        </p>

        <h1 className="mt-2 text-2xl font-black tracking-[-0.035em] text-zinc-950 dark:text-white sm:text-3xl">
          Backups & Recovery
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          Control tenant recovery points, verify private backup storage and perform guarded restores into fresh databases. Production tenant databases are never overwritten by this console.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-[22px] border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
              <Database className="h-4 w-4" />
            </span>

            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">
                Managed tenant DBs
              </p>

              <strong className="mt-1 block text-2xl font-black text-zinc-950 dark:text-white">
                {managedWorkspaces.length}
              </strong>
            </div>
          </div>
        </section>

        <section className="rounded-[22px] border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
              <Archive className="h-4 w-4" />
            </span>

            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">
                Available recovery points
              </p>

              <strong className="mt-1 block text-2xl font-black text-zinc-950 dark:text-white">
                {totalAvailable}
              </strong>
            </div>
          </div>
        </section>

        <section className="rounded-[22px] border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
            </span>

            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">
                Restore policy
              </p>

              <strong className="mt-1 block text-sm font-black text-zinc-950 dark:text-white">
                Fresh database only
              </strong>
            </div>
          </div>
        </section>
      </div>

      <TenantRecoveryManager
        available={
          overview.available
        }
        error={
          overview.error
        }
        canManage={
          canManage
        }
        workspaces={
          managedWorkspaces
        }
        recoveryPoints={
          overview.recoveryPoints
        }
      />
    </div>
  );
}
