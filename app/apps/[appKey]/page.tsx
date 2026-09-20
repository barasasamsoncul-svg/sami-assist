import Link from 'next/link';

import {
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';

import {
  notFound,
  redirect,
} from 'next/navigation';

import WorkspaceShell from '@/app/components/workspace/WorkspaceShell';

import {
  getSaMiAppIcon,
} from '@/lib/apps/icon-registry';

import {
  getCanonicalAppKey,
} from '@/lib/apps/navigation-registry';

import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';

import {
  getPermissionContext,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  requirePageSession,
} from '@/lib/auth/require-page-session';

import {
  resolveWorkspaceShellAccess,
} from '@/lib/auth/workspace-shell';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

export default async function AppEntryPage({
  params,
}: {
  params:
    Promise<{
      appKey:
        string;
    }>;
}) {
  const {
    appKey,
  } =
    await params;

  const session =
    await requirePageSession(
      `/apps/${appKey}`,
    );

  const [
    account,
    permissions,
  ] =
    await Promise.all([
      getAccountContextForUser(
        session.user.id,
        session.currentTenantId,
      ),

      getPermissionContext(),
    ]);

  const shell =
    resolveWorkspaceShellAccess({
      modules:
        account.modules,

      subscription:
        account.subscription,

      permissions,
    });

  const canonicalKey =
    getCanonicalAppKey(
      appKey,
    );

  const app =
    shell.accessibleModules
      .find(
        module =>
          module.registryKey ===
            canonicalKey ||
          module.key ===
            canonicalKey,
      );

  if (
    !app
  ) {
    notFound();
  }

  if (
    appKey !==
      app.registryKey
  ) {
    redirect(
      app.href,
    );
  }

  const can =
    (
      permission:
        string,
    ) =>
      permissions
        .permissionSet
        .has(
          permission,
        );

  const Icon =
    getSaMiAppIcon(
      app.iconKey,
    );

  return (
    <WorkspaceShell
      user={
        session.user
      }
      tenant={
        account.tenant
      }
      membership={
        account.membership
      }
      subscription={
        shell.subscription
      }
      modules={
        shell.accessibleModules
      }
      sidebarCapabilities={{
        aiEnabled:
          shell.aiAvailable,

        filesEnabled:
          can(
            SAMI_PERMISSIONS
              .FILES_VIEW,
          ),

        notificationsEnabled:
          can(
            SAMI_PERMISSIONS
              .NOTIFICATIONS_VIEW,
          ),
      }}
      title={
        app.name
      }
      description={
        app.description
      }
      contextLabel={
        app.categoryLabel
      }
      actions={
        <Link
          href="/apps"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">
            All Apps
          </span>
        </Link>
      }
      contentClassName="max-w-[1400px]"
    >
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0F131B]">
        <div className="border-b border-slate-200 p-5 dark:border-white/10 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/10">
              <Icon className="h-6 w-6" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-400">
                {app.categoryLabel}
              </p>

              <h1 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">
                {app.name}
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                {app.description}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-white/10 dark:bg-white/[0.025]">
            <p className="text-sm font-bold">
              Application workspace
            </p>

            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">
              This application is installed and available to your current role. Its workspace keeps the same SaMi navigation, company context and access rules as the rest of your business tools.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5 dark:border-white/10">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Current access
            </p>

            <p className="mt-2 text-sm font-bold">
              Available
            </p>

            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              This app is available because it is installed for the workspace and permitted by your current access.
            </p>

            <Link
              href="/apps"
              className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400"
            >
              Browse other apps
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </WorkspaceShell>
  );
}
