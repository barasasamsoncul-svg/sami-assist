import {
  notFound,
} from 'next/navigation';

import WorkspaceShell from '@/app/components/workspace/WorkspaceShell';

import SalesQuoteDetailClient from '@/app/apps/sales/SalesQuoteDetailClient';

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
  getSalesQuoteDetail,
  getSalesWorkspaceData,
} from '@/lib/apps/sales/service';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default async function SalesQuotePage({
  params,
}: {
  params:
    Promise<{
      quoteId:
        string;
    }>;
}) {
  const {
    quoteId,
  } =
    await params;

  const session =
    await requirePageSession(
      '/apps/sales/quotes/' +
      quoteId,
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
    quote,
    workspace,
    notifications,
  ] =
    await Promise.all([
      getSalesQuoteDetail(
        quoteId,
      ),
      getSalesWorkspaceData(),
      getWorkspaceNotificationSummary()
        .catch(
          () => null,
        ),
    ]);

  if (
    !quote
  ) {
    notFound();
  }

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
      title={
        quote.quoteNumber
      }
      description="Quotation lifecycle, approvals, delivery, customer response and conversion."
      contextLabel={
        workspace.company.name
      }
      contentClassName="max-w-[1600px]"
    >
      <SalesQuoteDetailClient
        quote={
          quote
        }
        workspace={
          workspace
        }
      />
    </WorkspaceShell>
  );
}
