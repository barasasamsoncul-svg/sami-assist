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


export type InvoicingRouteView =
  | 'dashboard'
  | 'newInvoice'
  | 'invoices'
  | 'newCustomer'
  | 'customers'
  | 'newItem'
  | 'items'
  | 'receivePayment'
  | 'payments'
  | 'currencies'
  | 'taxEngine'
  | 'etims'
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
    newCustomer:
      '/apps/invoicing/customers/new',
    customers:
      '/apps/invoicing/customers',
    newItem:
      '/apps/invoicing/items/new',
    items:
      '/apps/invoicing/items',
    receivePayment:
      '/apps/invoicing/payments/new',
    payments:
      '/apps/invoicing/payments',
    currencies:
      '/apps/invoicing/currencies',
    taxEngine:
      '/apps/invoicing/tax-engine',
    etims:
      '/apps/invoicing/etims',
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
  data:
    Awaited<
      ReturnType<
        typeof getInvoicingWorkspaceData
      >
    >,
  view:
    InvoicingRouteView,
) {
  switch (
    view
  ) {
    case 'newInvoice':
      return data
        .capabilities
        .canCreate;

    case 'newCustomer':
      return data
        .capabilities
        .canManageCustomers;

    case 'customers':
    case 'portal':
      return data
        .capabilities
        .canViewCustomers;

    case 'newItem':
      return data
        .capabilities
        .canManageCatalog;

    case 'items':
      return data
        .capabilities
        .canViewCatalog;

    case 'receivePayment':
      return data
        .capabilities
        .canRecordPayment;

    case 'payments':
    case 'retainers':
    case 'paymentPlans':
      return data
        .capabilities
        .canViewPayments;

    case 'recurring':
      return data
        .capabilities
        .canManageRecurring;

    case 'reminders':
      return data
        .capabilities
        .canSend;

    case 'reports':
      return data
        .capabilities
        .canViewReports;

    case 'settings':
      return data
        .capabilities
        .canManageSettings;

    default:
      return data
        .capabilities
        .canView;
  }
}


export function buildInvoicingSidebarItems(
  data:
    Awaited<
      ReturnType<
        typeof getInvoicingWorkspaceData
      >
    >,
) {
  return [
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
                'New Invoice',
              href:
                VIEW_PATHS
                  .newInvoice,
              description:
                'Create one invoice on a dedicated page.',
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
        'Search, filter and open existing invoices.',
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
                'Billing identities, terms and tax profiles.',
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
                'Receipts, allocations, refunds and reversals.',
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
                'Customer deposits and unapplied advance funds.',
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
                'Invoice installments and scheduled balances.',
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
        'Currencies, rates and foreign-currency exposure.',
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
        'Rates, groups, fiscal positions, rules and exemptions.',
    },
    {
      key:
        'etims',
      label:
        'Kenya eTIMS',
      href:
        VIEW_PATHS
          .etims,
      description:
        'OSCU/VSCU fiscalization, receipt evidence and submission health.',
      badge:
        data.etimsDocuments.filter(
          document =>
            document.status ===
              'failed' ||
            document.status ===
              'rejected',
        ).length ||
        undefined,
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
                'Dunning stages, retries and reminder history.',
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
                'Aging, status and billing analysis.',
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
                'Appearance, defaults, payment terms and behavior.',
            },
          ]
        : []
    ),
  ];
}


export default async function InvoicingSectionPage({
  view,
}: {
  view:
    InvoicingRouteView;
}) {
  const currentPath =
    VIEW_PATHS[
      view
    ];

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
    !canOpenView(
      data,
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
        view ===
          'newCustomer'
          ? 'customers'
          : view ===
              'newItem'
            ? 'items'
            : view ===
                'receivePayment'
              ? 'payments'
              : view
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
