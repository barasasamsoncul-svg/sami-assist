import type { CSSProperties } from 'react';

import styles from '@/app/apps/[appKey]/EnterpriseModuleWorkspaceShell.module.css';
import { SAMI_PERMISSIONS } from '@/lib/auth/permission-catalog';
import { loadStandaloneEnterpriseApp } from '@/app/apps/_shared/loadStandaloneEnterpriseApp';
import PurchaseWorkspaceClient from '@/app/apps/purchase/PurchaseWorkspaceClient';
import PurchaseModuleShell from '@/app/apps/purchase/PurchaseModuleShell';

const MODULE_KEY = 'purchase';
const NATIVE_SECTIONS = ['requisitions', 'orders', 'receipts'] as const;
const CORE_WORKFLOW_TABLES = new Set([
  'purchase_requisitions', 'purchase_requisition_lines',
  'purchase_orders', 'purchase_order_items',
  'purchase_receipts', 'purchase_receipt_lines',
]);

export default async function PurchaseWorkspace({ section }: { section?: string | null }) {
  const nativeSection = NATIVE_SECTIONS.includes((section || '') as (typeof NATIVE_SECTIONS)[number]);
  const nativeView = !section || section === 'overview' || nativeSection;
  const {
    session, account, shell, app, data, notifications, resolved, can, uiProfile,
  } = await loadStandaloneEnterpriseApp(MODULE_KEY, nativeSection ? undefined : section);

  const baseHref = '/apps/purchase';
  const appSidebarItems = [
    { key: 'overview', label: 'Overview', href: baseHref, description: 'Procurement health, outstanding work and receiving readiness.', sectionLabel: 'Workspace' },
    { key: 'requisitions', label: 'Requisitions', href: baseHref + '/requisitions', description: 'Submit and approve internal purchase requests.', sectionLabel: 'Procurement' },
    { key: 'orders', label: 'Purchase orders', href: baseHref + '/orders', description: 'Confirm supplier orders and monitor receipt coverage.', sectionLabel: 'Procurement' },
    { key: 'receipts', label: 'Goods receipts', href: baseHref + '/receipts', description: 'Inspect delivered goods and post accepted quantities to Inventory.', sectionLabel: 'Receiving' },
    ...data.tables
      .filter((table) => !table.settingTable && !CORE_WORKFLOW_TABLES.has(table.key))
      .map((table) => ({
        key: table.key, label: table.label, href: baseHref + '/' + encodeURIComponent(table.key),
        description: 'Open ' + table.label.toLowerCase() + ' records.', badge: table.count,
        sectionLabel: ['suppliers', 'supplier_price_lists', 'supplier_price_list_items'].includes(table.key)
          ? 'Supplier management' : 'RFQ and supplier response',
      })),
    ...(data.capabilities.canReport ? [{ key: 'reports', label: 'Reports', href: baseHref + '/reports', description: 'Procurement performance and supplier analysis.', sectionLabel: 'Insights' }] : []),
    { key: 'activity', label: 'Activity', href: baseHref + '/activity', description: 'Recent Purchase changes and user actions.', sectionLabel: 'Workspace' },
    ...(data.capabilities.canManageSettings && data.tables.some((table) => table.settingTable)
      ? [{ key: 'settings', label: 'Settings', href: baseHref + '/settings', description: 'Procurement defaults and configuration.', sectionLabel: 'Workspace' }]
      : []),
  ];
  const activeSidebarKey = nativeView
    ? (nativeSection ? section as string : 'overview')
    : resolved.view === 'records' ? (resolved.tableKey || 'overview') : resolved.view;

  return (
    <PurchaseModuleShell
      appCategory={app.category}
      appIconKey={app.iconKey}
      user={session.user}
      tenant={account.tenant}
      modules={shell.accessibleModules}
      appSidebarItems={appSidebarItems}
      activeSidebarKey={activeSidebarKey}
      sidebarCapabilities={{
        aiEnabled: shell.aiAvailable,
        notificationsEnabled: can(SAMI_PERMISSIONS.NOTIFICATIONS_VIEW),
      }}
      unreadNotifications={notifications?.unreadCount || 0}
      companyName={data.company.name}
    >
      <div
        className={styles.enterpriseWorkspace}
        data-module={MODULE_KEY}
        data-archetype={uiProfile.archetype}
        data-navigation={uiProfile.navigation}
        data-density={uiProfile.density}
        data-header={uiProfile.header}
        data-purchase-section={section || 'overview'}
        style={{
          '--sami-module-accent': uiProfile.accent,
          '--sami-module-secondary': uiProfile.secondary,
        } as CSSProperties}
      >
        <PurchaseWorkspaceClient
          initialData={data}
          userId={session.user.id}
          initialView={resolved.view}
          initialTableKey={resolved.tableKey}
          accessibleModuleKeys={shell.accessibleModules.map((module) => module.registryKey)}
          nativeView={nativeView}
          initialSection={nativeSection ? section as (typeof NATIVE_SECTIONS)[number] : 'overview'}
        />
      </div>
    </PurchaseModuleShell>
  );
}
