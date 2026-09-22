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
  getWorkspaceIntegrationState,
} from '@/lib/services/workspace-integrations';

import IntegrationsClient from './IntegrationsClient';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

export default async function IntegrationsPage() {
  const session =
    await requirePageSession(
      '/integrations',
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

  const canIntegrations =
    permissions.isOwner ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .INTEGRATIONS_VIEW,
    ) ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .INTEGRATIONS_MANAGE,
    );

  if (
    !canIntegrations
  ) {
    notFound();
  }

  const shell =
    resolveWorkspaceShellAccess({
      modules:
        account.modules,
      subscription:
        account.subscription,
      permissions,
    });

  const integrations =
    await getWorkspaceIntegrationState();

  const initialState =
    JSON.parse(
      JSON.stringify(
        integrations,
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
      title="Integrations"
      description="Connect approved services, receive verified events and provision external business apps from one company-scoped control center."
      contextLabel={
        account.tenant
          ?.name ||
        null
      }
      contentClassName="max-w-[1540px]"
    >
      <IntegrationsClient
        initialState={
          initialState
        }
      />
    </WorkspaceShell>
  );
}
