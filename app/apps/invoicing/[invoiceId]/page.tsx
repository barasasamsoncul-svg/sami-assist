import {
  notFound,
} from 'next/navigation';

import WorkspaceShell from '@/app/components/workspace/WorkspaceShell';
import InvoiceDetailClient from '@/app/apps/invoicing/[invoiceId]/InvoiceDetailClient';

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
  getInvoicingInvoiceDetail,
  getInvoicingWorkspaceData,
} from '@/lib/apps/invoicing/service';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default async function InvoiceDetailPage({
  params,
}: {
  params:
    Promise<{
      invoiceId:
        string;
    }>;
}) {
  const {
    invoiceId,
  } =
    await params;

  const session =
    await requirePageSession(
      '/apps/invoicing/' +
      invoiceId,
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
    invoice,
    notificationResult,
  ] =
    await Promise.all([
      getInvoicingWorkspaceData(),
      getInvoicingInvoiceDetail(
        invoiceId,
      ),
      getWorkspaceNotificationSummary()
        .catch(
          () => null,
        ),
    ]);

  if (
    !invoice
  ) {
    notFound();
  }

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
      title={
        invoice.invoiceNumber
      }
      description="Invoice document, customer snapshot, receivable balance and audit trail."
      contextLabel={
        data.company.name
      }
      contentClassName="max-w-[1600px]"
    >
      <InvoiceDetailClient
        data={
          data
        }
        invoice={
          invoice
        }
      />
    </WorkspaceShell>
  );
}
