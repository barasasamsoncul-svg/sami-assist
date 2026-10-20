import { loadStandaloneEnterpriseApp } from '@/app/apps/_shared/loadStandaloneEnterpriseApp';
import { SAMI_PERMISSIONS } from '@/lib/auth/permission-catalog';
import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { INVOICING_PERMISSIONS, InvoicingError, requireInvoicingContext } from '@/lib/apps/invoicing/context';
import { syncCrmCustomerMaster } from '@/lib/apps/crm/customer-sync';
import CrmModuleShell from '@/app/apps/crm/CrmModuleShell';
import CrmWorkspaceClient from '@/app/apps/crm/CrmWorkspaceClient';



async function syncSharedCustomerMasterForCrm() {
  try {
    const [crmAccounts, crmContacts, crmAccountsEdit, crmContactsEdit] = await Promise.all([
      requireEnterpriseModuleTableContext('crm', 'crm_accounts', 'create'),
      requireEnterpriseModuleTableContext('crm', 'crm_contacts', 'create'),
      requireEnterpriseModuleTableContext('crm', 'crm_accounts', 'edit'),
      requireEnterpriseModuleTableContext('crm', 'crm_contacts', 'edit'),
    ]);
    const invoicing = await requireInvoicingContext(INVOICING_PERMISSIONS.CUSTOMER_MANAGE);

    const contexts = [crmContacts, crmAccountsEdit, crmContactsEdit];
    if (
      contexts.some((context) =>
        context.tenantId !== crmAccounts.tenantId ||
        context.companyId !== crmAccounts.companyId ||
        context.userId !== crmAccounts.userId
      ) ||
      invoicing.tenantId !== crmAccounts.tenantId ||
      invoicing.companyId !== crmAccounts.companyId ||
      invoicing.userId !== crmAccounts.userId
    ) {
      return;
    }

    await syncCrmCustomerMaster({
      pool: crmAccounts.pool,
      companyId: crmAccounts.companyId,
      userId: crmAccounts.userId,
    });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
    if (
      error instanceof InvoicingError &&
      ['INVOICING_NOT_INSTALLED', 'INVOICING_PERMISSION_REQUIRED', 'INVOICING_WORKSPACE_SUSPENDED'].includes(error.code)
    ) {
      return;
    }
    if (['MODULE_PERMISSION_REQUIRED', 'MODULE_NOT_INSTALLED', 'TABLE_NOT_ALLOWED'].includes(code)) {
      return;
    }
    // Integration failure must not take the CRM workspace down; the next page
    // load can retry, while the main CRM workspace remains available.
    console.error('[SaMi CRM shared-customer sync] request failed:', error);
  }
}

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
  const dataQualityView = section === 'data-quality';
  const mergeHistoryView = section === 'merge-history';
  const relationshipHealthView = section === 'health';
  const reportsView = section === 'reports';
  await syncSharedCustomerMasterForCrm();
  const {
    session,
    account,
    shell,
    data,
    notifications,
    resolved,
    can,
  } = await loadStandaloneEnterpriseApp(MODULE_KEY, followUpsView || segmentsView || dataQualityView || mergeHistoryView || relationshipHealthView ? undefined : section);

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
    { key: 'data-quality', label: 'Data quality', href: appBaseHref + '/data-quality', description: 'Review duplicate accounts and contacts and safely merge duplicate accounts.', sectionLabel: 'Relationships' },
    { key: 'merge-history', label: 'Merge history', href: appBaseHref + '/merge-history', description: 'Review account and contact merge records and safely recover eligible changes.', sectionLabel: 'Relationships' },
    { key: 'health', label: 'Relationship health', href: appBaseHref + '/health', description: 'Prioritize accounts by engagement, contact coverage and overdue follow-ups.', sectionLabel: 'Insights' },
    { key: 'follow-ups', label: 'Follow-ups', href: appBaseHref + '/follow-ups', description: 'Manage overdue, today and upcoming CRM activities.', sectionLabel: 'Activity' },
    ...(data.capabilities.canReport ? [{ key: 'reports', label: 'Reports', href: appBaseHref + '/reports', description: 'Relationship coverage and engagement reporting.', sectionLabel: 'Insights' }] : []),
    { key: 'activity', label: 'Activity', href: appBaseHref + '/activity', description: 'Recent module changes and user actions.', sectionLabel: 'Insights' },
    ...(data.capabilities.canManageSettings && crmData.tables.some((table) => table.settingTable) ? [{ key: 'settings', label: 'Settings', href: appBaseHref + '/settings', description: 'Module defaults, policy and configuration.', sectionLabel: 'Configuration' }] : []),
  ];

  const accessibleModuleKeys = shell.accessibleModules.map((module) => module.registryKey);
  const activeSidebarKey = accountId ? 'crm_accounts' : reportsView ? 'reports' : relationshipHealthView ? 'health' : mergeHistoryView ? 'merge-history' : dataQualityView ? 'data-quality' : segmentsView ? 'segments' : followUpsView ? 'follow-ups' : resolved.view === 'records' ? (resolved.tableKey || 'crm_accounts') : resolved.view;

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
        dataQualityView={dataQualityView}
        mergeHistoryView={mergeHistoryView}
        relationshipHealthView={relationshipHealthView}
        reportsView={reportsView}
      />
    </CrmModuleShell>
  );
}
