import type { CSSProperties } from 'react';

import styles from '@/app/apps/[appKey]/EnterpriseModuleWorkspaceShell.module.css';
import { SAMI_PERMISSIONS } from '@/lib/auth/permission-catalog';
import { loadStandaloneEnterpriseApp } from '@/app/apps/_shared/loadStandaloneEnterpriseApp';
import ShippingModuleShell from '@/app/apps/shipping/ShippingModuleShell';
import ShippingWorkspaceClient from '@/app/apps/shipping/ShippingWorkspaceClient';

const MODULE_KEY = 'shipping';
const NATIVE_SECTIONS = ['shipments', 'tracking'] as const;

export default async function ShippingWorkspace({ section }: { section?: string | null }) {
  const nativeSection = NATIVE_SECTIONS.includes((section || '') as (typeof NATIVE_SECTIONS)[number]);
  const nativeView = !section || section === 'overview' || nativeSection;
  const { session, account, shell, data, notifications, resolved, can, uiProfile } =
    await loadStandaloneEnterpriseApp(MODULE_KEY, nativeSection ? undefined : section);

  const baseHref = '/apps/shipping';
  const appSidebarItems = [
    { key: 'overview', label: 'Overview', href: baseHref, description: 'Shipment volume, delivery stages and exceptions.', sectionLabel: 'Workspace' },
    { key: 'shipments', label: 'Shipments', href: baseHref + '/shipments', description: 'Prepare parcels and manage shipment status.', sectionLabel: 'Fulfillment' },
    { key: 'tracking', label: 'Tracking', href: baseHref + '/tracking', description: 'Review delivery milestones and carrier scans.', sectionLabel: 'Fulfillment' },
    ...data.tables.filter((table) => !table.settingTable && ['shipping_carriers', 'shipping_rate_quotes', 'shipping_labels'].includes(table.key)).map((table) => ({
      key: table.key, label: table.label, href: baseHref + '/' + encodeURIComponent(table.key),
      description: 'Manage ' + table.label.toLowerCase() + '.', badge: table.count, sectionLabel: 'Carrier configuration',
    })),
    ...(data.capabilities.canReport ? [{ key: 'reports', label: 'Reports', href: baseHref + '/reports', description: 'Delivery performance and shipping cost analysis.', sectionLabel: 'Insights' }] : []),
    { key: 'activity', label: 'Activity', href: baseHref + '/activity', description: 'Recent Shipping changes and user actions.', sectionLabel: 'Workspace' },
    ...(data.capabilities.canManageSettings && data.tables.some((table) => table.settingTable)
      ? [{ key: 'settings', label: 'Settings', href: baseHref + '/settings', description: 'Shipping defaults and policies.', sectionLabel: 'Workspace' }]
      : []),
  ];
  const activeSidebarKey = nativeSection ? (section || 'overview')
    : resolved.view === 'records' ? (resolved.tableKey || 'overview') : resolved.view;

  return (
    <ShippingModuleShell
      user={session.user} tenant={account.tenant} modules={shell.accessibleModules}
      appSidebarItems={appSidebarItems} activeSidebarKey={activeSidebarKey}
      unreadNotifications={notifications?.unreadCount || 0}
      sidebarCapabilities={{ aiEnabled: shell.aiAvailable, notificationsEnabled: can(SAMI_PERMISSIONS.NOTIFICATIONS_VIEW) }}
      companyName={data.company.name}
    >
      <div className={styles.enterpriseWorkspace} data-module={MODULE_KEY} data-archetype={uiProfile.archetype}
        data-navigation={uiProfile.navigation} data-density={uiProfile.density} data-header={uiProfile.header}
        data-shipping-section={section || 'overview'}
        style={{ '--sami-module-accent': uiProfile.accent, '--sami-module-secondary': uiProfile.secondary } as CSSProperties}>
        <ShippingWorkspaceClient initialData={data} userId={session.user.id} initialView={resolved.view}
          initialTableKey={resolved.tableKey} accessibleModuleKeys={shell.accessibleModules.map((module) => module.registryKey)}
          nativeView={nativeView}
          initialSection={nativeSection ? section as (typeof NATIVE_SECTIONS)[number] : 'overview'} />
      </div>
    </ShippingModuleShell>
  );
}
