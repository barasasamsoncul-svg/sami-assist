import {
  notFound,
} from 'next/navigation';

import WorkspaceShell from '@/app/components/workspace/WorkspaceShell';
import InvoicingWorkspaceClient from '@/app/apps/invoicing/InvoicingWorkspaceClient';

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
  getInvoicingWorkspaceData,
} from '@/lib/apps/invoicing/service';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default async function InvoicingPage() {
  const session =
    await requirePageSession(
      '/apps/invoicing',
    );

  const [
    accountContext,
    permissionContext,
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
        accountContext.modules,
      subscription:
        accountContext.subscription,
      permissions:
        permissionContext,
    });

  if (
    !shell
      .accessibleModuleKeys
      .includes(
        'invoicing',
      )
  ) {
    notFound();
  }

  const [
    data,
    notificationResult,
  ] =
    await Promise.all([
      getInvoicingWorkspaceData(),

      getWorkspaceNotificationSummary()
        .catch(
          () => null,
        ),
    ]);

  return (
    <WorkspaceShell
      user={
        session.user
      }
      tenant={
        accountContext.tenant
      }
      membership={
        accountContext.membership
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
          permissionContext
            .permissionSet
            .has(
              SAMI_PERMISSIONS
                .FILES_VIEW,
            ),

        notificationsEnabled:
          permissionContext
            .permissionSet
            .has(
              SAMI_PERMISSIONS
                .NOTIFICATIONS_VIEW,
            ),
      }}
      unreadNotifications={
        notificationResult
          ?.unreadCount ||
        0
      }
      title="Invoicing"
      description="Invoices, receivables, payments, recurring billing and customer billing records."
      contextLabel={
        data.company.name
      }
      contentClassName="max-w-[1600px]"
    >
      <InvoicingWorkspaceClient
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
