import Link from 'next/link';

import {
  ArrowLeft,
} from 'lucide-react';

import {
  notFound,
  redirect,
} from 'next/navigation';

import WorkspaceShell from '@/app/components/workspace/WorkspaceShell';
import SamiAppIconTile from '@/app/components/apps/SamiAppIconTile';
import EnterpriseModuleWorkspaceClient from '@/app/apps/[appKey]/EnterpriseModuleWorkspaceClient';

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

import {
  getWorkspaceNotificationSummary,
} from '@/lib/services/workspace-notifications';

import {
  getEnterpriseModuleWorkspace,
} from '@/lib/apps/enterprise/service';


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
      '/apps/' +
      appKey,
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
        .isOwner ||
      permissions
        .permissionSet
        .has(
          permission,
        );

  const [
    data,
    notifications,
  ] =
    await Promise.all([
      getEnterpriseModuleWorkspace(
        canonicalKey,
      )
        .catch(
          error => {
            console.error(
              '[SaMi] Enterprise workspace load failed:',
              {
                moduleKey:
                  canonicalKey,
                error,
              },
            );

            return null;
          },
        ),
      getWorkspaceNotificationSummary()
        .catch(
          () => null,
        ),
    ]);

  if (
    !data
  ) {
    notFound();
  }

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
      unreadNotifications={
        notifications
          ?.unreadCount ||
        0
      }
      title={
        app.name
      }
      description={
        app.description
      }
      contextLabel={
        data.company.name
      }
      actions={
        <div className="flex items-center gap-2">
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
            size="sm"
          />

          <Link
            href="/apps"
            className={[
              'inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold shadow-[var(--sami-shadow-sm)] transition hover:-translate-y-px',
              visual.border,
              visual.soft,
              visual.text,
            ].join(
              ' ',
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">
              All Apps
            </span>
          </Link>
        </div>
      }
      contentClassName="max-w-[1600px]"
    >
      <EnterpriseModuleWorkspaceClient
        initialData={
          data
        }
        userId={
          session.user.id
        }
      />
    </WorkspaceShell>
  );
}
