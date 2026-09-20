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

import WorkspaceShell from '@/app/components/workspace/WorkspaceShell';
import WorkspaceNotificationCenter from '@/app/components/workspace/WorkspaceNotificationCenter';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

export default async function NotificationsPage() {
  const session =
    await requirePageSession(
      '/notifications',
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
          ) ||
          permissions.isOwner,
      }}
      title="Notifications & Messages"
      description="Workspace alerts, employee communication and notification preferences."
      contextLabel={
        account.tenant?.name ||
        null
      }
      contentClassName="max-w-[1500px]"
    >
      <WorkspaceNotificationCenter
        mode="page"
        userId={
          session.user.id
        }
      />
    </WorkspaceShell>
  );
}
