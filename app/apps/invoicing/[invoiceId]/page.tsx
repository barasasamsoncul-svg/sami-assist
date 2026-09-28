import {
  notFound,
} from 'next/navigation';

import AppSurfaceShell from '@/app/components/apps/AppSurfaceShell';
import InvoiceDetailClient from '@/app/apps/invoicing/[invoiceId]/InvoiceDetailClient';

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
      activeSidebarKey="invoices"
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
    >
      <InvoiceDetailClient
        data={
          data
        }
        invoice={
          invoice
        }
        userId={
          session.user.id
        }
      />
    </AppSurfaceShell>
  );
}
