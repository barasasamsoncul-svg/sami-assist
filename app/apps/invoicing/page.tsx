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


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


type InvoicingView =
  | 'dashboard'
  | 'invoices'
  | 'customers'
  | 'items'
  | 'payments'
  | 'recurring'
  | 'reports'
  | 'settings';


export default async function InvoicingPage({
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

  const uiProfile =
    getSamiAppUiProfile(
      'invoicing',
    );

  const availableViews:
    InvoicingView[] = [
      'dashboard',
      'invoices',
      ...(
        data.capabilities
          .canViewCustomers
          ? [
              'customers' as const,
            ]
          : []
      ),
      ...(
        data.capabilities
          .canViewCatalog
          ? [
              'items' as const,
            ]
          : []
      ),
      ...(
        data.capabilities
          .canViewPayments
          ? [
              'payments' as const,
            ]
          : []
      ),
      ...(
        data.capabilities
          .canManageRecurring
          ? [
              'recurring' as const,
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
    InvoicingView =
      availableViews.includes(
        requestedView as
          InvoicingView,
      )
        ? requestedView as
            InvoicingView
        : 'dashboard';

  const appSidebarItems = [
    {
      key:
        'dashboard',
      label:
        'Overview',
      href:
        '/apps/invoicing?view=dashboard',
      description:
        'Receivables, collections and overdue exposure.',
    },
    {
      key:
        'invoices',
      label:
        'Invoices',
      href:
        '/apps/invoicing?view=invoices',
      description:
        'Create, send and manage invoice lifecycles.',
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
                '/apps/invoicing?view=customers',
              description:
                'Billing identities, terms and contact details.',
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
                '/apps/invoicing?view=items',
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
                '/apps/invoicing?view=payments',
              description:
                'Receipts, allocations and reversals.',
              badge:
                data.payments.length,
            },
          ]
        : []
    ),
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
                '/apps/invoicing?view=recurring',
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
        .canViewReports
        ? [
            {
              key:
                'reports',
              label:
                'Reports',
              href:
                '/apps/invoicing?view=reports',
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
                '/apps/invoicing?view=settings',
              description:
                'Templates, taxes, terms and reminders.',
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
        activeView
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
    >
      <InvoicingWorkspaceClient
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
