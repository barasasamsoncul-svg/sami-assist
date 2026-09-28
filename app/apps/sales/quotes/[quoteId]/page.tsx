import {
  notFound,
} from 'next/navigation';

import AppSurfaceShell from '@/app/components/apps/AppSurfaceShell';

import SalesQuoteDetailClient from '@/app/apps/sales/SalesQuoteDetailClient';

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

  const uiProfile =
    getSamiAppUiProfile(
      'sales',
    );

  const appSidebarItems = [
    {
      key:
        'overview',
      label:
        'Overview',
      href:
        '/apps/sales?view=overview',
      description:
        'Pipeline health, conversion and sales value.',
    },
    {
      key:
        'quotes',
      label:
        'Quotations',
      href:
        '/apps/sales?view=quotes',
      description:
        'Create, approve, send and convert quotations.',
      badge:
        workspace.quotes.length,
    },
    ...(
      workspace.capabilities
        .canViewOrders
        ? [
            {
              key:
                'orders',
              label:
                'Sales Orders',
              href:
                '/apps/sales?view=orders',
              description:
                'Fulfillment, delivery and invoice readiness.',
              badge:
                workspace.orders.length,
            },
          ]
        : []
    ),
    ...(
      workspace.capabilities
        .canViewReports
        ? [
            {
              key:
                'reports',
              label:
                'Reports',
              href:
                '/apps/sales?view=reports',
              description:
                'Conversion, customer and monthly sales analysis.',
            },
          ]
        : []
    ),
    ...(
      workspace.capabilities
        .canManageSettings
        ? [
            {
              key:
                'settings',
              label:
                'Settings',
              href:
                '/apps/sales?view=settings',
              description:
                'Sales policy, approvals and invoice behavior.',
            },
          ]
        : []
    ),
  ];

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
      appSidebarItems={
        appSidebarItems
      }
      activeSidebarKey="quotes"
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
    >
      <SalesQuoteDetailClient
        quote={
          quote
        }
        workspace={
          workspace
        }
      />
    </AppSurfaceShell>
  );
}
