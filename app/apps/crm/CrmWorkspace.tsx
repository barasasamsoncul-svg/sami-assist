import { loadStandaloneEnterpriseApp } from '@/app/apps/_shared/loadStandaloneEnterpriseApp';
import { SAMI_PERMISSIONS } from '@/lib/auth/permission-catalog';
import CrmModuleShell from '@/app/apps/crm/CrmModuleShell';
import CrmWorkspaceClient from '@/app/apps/crm/CrmWorkspaceClient';

const MODULE_KEY = 'crm';
const CRM_TABLE_LABELS: Record<string, string> = {
  crm_accounts: 'Accounts',
  crm_contacts: 'Contacts',
  crm_interactions: 'Interactions',
};

export default async function CrmWorkspace({
  section,
  accountId,
}: {
  section?: string | null;
  accountId?: string | null;
}) {
  const followUpsView = section === 'follow-ups';
  const segmentsView = section === 'segments';
  const {
    session,
    account,
    shell,
    data,
    notifications,
    resolved,
    can,
  } = await loadStandaloneEnterpriseApp(MODULE_KEY, followUpsView || segmentsView ? undefined : section);

  const crmData = {
    ...data,
    tables: data.tables.map((table) => ({
      ...table,
      label: CRM_TABLE_LABELS[table.key] || table.label,
    })),
  };

  const appBaseHref = '/apps/crm';
  const appSidebarItems = [
    { key: 'overview', label: 'Overview', href: appBaseHref, description: 'Relationship coverage, priorities and connected business activity.', sectionLabel: 'Overview' },
    ...crmData.tables.filter((table) => !table.settingTable).map((table) => ({
      key: table.key,
      label: table.label,
      href: appBaseHref + '/' + encodeURIComponent(table.key),
      description: 'Open ' + table.label.toLowerCase() + ' records.',
      badge: table.count,
      sectionLabel: 'Relationships',
    })),
    { key: 'segments', label: 'Account segments', href: appBaseHref + '/segments', description: 'Filter accounts by lifecycle, owner, source and engagement; save reusable views.', sectionLabel: 'Relationships' },
    { key: 'follow-ups', label: 'Follow-ups', href: appBaseHref + '/follow-ups', description: 'Manage overdue, today and upcoming CRM activities.', sectionLabel: 'Activity' },
    ...(data.capabilities.canReport ? [{ key: 'reports', label: 'Reports', href: appBaseHref + '/reports', description: 'Relationship coverage and engagement reporting.', sectionLabel: 'Insights' }] : []),
    { key: 'activity', label: 'Activity', href: appBaseHref + '/activity', description: 'Recent module changes and user actions.', sectionLabel: 'Insights' },
    ...(data.capabilities.canManageSettings && crmData.tables.some((table) => table.settingTable) ? [{ key: 'settings', label: 'Settings', href: appBaseHref + '/settings', description: 'Module defaults, policy and configuration.', sectionLabel: 'Configuration' }] : []),
  ];

  const accessibleModuleKeys = shell.accessibleModules.map((module) => module.registryKey);
  const activeSidebarKey = accountId ? 'crm_accounts' : segmentsView ? 'segments' : followUpsView ? 'follow-ups' : resolved.view === 'records' ? (resolved.tableKey || 'crm_accounts') : resolved.view;

  return (
    <CrmModuleShell
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
      <CrmWorkspaceClient
        initialData={crmData}
        userId={session.user.id}
        initialView={resolved.view}
        initialTableKey={resolved.tableKey}
        accessibleModuleKeys={accessibleModuleKeys}
        accountId={accountId || null}
        followUpsView={followUpsView}
        segmentsView={segmentsView}
      />
    </CrmModuleShell>
  );
}
