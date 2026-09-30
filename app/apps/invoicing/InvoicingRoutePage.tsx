import {
  notFound,
} from 'next/navigation';

import AppSurfaceShell from '@/app/components/apps/AppSurfaceShell';
import InvoicingWorkspaceClient from '@/app/apps/invoicing/InvoicingWorkspaceClient';

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
  getInvoicingWorkspaceData,
} from '@/lib/apps/invoicing/service';


export type InvoicingRouteView =
  | 'dashboard'
  | 'newInvoice'
  | 'invoices'
  | 'customers'
  | 'items'
  | 'payments'
  | 'currencies'
  | 'taxEngine'
  | 'retainers'
  | 'paymentPlans'
  | 'recurring'
  | 'reminders'
  | 'portal'
  | 'reports'
  | 'settings';


const VIEW_PATHS:
  Record<
    InvoicingRouteView,
    string
  > = {
    dashboard:
      '/apps/invoicing',
    newInvoice:
      '/apps/invoicing/new',
    invoices:
      '/apps/invoicing/invoices',
    customers:
      '/apps/invoicing/customers',
    items:
      '/apps/invoicing/items',
    payments:
      '/apps/invoicing/payments',
    currencies:
      '/apps/invoicing/currencies',
    taxEngine:
      '/apps/invoicing/tax-engine',
    retainers:
      '/apps/invoicing/retainers',
    paymentPlans:
      '/apps/invoicing/payment-plans',
    recurring:
      '/apps/invoicing/recurring',
    reminders:
      '/apps/invoicing/reminders',
    portal:
      '/apps/invoicing/portal',
    reports:
      '/apps/invoicing/reports',
    settings:
      '/apps/invoicing/settings',
  };


function canOpenView(
  view:
    InvoicingRouteView,
  capabilities:
    Awaited<
      ReturnType<
        typeof getInvoicingWorkspaceData
      >
    >['capabilities'],
) {
  switch (
    view
  ) {
    case 'newInvoice':
      return capabilities
        .canCreate;

    case 'customers':
    case 'portal':
      return capabilities
        .canViewCustomers;

    case 'items':
      return capabilities
        .canViewCatalog;

    case 'payments':
    case 'retainers':
    case 'paymentPlans':
      return capabilities
        .canViewPayments;

    case 'recurring':
      return capabilities
        .canManageRecurring;

    case 'reminders':
      return capabilities
        .canSend;

    case 'reports':
      return capabilities
        .canViewReports;

    case 'settings':
      return capabilities
        .canManageSettings;

    default:
      return capabilities
        .canView;
  }
}


export default async function InvoicingRoutePage({
  view,
}: {
  view:
    InvoicingRouteView;
}) {
  const session =
    await requirePageSession(
      VIEW_PATHS[
        view
      ],
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
    !canOpenView(
      view,
      data.capabilities,
    )
  ) {
    notFound();
  }

  const uiProfile =
    getSamiAppUiProfile(
      'invoicing',
    );

  const appSidebarItems = [
    {
      key:
        'dashboard',
      label:
        'Overview',
      href:
        VIEW_PATHS
          .dashboard,
      description:
        'Receivables, collections and overdue exposure.',
    },
    ...(
      data.capabilities
        .canCreate
        ? [
            {
              key:
                'newInvoice',
              label:
                'Create Invoice',
              href:
                VIEW_PATHS
                  .newInvoice,
              description:
                'Focused invoice composer.',
            },
          ]
        : []
    ),
    {
      key:
        'invoices',
      label:
        'Invoice Register',
      href:
        VIEW_PATHS
          .invoices,
      description:
        'Search, filter and manage existing invoices.',
      badge:
        data.invoices.length,
    },
    ...(
      data.capabilities
        .canViewCustomers
        ? [
            {
              key:
                'customers',
              label:
                'Customers',
              href:
                VIEW_PATHS
                  .customers,
              description:
                'Billing identities, terms and tax positions.',
              badge:
                data.customers.length,
            },
          ]
        : []
    ),
    ...(
      data.capabilities
        .canViewCatalog
        ? [
            {
              key:
                'items',
              label:
                'Items & Pricing',
              href:
                VIEW_PATHS
                  .items,
              description:
                'Products, services, prices and tax defaults.',
              badge:
                data.catalogItems.length,
            },
          ]
        : []
    ),
    ...(
      data.capabilities
        .canViewPayments
        ? [
            {
              key:
                'payments',
              label:
                'Payments',
              href:
                VIEW_PATHS
                  .payments,
              description:
                'Receipts, allocations and reversals.',
              badge:
                data.payments.length,
            },
            {
              key:
                'retainers',
              label:
                'Retainers',
              href:
                VIEW_PATHS
                  .retainers,
              description:
                'Deposits and customer advances.',
              badge:
                data.retainers.length,
            },
            {
              key:
                'paymentPlans',
              label:
                'Payment Plans',
              href:
                VIEW_PATHS
                  .paymentPlans,
              description:
                'Installments and dated settlement plans.',
              badge:
                data.paymentPlans.length,
            },
          ]
        : []
    ),
    {
      key:
        'currencies',
      label:
        'Currency Center',
      href:
        VIEW_PATHS
          .currencies,
      description:
        'Currencies, FX rates and exposure.',
      badge:
        data.currencies.length,
    },
    {
      key:
        'taxEngine',
      label:
        'Tax Engine',
      href:
        VIEW_PATHS
          .taxEngine,
      description:
        'Tax rates, groups, fiscal positions and rules.',
      badge:
        data.taxRates.length,
    },
    ...(
      data.capabilities
        .canManageRecurring
        ? [
            {
              key:
                'recurring',
              label:
                'Recurring',
              href:
                VIEW_PATHS
                  .recurring,
              description:
                'Recurring schedules and automated delivery.',
              badge:
                data.recurring.length,
            },
          ]
        : []
    ),
    ...(
      data.capabilities
        .canSend
        ? [
            {
              key:
                'reminders',
              label:
                'Reminders',
              href:
                VIEW_PATHS
                  .reminders,
              description:
                'Dunning stages, retries and follow-up.',
              badge:
                data.reminders.length,
            },
          ]
        : []
    ),
    ...(
      data.capabilities
        .canViewCustomers
        ? [
            {
              key:
                'portal',
              label:
                'Customer Portal',
              href:
                VIEW_PATHS
                  .portal,
              description:
                'Portal access and customer billing messages.',
              badge:
                data.portalMessages.length,
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
                VIEW_PATHS
                  .reports,
              description:
                'Aging, invoice status and billing analysis.',
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
                VIEW_PATHS
                  .settings,
              description:
                'Templates, numbering and billing defaults.',
            },
          ]
        : []
    ),
  ];

  return (
    <AppSurfaceShell
      appKey="invoicing"
      appCategory="finance"
      profile={
        uiProfile
      }
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
      appSidebarItems={
        appSidebarItems
      }
      activeSidebarKey={
        view
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
      description="Invoices, receivables, payments, tax, recurring billing and customer billing records."
      contextLabel={
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
    </AppSurfaceShell>
  );
}
