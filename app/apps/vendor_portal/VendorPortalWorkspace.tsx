import type { CSSProperties } from 'react';

import styles from '@/app/apps/[appKey]/EnterpriseModuleWorkspaceShell.module.css';
import { SAMI_PERMISSIONS } from '@/lib/auth/permission-catalog';
import { loadStandaloneEnterpriseApp } from '@/app/apps/_shared/loadStandaloneEnterpriseApp';
import VendorPortalModuleShell from '@/app/apps/vendor_portal/VendorPortalModuleShell';
import VendorPortalWorkspaceClient from '@/app/apps/vendor_portal/VendorPortalWorkspaceClient';

const MODULE_KEY = 'vendor_portal';
const NATIVE_SECTIONS = ['accounts', 'rfqs', 'responses'] as const;

export default async function VendorPortalWorkspace({ section }: { section?: string | null }) {
  const nativeSection = NATIVE_SECTIONS.includes((section || '') as (typeof NATIVE_SECTIONS)[number]);
  const nativeView = !section || section === 'overview' || nativeSection;
  const { session, account, shell, data, notifications, resolved, can, uiProfile } =
    await loadStandaloneEnterpriseApp(MODULE_KEY, nativeSection ? undefined : section);

  const baseHref = '/apps/vendor_portal';
  const appSidebarItems = [
    { key: 'overview', label: 'Overview', href: baseHref, description: 'Supplier access, RFQ deadlines and outstanding responses.', sectionLabel: 'Workspace' },
    { key: 'accounts', label: 'Supplier accounts', href: baseHref + '/accounts', description: 'Link active Purchase suppliers to controlled portal access.', sectionLabel: 'Supplier access' },
    { key: 'rfqs', label: 'RFQ invitations', href: baseHref + '/rfqs', description: 'Issue expiring, supplier-specific requests for quotation.', sectionLabel: 'Sourcing' },
    { key: 'responses', label: 'Supplier responses', href: baseHref + '/responses', description: 'Review and decide on submitted supplier quotations.', sectionLabel: 'Sourcing' },
    ...data.tables.filter((table) => !table.settingTable && ![
      'vendor_portal_accounts', 'vendor_portal_rfqs', 'vendor_portal_rfq_responses', 'vendor_portal_documents', 'vendor_portal_messages',
    ].includes(table.key)).map((table) => ({
      key: table.key, label: table.label, href: baseHref + '/' + encodeURIComponent(table.key),
      description: 'Open ' + table.label.toLowerCase() + ' records.', badge: table.count, sectionLabel: 'Registers',
    })),
    ...(data.capabilities.canReport ? [{ key: 'reports', label: 'Reports', href: baseHref + '/reports', description: 'Invitation, response and delivery performance.', sectionLabel: 'Insights' }] : []),
    { key: 'activity', label: 'Activity', href: baseHref + '/activity', description: 'Recent Vendor Portal changes and user actions.', sectionLabel: 'Workspace' },
    ...(data.capabilities.canManageSettings && data.tables.some((table) => table.settingTable)
      ? [{ key: 'settings', label: 'Settings', href: baseHref + '/settings', description: 'Vendor access policy and defaults.', sectionLabel: 'Workspace' }]
      : []),
  ];
  const activeSidebarKey = nativeSection ? (section || 'overview')
    : resolved.view === 'records' ? (resolved.tableKey || 'overview') : resolved.view;

  return (
    <VendorPortalModuleShell
      user={session.user}
      tenant={account.tenant}
      modules={shell.accessibleModules}
      appSidebarItems={appSidebarItems}
      activeSidebarKey={activeSidebarKey}
      unreadNotifications={notifications?.unreadCount || 0}
      sidebarCapabilities={{ aiEnabled: shell.aiAvailable, notificationsEnabled: can(SAMI_PERMISSIONS.NOTIFICATIONS_VIEW) }}
      companyName={data.company.name}
    >
      <div className={styles.enterpriseWorkspace}
        data-module={MODULE_KEY}
        data-archetype={uiProfile.archetype}
        data-navigation={uiProfile.navigation}
        data-density={uiProfile.density}
        data-header={uiProfile.header}
        data-vendor-portal-section={section || 'overview'}
        style={{ '--sami-module-accent': uiProfile.accent, '--sami-module-secondary': uiProfile.secondary } as CSSProperties}>
        <VendorPortalWorkspaceClient
          initialData={data}
          userId={session.user.id}
          initialView={resolved.view}
          initialTableKey={resolved.tableKey}
          accessibleModuleKeys={shell.accessibleModules.map((module) => module.registryKey)}
          nativeView={nativeView}
          initialSection={nativeSection ? section as (typeof NATIVE_SECTIONS)[number] : 'overview'}
        />
      </div>
    </VendorPortalModuleShell>
  );
}
