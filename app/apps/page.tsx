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
  getWorkspaceExternalAppLauncherEntries,
} from '@/lib/services/workspace-integrations';

import AppsLauncherClient from './AppsLauncherClient';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

export default async function AppsPage() {
  const session =
    await requirePageSession(
      '/apps',
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

  const externalApps =
    await getWorkspaceExternalAppLauncherEntries();

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

  return (
    <AppsLauncherClient
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
      externalApps={
        externalApps
      }
      canManageApps={
        shell.canManageApps
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
    />
  );
}
