import {
  notFound,
} from 'next/navigation';

import WorkspaceShell from '@/app/components/workspace/WorkspaceShell';

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
  getWorkspaceAutomationState,
} from '@/lib/services/workspace-automation';

import AutomationClient from './AutomationClient';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

export default async function AutomationPage() {
  const session =
    await requirePageSession(
      '/automation',
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

  const canAutomation =
    permissions.isOwner ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .AUTOMATION_VIEW,
    ) ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .AUTOMATION_MANAGE,
    );

  if (
    !canAutomation
  ) {
    notFound();
  }

  const [
    shell,
    automation,
  ] = [
    resolveWorkspaceShellAccess({
      modules:
        account.modules,
      subscription:
        account.subscription,
      permissions,
    }),
    await getWorkspaceAutomationState(),
  ];

  const initialState =
    JSON.parse(
      JSON.stringify(
        automation,
      ),
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
          permissions
            .permissionSet
            .has(
              SAMI_PERMISSIONS
                .FILES_VIEW,
            ),
        notificationsEnabled:
          true,
      }}
      title="Automation"
      description="Build reliable workflows from the triggers and actions your current business access allows."
      contextLabel={
        account.tenant
          ?.name ||
        null
      }
      contentClassName="max-w-[1540px]"
    >
      <AutomationClient
        initialState={
          initialState
        }
      />
    </WorkspaceShell>
  );
}
