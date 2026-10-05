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
  | 'customers'
  | 'quotes'
  | 'templates'
  | 'pdf-builder'
  | 'catalogue'
  | 'pricelists'
  | 'advanced-pricing'
  | 'currencies'
  | 'orders'
  | 'organization'
  | 'operations'
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
      ...(
        data.capabilities
          .canUseBillingCustomers
          ? [
              'customers' as const,
            ]
          : []
      ),
      'quotes',
      'templates',
      'pdf-builder',
      ...(
        data.capabilities
          .canUseCatalog
          ? [
              'catalogue' as const,
            ]
          : []
      ),
      ...(
        data.capabilities
          .canViewPricing
          ? [
              'pricelists' as const,
              'advanced-pricing' as const,
              'currencies' as const,
            ]
          : []
      ),
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
          .canViewOperations
          ? [
              'operations' as const,
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
    ...(
      data.capabilities
        .canUseBillingCustomers
        ? [
            {
              key:
                'customers',
              label:
                'Customers & Contacts',
              href:
                '/apps/sales?view=customers',
              description:
                'Roadmap Part 2 · Shared customer master and primary contacts.',
              badge:
                data.billingCustomers.length,
            },
          ]
        : []
    ),
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
    {
      key:
        'templates',
      label:
        'Quotation Templates',
      href:
        '/apps/sales?view=templates',
      description:
        'Roadmap Part 5 · Reusable quotation presentation and commercial defaults.',
      badge:
        data.templates.length,
    },
    {
      key:
        'pdf-builder',
      label:
        'Quote / PDF Builder',
      href:
        '/apps/sales?view=pdf-builder',
      description:
        'Roadmap Part 6 · Apply templates, preview presentation and open generated PDFs.',
    },
    ...(
      data.capabilities
        .canUseCatalog
        ? [
            {
              key:
                'catalogue',
              label:
                'Product Catalogue',
              href:
                '/apps/sales?view=catalogue',
              description:
                'Roadmap Part 7 · Products and services used by Sales quotations.',
              badge:
                data.catalogItems.length,
            },
          ]
        : []
    ),
    ...(
      data.capabilities
        .canViewPricing
        ? [
            {
              key:
                'pricelists',
              label:
                'Pricelists',
              href:
                '/apps/sales?view=pricelists',
              description:
                'Roadmap Part 8 · Customer scope, currency, validity and precedence.',
              badge:
                data.pricelists.length,
            },
            {
              key:
                'advanced-pricing',
              label:
                'Advanced Pricing',
              href:
                '/apps/sales?view=advanced-pricing',
              description:
                'Roadmap Part 9 · Product, quantity, discount and markup pricing rules.',
            },
            {
              key:
                'currencies',
              label:
                'Currency & FX',
              href:
                '/apps/sales?view=currencies',
              description:
                'Roadmap Part 10 · Dated exchange rates and base-currency exposure.',
            },
          ]
        : []
    ),
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
        .canViewOperations
        ? [
            {
              key:
                'operations',
              label:
                'Operations',
              href:
                '/apps/sales?view=operations',
              description:
                'Deposits, shipments, returns, refunds and revenue forecast.',
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
      description="Quotations, pricing, teams, deposits, shipping, returns, forecasting and invoicing."
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
