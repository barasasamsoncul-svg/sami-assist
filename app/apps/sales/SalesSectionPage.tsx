import {
  notFound,
} from 'next/navigation';

import SalesModuleShell from '@/app/apps/sales/SalesModuleShell';
import SalesWorkspaceClient from '@/app/apps/sales/SalesWorkspaceClient';

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

import {
  canAccessSalesView,
  getSalesParentView,
  getSalesRoutePath,
  SALES_NAVIGATION,
  SALES_SIDEBAR_VIEWS,
  type SalesRouteView,
} from '@/lib/apps/sales/navigation';

export type {
  SalesRouteView,
} from '@/lib/apps/sales/navigation';


export function buildSalesSidebarItems(
  data:
    Awaited<
      ReturnType<
        typeof getSalesWorkspaceData
      >
    >,
) {
  const badges:
    Partial<
      Record<
        SalesRouteView,
        number
      >
    > = {
      quotes:
        data.quotes.length,
      orders:
        data.orders.length,
      customers:
        data.billingCustomers.length,
      templates:
        data.templates.length,
      catalogue:
        data.catalogItems.length,
      pricelists:
        data.pricelists.length,
    };

  return SALES_SIDEBAR_VIEWS
    .filter(
      view =>
        canAccessSalesView(
          data.capabilities,
          view,
        ),
    )
    .map(
      view => {
        const item =
          SALES_NAVIGATION[
            view
          ];

        return {
          key:
            view,
          label:
            item.label,
          href:
            item.href,
          description:
            item.description,
          sectionLabel:
            item.group,
          badge:
            badges[
              view
            ],
        };
      },
    );
}


export default async function SalesSectionPage({
  view,
}: {
  view:
    SalesRouteView;
}) {
  const currentPath =
    getSalesRoutePath(
      view,
    );

  const session =
    await requirePageSession(
      currentPath,
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
        'sales',
      )
  ) {
    notFound();
  }

  const [
    data,
    notificationResult,
  ] =
    await Promise.all([
      getSalesWorkspaceData(),

      getWorkspaceNotificationSummary()
        .catch(
          () => null,
        ),
    ]);

  if (
    !canAccessSalesView(
      data.capabilities,
      view,
    )
  ) {
    notFound();
  }

  return (
    <SalesModuleShell
      user={
        session.user
      }
      tenant={
        accountContext.tenant
      }
      modules={
        shell.accessibleModules
      }
      appSidebarItems={
        buildSalesSidebarItems(
          data,
        )
      }
      activeSidebarKey={
        getSalesParentView(
          view,
        )
      }
      sidebarCapabilities={{
        aiEnabled:
          shell.aiAvailable,

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
      companyName={
        data.company.name
      }
    >
      <SalesWorkspaceClient
        initialData={
          data
        }
        initialView={
          view
        }
        userId={
          session.user.id
        }
      />
    </SalesModuleShell>
  );
}