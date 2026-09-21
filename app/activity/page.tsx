import WorkspaceShell from '@/app/components/workspace/WorkspaceShell';
import WorkspaceActivityClient from '@/app/components/workspace/WorkspaceActivityClient';

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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  const session =
    await requirePageSession('/activity');

  const [account, permissions] =
    await Promise.all([
      getAccountContextForUser(
        session.user.id,
        session.currentTenantId,
      ),
      getPermissionContext(),
    ]);

  const shell =
    resolveWorkspaceShellAccess({
      modules: account.modules,
      subscription: account.subscription,
      permissions,
    });

  const can = (permission: string) =>
    permissions.permissionSet.has(permission);

  return (
    <WorkspaceShell
      user={session.user}
      tenant={account.tenant}
      membership={account.membership}
      subscription={shell.subscription}
      modules={shell.accessibleModules}
      sidebarCapabilities={{
        aiEnabled: shell.aiAvailable,
        filesEnabled: can(
          SAMI_PERMISSIONS.FILES_VIEW,
        ),
        notificationsEnabled: true,
      }}
      title="My Activity & Audit"
      description="Your personal business timeline, with broader audit visibility available only to authorized users."
      contextLabel={account.tenant?.name || null}
      contentClassName="max-w-[1500px]"
    >
      <WorkspaceActivityClient />
    </WorkspaceShell>
  );
}
