import type {
  CSSProperties,
} from 'react';

import styles from '@/app/apps/[appKey]/EnterpriseModuleWorkspaceShell.module.css';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  loadStandaloneEnterpriseApp,
} from '@/app/apps/_shared/loadStandaloneEnterpriseApp';

import InventoryWorkspaceClient from '@/app/apps/inventory/InventoryWorkspaceClient';
import InventoryModuleShell from '@/app/apps/inventory/InventoryModuleShell';

const MODULE_KEY = 'inventory';

export default async function InventoryWorkspace({
  section,
}: {
  section?: string | null;
}) {
  const {
    session,
    account,
    shell,
    app,
    data,
    notifications,
    resolved,
    can,
    visual,
    uiProfile,
  } =
    await loadStandaloneEnterpriseApp(
      MODULE_KEY,
      section,
    );

  const appBaseHref =
    '/apps/inventory';

  const appSidebarItems = [
    {
      key: 'overview',
      label: 'Overview',
      href: appBaseHref,
      description: 'KPIs, priorities and current operating state.',
    },
    ...data.tables
      .filter(
        table =>
          !table.settingTable,
      )
      .map(
        table => ({
          key: table.key,
          label: table.label,
          href:
            appBaseHref +
            '/' +
            encodeURIComponent(
              table.key,
            ),
          description:
            'Open ' +
            table.label.toLowerCase() +
            ' records.',
          badge: table.count,
        }),
      ),
    ...(
      data.capabilities.canReport
        ? [{
            key: 'reports',
            label: 'Reports',
            href:
              appBaseHref +
              '/reports',
            description: 'Module analysis and operational reporting.',
          }]
        : []
    ),
    {
      key: 'activity',
      label: 'Activity',
      href:
        appBaseHref +
        '/activity',
      description: 'Recent module changes and user actions.',
    },
    ...(
      data.capabilities.canManageSettings &&
      data.tables.some(
        table =>
          table.settingTable,
      )
        ? [{
            key: 'settings',
            label: 'Settings',
            href:
              appBaseHref +
              '/settings',
            description: 'Module defaults, policy and configuration.',
          }]
        : []
    ),
  ];

  const activeSidebarKey =
    resolved.view === 'records'
      ? resolved.tableKey || 'overview'
      : resolved.view;

  return (
    <InventoryModuleShell
      appCategory={app.category}
      appIconKey={app.iconKey}
      user={session.user}
      tenant={account.tenant}
      modules={shell.accessibleModules}
      appSidebarItems={appSidebarItems}
      activeSidebarKey={activeSidebarKey}
      sidebarCapabilities={{
        aiEnabled: shell.aiAvailable,
        notificationsEnabled: can(
          SAMI_PERMISSIONS.NOTIFICATIONS_VIEW,
        ),
      }}
      unreadNotifications={
        notifications?.unreadCount ||
        0
      }
      companyName={data.company.name}
    >
      <div
        className={styles.enterpriseWorkspace}
        data-module={MODULE_KEY}
        data-archetype={uiProfile.archetype}
        data-navigation={uiProfile.navigation}
        data-density={uiProfile.density}
        data-header={uiProfile.header}
        style={{
          '--sami-module-accent':
            uiProfile.accent,
          '--sami-module-secondary':
            uiProfile.secondary,
        } as CSSProperties}
      >
        <InventoryWorkspaceClient
          initialData={data}
          userId={session.user.id}
          initialView={resolved.view}
          initialTableKey={resolved.tableKey}
          accessibleModuleKeys={
            shell.accessibleModules.map(
              module =>
                module.registryKey,
            )
          }
        />
      </div>
    </InventoryModuleShell>
  );
}
