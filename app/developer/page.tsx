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
  getSamiPlanPolicy,
  isSubscriptionEntitledNow,
} from '@/lib/billing/plan-policy';

import {
  requirePageSession,
} from '@/lib/auth/require-page-session';

import {
  resolveWorkspaceShellAccess,
} from '@/lib/auth/workspace-shell';

import {
  getWorkspaceDeveloperState,
} from '@/lib/services/workspace-developer';

import DeveloperApiOverview from './DeveloperApiOverview';
import DeveloperClient from './DeveloperClient';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

export default async function DeveloperPage() {
  const session =
    await requirePageSession(
      '/developer',
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

  const planAllowsDeveloper =
    Boolean(
      account.subscription &&
      isSubscriptionEntitledNow(
        account.subscription
          .status,
      ) &&
      getSamiPlanPolicy(
        account.subscription
          .planKey,
      )
        ?.developerApi
        .enabled ===
        true,
    );

  const canDeveloper =
    planAllowsDeveloper &&
    (
      permissions.isOwner ||
      permissions.permissionSet.has(
        SAMI_PERMISSIONS
          .API_VIEW,
      ) ||
      permissions.permissionSet.has(
        SAMI_PERMISSIONS
          .API_MANAGE,
      )
    );

  if (
    !canDeveloper
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

  const developer =
    await getWorkspaceDeveloperState();

  const initialState =
    JSON.parse(
      JSON.stringify(
        developer,
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
      title="Developer Access"
      description="Connect approved external systems to SaMi with company-scoped API credentials, explicit scopes and auditable request boundaries."
      contextLabel={
        account.tenant
          ?.name ||
        null
      }
      contentClassName="max-w-[1540px]"
    >
      <DeveloperApiOverview />

      <DeveloperClient
        initialState={
          initialState
        }
      />
    </WorkspaceShell>
  );
}
