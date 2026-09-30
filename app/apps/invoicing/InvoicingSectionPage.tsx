import {
  notFound,
} from 'next/navigation';

import InvoicingModuleShell from '@/app/apps/invoicing/InvoicingModuleShell';
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

import {
  canAccessInvoicingView,
  getInvoicingParentView,
  getInvoicingRoutePath,
  INVOICING_NAVIGATION,
  INVOICING_SIDEBAR_VIEWS,
  type InvoicingRouteView,
} from '@/lib/apps/invoicing/navigation';

export type {
  InvoicingRouteView,
} from '@/lib/apps/invoicing/navigation';


export function buildInvoicingSidebarItems(
  data:
    Awaited<
      ReturnType<
        typeof getInvoicingWorkspaceData
      >
    >,
) {
  const badges:
    Partial<
      Record<
        InvoicingRouteView,
        number
      >
    > = {
      invoices:
        data.invoices.length,
      customers:
        data.customers.length,
      items:
        data.catalogItems.length,
      payments:
        data.payments.length,
      retainers:
        data.retainers.length,
      paymentPlans:
        data.paymentPlans.length,
      recurring:
        data.recurring.length,
      reminders:
        data.reminders.length,
      portal:
        data.portalMessages.length,
    };

  return INVOICING_SIDEBAR_VIEWS
    .filter(
      view =>
        canAccessInvoicingView(
          data.capabilities,
          view,
        ),
    )
    .map(
      view => {
        const item =
          INVOICING_NAVIGATION[
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


export default async function InvoicingSectionPage({
  view,
}: {
  view:
    InvoicingRouteView;
}) {
  const currentPath =
    getInvoicingRoutePath(
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

  if (
    !canAccessInvoicingView(
      data.capabilities,
      view,
    )
  ) {
    notFound();
  }

  return (
    <InvoicingModuleShell
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
        buildInvoicingSidebarItems(
          data,
        )
      }
      activeSidebarKey={
        getInvoicingParentView(
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
      <InvoicingWorkspaceClient
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
    </InvoicingModuleShell>
  );
}
