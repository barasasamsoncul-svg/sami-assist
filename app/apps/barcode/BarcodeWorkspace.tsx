import type { CSSProperties } from 'react';
import styles from '@/app/apps/[appKey]/EnterpriseModuleWorkspaceShell.module.css';
import { SAMI_PERMISSIONS } from '@/lib/auth/permission-catalog';
import { loadStandaloneEnterpriseApp } from '@/app/apps/_shared/loadStandaloneEnterpriseApp';
import BarcodeModuleShell from '@/app/apps/barcode/BarcodeModuleShell';
import BarcodeWorkspaceClient from '@/app/apps/barcode/BarcodeWorkspaceClient';

const MODULE_KEY = 'barcode';
const BARCODE_SECTIONS = ['scanner', 'history'] as const;

export default async function BarcodeWorkspace({ section }: { section?: string | null }) {
  const nativeSection = BARCODE_SECTIONS.includes((section || '') as (typeof BARCODE_SECTIONS)[number]);
  const nativeView = !section || section === 'overview' || nativeSection;
  const { session, account, shell, data, notifications, resolved, can, uiProfile } =
    await loadStandaloneEnterpriseApp(MODULE_KEY, nativeSection ? undefined : section);

  const appBaseHref = '/apps/barcode';
  const appSidebarItems = [
    { key: 'overview', label: 'Overview', href: appBaseHref, description: 'Scans, matching and operating priorities.', sectionLabel: 'Workspace' },
    { key: 'scanner', label: 'Scanner', href: appBaseHref + '/scanner', description: 'Capture identifiers from keyboard-wedge or handheld scanners.', sectionLabel: 'Scan operations' },
    { key: 'history', label: 'Scan history', href: appBaseHref + '/history', description: 'Review matched, unmatched and ambiguous scan events.', sectionLabel: 'Scan operations' },
    ...data.tables.filter((table) => !table.settingTable && ['barcode_rules', 'barcode_identifiers'].includes(table.key)).map((table) => ({
      key: table.key, label: table.label, href: appBaseHref + '/' + encodeURIComponent(table.key),
      description: 'Manage ' + table.label.toLowerCase() + ' records.', badge: table.count, sectionLabel: 'Configuration',
    })),
    ...(data.capabilities.canReport ? [{ key: 'reports', label: 'Reports', href: appBaseHref + '/reports', description: 'Barcode activity and matching quality.', sectionLabel: 'Insights' }] : []),
    { key: 'activity', label: 'Activity', href: appBaseHref + '/activity', description: 'Recent Barcode changes and user actions.', sectionLabel: 'Workspace' },
    ...(data.capabilities.canManageSettings && data.tables.some((table) => table.settingTable)
      ? [{ key: 'settings', label: 'Settings', href: appBaseHref + '/settings', description: 'Barcode defaults and configuration.', sectionLabel: 'Workspace' }]
      : []),
  ];
  const activeSidebarKey = nativeSection ? (section || 'overview')
    : resolved.view === 'records' ? (resolved.tableKey || 'overview') : resolved.view;
  return (
    <BarcodeModuleShell
      user={session.user}
      tenant={account.tenant}
      modules={shell.accessibleModules}
      appSidebarItems={appSidebarItems}
      activeSidebarKey={activeSidebarKey}
      unreadNotifications={notifications?.unreadCount || 0}
      sidebarCapabilities={{ aiEnabled: shell.aiAvailable, notificationsEnabled: can(SAMI_PERMISSIONS.NOTIFICATIONS_VIEW) }}
      companyName={data.company.name}
    >
      <div className={styles.enterpriseWorkspace} data-module={MODULE_KEY} data-archetype={uiProfile.archetype}
        data-navigation={uiProfile.navigation} data-density={uiProfile.density} data-header={uiProfile.header}
        data-barcode-section={section || 'overview'}
        style={{ '--sami-module-accent': uiProfile.accent, '--sami-module-secondary': uiProfile.secondary } as CSSProperties}>
        <BarcodeWorkspaceClient initialData={data} userId={session.user.id} initialView={resolved.view}
          initialTableKey={resolved.tableKey} accessibleModuleKeys={shell.accessibleModules.map((module) => module.registryKey)}
          nativeView={nativeView} initialSection={nativeSection ? section as (typeof BARCODE_SECTIONS)[number] : 'overview'} />
      </div>
    </BarcodeModuleShell>
  );
}
