import WorkspaceAiClient from '@/app/components/workspace/WorkspaceAiClient';

import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';

import {
  getPermissionContext,
} from '@/lib/auth/permission-context';

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

export default async function SamiAiPage() {
  const session =
    await requirePageSession(
      '/ai',
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
    <WorkspaceAiClient
      entitled={
        shell.aiAvailable
      }
    />
  );
}
