import type { CSSProperties } from 'react';
import styles from '@/app/apps/[appKey]/EnterpriseModuleWorkspaceShell.module.css';
import { SAMI_PERMISSIONS } from '@/lib/auth/permission-catalog';
import { loadStandaloneEnterpriseApp } from '@/app/apps/_shared/loadStandaloneEnterpriseApp';
import DemandPlanningModuleShell from '@/app/apps/demand_planning/DemandPlanningModuleShell';
import DemandPlanningWorkspaceClient from '@/app/apps/demand_planning/DemandPlanningWorkspaceClient';

const MODULE_KEY = 'demand_planning';
const NATIVE_SECTIONS = ['forecast', 'replenishment'] as const;

export default async function DemandPlanningWorkspace({ section }: { section?: string | null }) {
  const nativeSection = NATIVE_SECTIONS.includes((section || '') as (typeof NATIVE_SECTIONS)[number]);
  const nativeView = !section || section === 'overview' || nativeSection;
  const { session, account, shell, data, notifications, resolved, can, uiProfile } =
    await loadStandaloneEnterpriseApp(MODULE_KEY, nativeSection ? undefined : section);

  const baseHref = '/apps/demand_planning';
  const appSidebarItems = [
    { key: 'overview', label: 'Overview', href: baseHref, description: 'Demand signals, forecast runs and replenishment risks.', sectionLabel: 'Planning' },
    { key: 'forecast', label: 'Forecasts', href: baseHref + '/forecast', description: 'Generate moving-average forecasts from actual outbound stock movements.', sectionLabel: 'Planning' },
    { key: 'replenishment', label: 'Replenishment', href: baseHref + '/replenishment', description: 'Review suggested quantities against available stock.', sectionLabel: 'Execution' },
    ...data.tables.filter((table) => !table.settingTable && !['demand_forecasts', 'demand_forecast_lines', 'replenishment_recommendations'].includes(table.key)).map((table) => ({
      key: table.key, label: table.label, href: baseHref + '/' + encodeURIComponent(table.key),
      description: 'Manage ' + table.label.toLowerCase() + ' records.', badge: table.count, sectionLabel: 'Registers',
    })),
    ...(data.capabilities.canReport ? [{ key: 'reports', label: 'Reports', href: baseHref + '/reports', description: 'Forecast and stock-risk analysis.', sectionLabel: 'Insights' }] : []),
    { key: 'activity', label: 'Activity', href: baseHref + '/activity', description: 'Recent Demand Planning changes and user actions.', sectionLabel: 'Workspace' },
    ...(data.capabilities.canManageSettings && data.tables.some((table) => table.settingTable)
      ? [{ key: 'settings', label: 'Settings', href: baseHref + '/settings', description: 'Demand planning defaults and policy.', sectionLabel: 'Workspace' }]
      : []),
  ];

  const activeSidebarKey = nativeSection ? (section || 'overview')
    : resolved.view === 'records' ? (resolved.tableKey || 'overview') : resolved.view;
  return (
    <DemandPlanningModuleShell user={session.user} tenant={account.tenant} modules={shell.accessibleModules}
      appSidebarItems={appSidebarItems} activeSidebarKey={activeSidebarKey}
      unreadNotifications={notifications?.unreadCount || 0}
      sidebarCapabilities={{ aiEnabled: shell.aiAvailable, notificationsEnabled: can(SAMI_PERMISSIONS.NOTIFICATIONS_VIEW) }}
      companyName={data.company.name}>
      <div className={styles.enterpriseWorkspace} data-module={MODULE_KEY} data-archetype={uiProfile.archetype}
        data-navigation={uiProfile.navigation} data-density={uiProfile.density} data-header={uiProfile.header}
        data-demand-planning-section={section || 'overview'}
        style={{ '--sami-module-accent': uiProfile.accent, '--sami-module-secondary': uiProfile.secondary } as CSSProperties}>
        <DemandPlanningWorkspaceClient initialData={data} userId={session.user.id} initialView={resolved.view}
          initialTableKey={resolved.tableKey} accessibleModuleKeys={shell.accessibleModules.map((module) => module.registryKey)}
          nativeView={nativeView} initialSection={nativeSection ? section as (typeof NATIVE_SECTIONS)[number] : 'overview'} />
      </div>
    </DemandPlanningModuleShell>
  );
}
