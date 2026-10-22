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

import WarehouseModuleShell from '@/app/apps/warehouse/WarehouseModuleShell';
import WarehouseWorkspaceClient from '@/app/apps/warehouse/WarehouseWorkspaceClient';

const MODULE_KEY = 'warehouse';
const WAREHOUSE_SECTIONS = [
  'locations',
  'operations',
  'putaway',
  'picking',
  'packages',
] as const;

export default async function WarehouseWorkspace({
  section,
}: {
  section?: string | null;
}) {
  const nativeSection = WAREHOUSE_SECTIONS.includes(
    (section || '') as (typeof WAREHOUSE_SECTIONS)[number],
  );
  const nativeView = !section || section === 'overview' || nativeSection;

  const {
    session,
    account,
    shell,
    app,
    data,
    notifications,
    resolved,
    can,
    uiProfile,
  } = await loadStandaloneEnterpriseApp(
    MODULE_KEY,
    nativeSection ? undefined : section,
  );

  const appBaseHref = '/apps/warehouse';

  const appSidebarItems = [
    {
      key: 'overview',
      label: 'Overview',
      href: appBaseHref,
      description: 'Warehouse activity, workloads and operational priorities.',
      sectionLabel: 'Workspace',
    },
    {
      key: 'locations',
      label: 'Locations',
      href: appBaseHref + '/locations',
      description: 'Manage receiving, storage, picking and packing locations.',
      sectionLabel: 'Warehouse execution',
    },
    {
      key: 'operations',
      label: 'Operations',
      href: appBaseHref + '/operations',
      description: 'Create and execute put-away, relocation, receiving and picking work.',
      sectionLabel: 'Warehouse execution',
    },
    {
      key: 'putaway',
      label: 'Put-away rules',
      href: appBaseHref + '/putaway',
      description: 'Set priority-based destination location guidance.',
      sectionLabel: 'Warehouse execution',
    },
    {
      key: 'picking',
      label: 'Picking waves',
      href: appBaseHref + '/picking',
      description: 'Group and release picking operations in controlled batches.',
      sectionLabel: 'Fulfilment',
    },
    {
      key: 'packages',
      label: 'Packages',
      href: appBaseHref + '/packages',
      description: 'Track packed parcels through dispatch and delivery hand-off.',
      sectionLabel: 'Fulfilment',
    },
    ...data.tables
      .filter((table) =>
        !table.settingTable &&
        ![
          'warehouse_locations',
          'warehouse_operations',
          'warehouse_operation_lines',
          'warehouse_putaway_rules',
          'warehouse_picking_batches',
          'warehouse_picking_batch_operations',
          'warehouse_packages',
        ].includes(table.key),
      )
      .map((table) => ({
        key: table.key,
        label: table.label,
        href: appBaseHref + '/' + encodeURIComponent(table.key),
        description: 'Open ' + table.label.toLowerCase() + ' records.',
        badge: table.count,
        sectionLabel: 'Registers',
      })),
    ...(data.capabilities.canReport
      ? [{
          key: 'reports',
          label: 'Reports',
          href: appBaseHref + '/reports',
          description: 'Module analysis and operational reporting.',
          sectionLabel: 'Insights',
        }]
      : []),
    {
      key: 'activity',
      label: 'Activity',
      href: appBaseHref + '/activity',
      description: 'Recent Warehouse changes and user actions.',
      sectionLabel: 'Workspace',
    },
    ...(data.capabilities.canManageSettings && data.tables.some((table) => table.settingTable)
      ? [{
          key: 'settings',
          label: 'Settings',
          href: appBaseHref + '/settings',
          description: 'Warehouse defaults, policy and configuration.',
          sectionLabel: 'Workspace',
        }]
      : []),
  ];

  const activeSidebarKey = nativeSection
    ? (section || 'overview')
    : resolved.view === 'records'
      ? (resolved.tableKey || 'overview')
      : resolved.view;

  return (
    <WarehouseModuleShell
      user={session.user}
      tenant={account.tenant}
      modules={shell.accessibleModules}
      appSidebarItems={appSidebarItems}
      activeSidebarKey={activeSidebarKey}
      unreadNotifications={notifications?.unreadCount || 0}
      sidebarCapabilities={{
        aiEnabled: shell.aiAvailable,
        notificationsEnabled: can(SAMI_PERMISSIONS.NOTIFICATIONS_VIEW),
      }}
      companyName={data.company.name}
    >
      <div
        className={styles.enterpriseWorkspace}
        data-module={MODULE_KEY}
        data-archetype={uiProfile.archetype}
        data-navigation={uiProfile.navigation}
        data-density={uiProfile.density}
        data-header={uiProfile.header}
        data-warehouse-section={section || 'overview'}
        style={{
          '--sami-module-accent': uiProfile.accent,
          '--sami-module-secondary': uiProfile.secondary,
        } as CSSProperties}
      >
        <WarehouseWorkspaceClient
          initialData={data}
          userId={session.user.id}
          initialView={resolved.view}
          initialTableKey={resolved.tableKey}
          accessibleModuleKeys={shell.accessibleModules.map((module) => module.registryKey)}
          nativeView={nativeView}
          initialSection={nativeSection ? section as (typeof WAREHOUSE_SECTIONS)[number] : 'overview'}
        />
      </div>
    </WarehouseModuleShell>
  );
}
