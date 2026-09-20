import WorkspaceShell from '@/app/components/workspace/WorkspaceShell';

import {
  WorkspaceSearchPageClient,
} from '@/app/components/workspace/WorkspaceSearch';

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

export default async function SearchPage() {
  const session =
    await requirePageSession(
      '/search',
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
          permissions.permissionSet
            .has(
              SAMI_PERMISSIONS
                .FILES_VIEW,
            ),
        notificationsEnabled:
          true,
      }}
      title="Search"
      description="Find only what your current SaMi access allows you to see."
      contextLabel={
        account.tenant
          ?.name ||
        null
      }
      contentClassName="max-w-[1200px]"
    >
      <WorkspaceSearchPageClient />
    </WorkspaceShell>
  );
}
