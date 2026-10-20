'use client';

import EnterpriseDataWorkspaceClient from '@/app/apps/_shared/EnterpriseDataWorkspaceClient';
import CrmSalesIntegrationPanel from '@/app/apps/crm/CrmSalesIntegrationPanel';
import CrmCustomerLinkPanel from '@/app/apps/crm/CrmCustomerLinkPanel';
import CrmRelationshipTimelinePanel from '@/app/apps/crm/CrmRelationshipTimelinePanel';
import CrmAccount360Panel from '@/app/apps/crm/CrmAccount360Panel';
import CrmAccount360Launcher from '@/app/apps/crm/CrmAccount360Launcher';

import type { EnterpriseWorkspaceData } from '@/lib/apps/enterprise/service';
import type { StandaloneEnterpriseWorkspaceView } from '@/app/apps/_shared/loadStandaloneEnterpriseApp';

export default function CrmWorkspaceClient({
  initialData,
  userId,
  initialView,
  initialTableKey,
  accessibleModuleKeys,
  accountId,
}: {
  initialData: EnterpriseWorkspaceData;
  userId: string;
  initialView: StandaloneEnterpriseWorkspaceView;
  initialTableKey: string | null;
  accessibleModuleKeys: string[];
  accountId?: string | null;
}) {
  if (accountId) {
    return (
      <CrmAccount360Panel
        accountId={accountId}
        salesEnabled={accessibleModuleKeys.includes('sales')}
        invoicingEnabled={accessibleModuleKeys.includes('invoicing')}
        canCreateInteraction={initialData.capabilities.canCreate}
      />
    );
  }

  const accountTable = initialData.tables.find((table) => table.key === 'crm_accounts');

  return (
    <>
      {initialView === 'overview' ? (
        <>
          <CrmSalesIntegrationPanel enabled={accessibleModuleKeys.includes('sales')} />
          <CrmCustomerLinkPanel enabled={accessibleModuleKeys.includes('invoicing')} />
          <CrmRelationshipTimelinePanel
            salesEnabled={accessibleModuleKeys.includes('sales')}
            canCreate={initialData.capabilities.canCreate}
            canEdit={initialData.capabilities.canEdit}
          />
        </>
      ) : null}
      {initialView === 'records' && initialTableKey === 'crm_accounts' ? (
        <CrmAccount360Launcher records={accountTable?.records || []} />
      ) : null}
      <EnterpriseDataWorkspaceClient
        initialData={initialData}
        userId={userId}
        initialView={initialView}
        initialTableKey={initialTableKey}
        accessibleModuleKeys={accessibleModuleKeys}
      />
    </>
  );
}
