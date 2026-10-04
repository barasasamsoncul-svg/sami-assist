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


type SalesView =
  | 'overview'
  | 'quotes'
  | 'orders'
  | 'organization'
  | 'reports'
  | 'settings';


export default async function SalesPage({
  searchParams,
}: {
  searchParams:
    Promise<{
      view?:
        string |
        string[];
    }>;
}) {
  const query =
    await searchParams;

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

  const availableViews:
    SalesView[] = [
      'overview',
      'quotes',
      ...(
        data.capabilities
          .canViewOrders
          ? [
              'orders' as const,
            ]
          : []
      ),
      ...(
        data.capabilities
          .canViewOrganization
          ? [
              'organization' as const,
            ]
          : []
      ),
      ...(
        data.capabilities
          .canViewReports
          ? [
              'reports' as const,
            ]
          : []
      ),
      ...(
        data.capabilities
          .canManageSettings
          ? [
              'settings' as const,
            ]
          : []
      ),
    ];

  const requestedView =
    Array.isArray(
      query.view,
    )
      ? query.view[0]
      : query.view;

  const activeView:
    SalesView =
      availableViews.includes(
        requestedView as
          SalesView,
      )
        ? requestedView as
            SalesView
        : 'overview';

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
        data.quotes.length,
    },
    ...(
      data.capabilities
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
                data.orders.length,
            },
          ]
        : []
    ),
    ...(
      data.capabilities
        .canViewOrganization
        ? [
            {
              key:
                'organization',
              label:
                'Teams & performance',
              href:
                '/apps/sales?view=organization',
              description:
                'Territories, sales teams, targets and commission plans.',
            },
          ]
        : []
    ),
    ...(
      data.capabilities
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
      data.capabilities
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
      activeSidebarKey={
        activeView
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
      description="Quotations, pricing, teams, targets, commissions, fulfillment and invoicing."
      contextLabel={
        data.company.name
      }
    >
      <SalesWorkspaceClient
        initialData={
          data
        }
        initialView={
          activeView
        }
        userId={
          session.user.id
        }
      />
    </AppSurfaceShell>
  );
}
