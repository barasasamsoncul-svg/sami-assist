import {
  notFound,
} from 'next/navigation';

import AppSurfaceShell from '@/app/components/apps/AppSurfaceShell';

import SalesWorkspaceClient from '@/app/apps/sales/SalesWorkspaceClient';

import {
  getSamiAppUiProfile,
} from '@/lib/apps/ui-profiles';

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
  getSalesWorkspaceData,
} from '@/lib/apps/sales/service';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default async function SalesPage() {
  const session =
    await requirePageSession(
      '/apps/sales',
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

  if (
    !shell
      .accessibleModuleKeys
      .includes(
        'sales',
      )
  ) {
    notFound();
  }

  const [
    data,
    notifications,
  ] =
    await Promise.all([
      getSalesWorkspaceData(),
      getWorkspaceNotificationSummary()
        .catch(
          () => null,
        ),
    ]);

  const uiProfile =
    getSamiAppUiProfile(
      'sales',
    );

  return (
    <AppSurfaceShell
      appKey="sales"
      appCategory="sales"
      profile={
        uiProfile
      }
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
            .isOwner ||
          permissions
            .permissionSet
            .has(
              SAMI_PERMISSIONS
                .FILES_VIEW,
            ),
        notificationsEnabled:
          permissions
            .isOwner ||
          permissions
            .permissionSet
            .has(
              SAMI_PERMISSIONS
                .NOTIFICATIONS_VIEW,
            ),
      }}
      unreadNotifications={
        notifications
          ?.unreadCount ||
        0
      }
      title="Sales"
      description="Quotations, approvals, sales orders, fulfillment and invoicing."
      contextLabel={
        data.company.name
      }
    >
      <SalesWorkspaceClient
        initialData={
          data
        }
        userId={
          session.user.id
        }
      />
    </AppSurfaceShell>
  );
}
