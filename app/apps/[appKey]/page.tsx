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
import SamiAppIconTile from '@/app/components/apps/SamiAppIconTile';

import {
  getSaMiAppVisual,
} from '@/lib/apps/visual-registry';

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

  const visual =
    getSaMiAppVisual(
      app.registryKey,
      app.category,
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
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs font-semibold text-slate-600 shadow-[var(--sami-shadow-sm)] transition hover:-translate-y-px hover:bg-[var(--sami-surface-soft)] dark:text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">
            All Apps
          </span>
        </Link>
      }
      contentClassName="max-w-[1400px]"
    >
      <section className="sami-surface overflow-hidden rounded-[28px]">
        <div className="relative overflow-hidden border-b border-[var(--sami-border)] p-5 sm:p-7">
          <div
            aria-hidden="true"
            className={[
              'absolute -right-20 -top-20 h-56 w-56 rounded-full opacity-[0.10] blur-3xl',
              visual.dot,
            ].join(
              ' ',
            )}
          />

          <div className="relative flex items-start gap-4">
            <SamiAppIconTile
              appKey={
                app.registryKey
              }
              category={
                app.category
              }
              iconKey={
                app.iconKey
              }
              size="xl"
            />

            <div className="min-w-0 flex-1">
              <p
                className={[
                  'text-[10px] font-bold uppercase tracking-[0.14em]',
                  visual.text,
                ].join(
                  ' ',
                )}
              >
                {app.categoryLabel}
              </p>

              <h1 className="mt-1 text-2xl font-black tracking-[-0.03em] sm:text-3xl">
                {app.name}
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                {app.description}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div
            className={[
              'rounded-[22px] border p-5',
              visual.soft,
              visual.border,
            ].join(
              ' ',
            )}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              App workspace
            </p>

            <p className="mt-2 text-sm font-bold">
              App installed
            </p>

            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">
              {app.name} is available in your workspace and follows your current company access and permissions. Additional features for this app will appear here as they become available.
            </p>

            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <AppFact
                label="Company"
                value="Current"
              />
              <AppFact
                label="Access"
                value="Applied"
              />
              <AppFact
                label="SaMi AI"
                value="Available"
              />
            </div>
          </div>

          <div className="sami-soft-surface rounded-[22px] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Access
            </p>

            <div className="mt-3 flex items-center gap-2">
              <span
                className={[
                  'h-2 w-2 rounded-full',
                  visual.dot,
                ].join(
                  ' ',
                )}
              />
              <p className="text-sm font-bold">
                Available to you
              </p>
            </div>

            <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
              This app is available to you based on your workspace access and current company.
            </p>

            <Link
              href="/apps"
              className={[
                'mt-5 inline-flex items-center gap-2 text-xs font-semibold',
                visual.text,
              ].join(
                ' ',
              )}
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


function AppFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-black/5 bg-white/70 px-3 py-2.5 dark:border-white/10 dark:bg-black/10">
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-[11px] font-bold text-slate-700 dark:text-slate-200">
        {value}
      </p>
    </div>
  );
}
