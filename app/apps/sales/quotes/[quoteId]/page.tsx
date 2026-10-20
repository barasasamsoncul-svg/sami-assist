import { notFound } from 'next/navigation';

import SalesModuleShell from '@/app/apps/sales/SalesModuleShell';

import SalesQuoteDetailClient from '@/app/apps/sales/SalesQuoteDetailClient';

import { getAccountContextForUser } from '@/lib/auth/account-context';
import { getPermissionContext } from '@/lib/auth/permission-context';
import { requirePageSession } from '@/lib/auth/require-page-session';
import { resolveWorkspaceShellAccess } from '@/lib/auth/workspace-shell';
import { getWorkspaceNotificationSummary } from '@/lib/services/workspace-notifications';

import { getSalesQuoteDetail, getSalesWorkspaceData } from '@/lib/apps/sales/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SalesQuotePage({
  params,
}: {
  params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;

  const session = await requirePageSession('/apps/sales/quotes/' + quoteId);

  const [account, permissions] = await Promise.all([
    getAccountContextForUser(session.user.id, session.currentTenantId),
    getPermissionContext(),
  ]);

  const shell = resolveWorkspaceShellAccess({
    modules: account.modules,
    subscription: account.subscription,
    permissions,
  });

  if (!shell.accessibleModuleKeys.includes('sales')) {
    notFound();
  }

  const [quote, workspace, notifications] = await Promise.all([
    getSalesQuoteDetail(quoteId),
    getSalesWorkspaceData(),
    getWorkspaceNotificationSummary().catch(() => null),
  ]);

  if (!quote) {
    notFound();
  }

  const appSidebarItems = [
    {
      key: 'overview',
      label: 'Overview',
      href: '/apps/sales?view=overview',
      description: 'Pipeline health, conversion and sales value.',
    },
    {
      key: 'quotes',
      label: 'Quotations',
      href: '/apps/sales?view=quotes',
      description: 'Create, approve, send and convert quotations.',
      badge: workspace.quotes.length,
    },
    ...(workspace.capabilities.canViewOrders
      ? [
          {
            key: 'orders',
            label: 'Sales Orders',
            href: '/apps/sales?view=orders',
            description: 'Fulfillment, delivery and invoice readiness.',
            badge: workspace.orders.length,
          },
        ]
      : []),
    ...(workspace.capabilities.canViewReports
      ? [
          {
            key: 'reports',
            label: 'Reports',
            href: '/apps/sales?view=reports',
            description: 'Conversion, customer and monthly sales analysis.',
          },
        ]
      : []),
    ...(workspace.capabilities.canManageSettings
      ? [
          {
            key: 'settings',
            label: 'Settings',
            href: '/apps/sales?view=settings',
            description: 'Sales policy, approvals and invoice behavior.',
          },
        ]
      : []),
  ];

  return (
    <SalesModuleShell
      user={session.user}
      tenant={account.tenant}
      modules={shell.accessibleModules}
      appSidebarItems={appSidebarItems}
      activeSidebarKey="quotes"
      unreadNotifications={notifications?.unreadCount || 0}
      sidebarCapabilities={{
        aiEnabled: shell.aiAvailable,
      }}
      companyName={workspace.company.name}
    >
      <SalesQuoteDetailClient quote={quote} workspace={workspace} />
    </SalesModuleShell>
  );
}