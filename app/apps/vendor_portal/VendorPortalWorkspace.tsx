import type { CSSProperties } from 'react';

import styles from '@/app/apps/[appKey]/EnterpriseModuleWorkspaceShell.module.css';
import { SAMI_PERMISSIONS } from '@/lib/auth/permission-catalog';
import { loadStandaloneEnterpriseApp } from '@/app/apps/_shared/loadStandaloneEnterpriseApp';
import VendorPortalModuleShell from '@/app/apps/vendor_portal/VendorPortalModuleShell';
import VendorPortalWorkspaceClient from '@/app/apps/vendor_portal/VendorPortalWorkspaceClient';

const MODULE_KEY = 'vendor_portal';
const NATIVE_SECTIONS = ['accounts', 'rfqs', 'responses', 'documents', 'messages'] as const;
const CORE_WORKFLOW_TABLES = new Set([
  'vendor_portal_accounts',
  'vendor_portal_rfqs',
  'vendor_portal_rfq_responses',
  'vendor_portal_documents',
  'vendor_portal_messages',
]);

export default async function VendorPortalWorkspace({ section }: { section?: string | null }) {
  const nativeSection = NATIVE_SECTIONS.includes((section || '') as (typeof NATIVE_SECTIONS)[number]);
  const nativeView = !section || section === 'overview' || nativeSection;
  const {
    session, account, shell, app, data, notifications, resolved, can, uiProfile,
  } = await loadStandaloneEnterpriseApp(MODULE_KEY, nativeSection ? undefined : section);

  const baseHref = '/apps/vendor_portal';
  const appSidebarItems = [
    { key: 'overview', label: 'Overview', href: baseHref, description: 'Supplier access, procurement collaboration and compliance priorities.', sectionLabel: 'Workspace' },
    { key: 'accounts', label: 'Vendor accounts', href: baseHref + '/accounts', description: 'Manage supplier access and account lifecycle.', sectionLabel: 'Supplier management' },
    { key: 'rfqs', label: 'RFQ invitations', href: baseHref + '/rfqs', description: 'Track supplier quotation invitations and deadlines.', sectionLabel: 'Procurement' },
    { key: 'responses', label: 'Responses', href: baseHref + '/responses', description: 'Review and decide on supplier quotations.', sectionLabel: 'Procurement' },
    { key: 'documents', label: 'Documents', href: baseHref + '/documents', description: 'Monitor supplier records and document expiries.', sectionLabel: 'Compliance' },
    { key: 'messages', label: 'Messages', href: baseHref + '/messages', description: 'Manage supplier conversations and follow-up.', sectionLabel: 'Collaboration' },
    ...data.tables
      .filter((table) => !table.settingTable && !CORE_WORKFLOW_TABLES.has(table.key))
      .map((table) => ({
        key: table.key,
        label: table.label,
        href: baseHref + '/' + encodeURIComponent(table.key),
        description: 'Open ' + table.label.toLowerCase() + ' records.',
        badge: table.count,
        sectionLabel: 'Additional records',
      })),
    ...(data.capabilities.canReport ? [{
      key: 'reports', label: 'Reports', href: baseHref + '/reports',
      description: 'Supplier collaboration, response and document reporting.', sectionLabel: 'Insights',
    }] : []),
    { key: 'activity', label: 'Activity', href: baseHref + '/activity', description: 'Recent Vendor Portal changes and user actions.', sectionLabel: 'Workspace' },
    ...(data.capabilities.canManageSettings && data.tables.some((table) => table.settingTable) ? [{
      key: 'settings', label: 'Settings', href: baseHref + '/settings',
      description: 'Portal defaults, policy and configuration.', sectionLabel: 'Workspace',
    }] : []),
  ];

  const activeSidebarKey = nativeView
    ? (nativeSection ? section as string : 'overview')
    : resolved.view === 'records' ? (resolved.tableKey || 'overview') : resolved.view;

  return (
    <VendorPortalModuleShell
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
        data-vendor-portal-section={section || 'overview'}
        style={{
          '--sami-module-accent': uiProfile.accent,
          '--sami-module-secondary': uiProfile.secondary,
        } as CSSProperties}
      >
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
