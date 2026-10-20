'use client';

import EnterpriseDataWorkspaceClient from '@/app/apps/_shared/EnterpriseDataWorkspaceClient';
import CrmSalesIntegrationPanel from '@/app/apps/crm/CrmSalesIntegrationPanel';
import CrmCustomerLinkPanel from '@/app/apps/crm/CrmCustomerLinkPanel';
import CrmRelationshipTimelinePanel from '@/app/apps/crm/CrmRelationshipTimelinePanel';
import CrmAccount360Panel from '@/app/apps/crm/CrmAccount360Panel';
import CrmAccount360Launcher from '@/app/apps/crm/CrmAccount360Launcher';
import CrmFollowUpsPanel from '@/app/apps/crm/CrmFollowUpsPanel';
import CrmAccountSegmentsPanel from '@/app/apps/crm/CrmAccountSegmentsPanel';
import CrmDataQualityPanel from '@/app/apps/crm/CrmDataQualityPanel';
import CrmMergeHistoryPanel from '@/app/apps/crm/CrmMergeHistoryPanel';
import CrmRelationshipHealthPanel from '@/app/apps/crm/CrmRelationshipHealthPanel';

import type { EnterpriseWorkspaceData } from '@/lib/apps/enterprise/service';
import type { StandaloneEnterpriseWorkspaceView } from '@/app/apps/_shared/loadStandaloneEnterpriseApp';

export default function CrmWorkspaceClient({
  initialData,
  userId,
  initialView,
  initialTableKey,
  accessibleModuleKeys,
  accountId,
  followUpsView,
  segmentsView,
  dataQualityView,
  mergeHistoryView,
  relationshipHealthView,
}: {
  initialData: EnterpriseWorkspaceData;
  userId: string;
  initialView: StandaloneEnterpriseWorkspaceView;
  initialTableKey: string | null;
  accessibleModuleKeys: string[];
  accountId?: string | null;
  followUpsView: boolean;
  segmentsView: boolean;
  dataQualityView: boolean;
  mergeHistoryView: boolean;
  relationshipHealthView: boolean;
}) {
  if (accountId) {
    return (
      <CrmAccount360Panel
        accountId={accountId}
        salesEnabled={accessibleModuleKeys.includes('sales')}
        invoicingEnabled={accessibleModuleKeys.includes('invoicing')}
        canCreateInteraction={initialData.capabilities.canCreate}
        canEditAccount={initialData.capabilities.canEdit}
      />
    );
  }

  if (followUpsView) {
    return <CrmFollowUpsPanel canEdit={initialData.capabilities.canEdit} />;
  }

  if (segmentsView) {
    return <CrmAccountSegmentsPanel />;
  }

  if (dataQualityView) {
    return <CrmDataQualityPanel canMerge={initialData.capabilities.canEdit} />;
  }

  if (mergeHistoryView) {
    return <CrmMergeHistoryPanel canRecover={initialData.capabilities.canEdit} />;
  }

  if (relationshipHealthView) {
    return <CrmRelationshipHealthPanel />;
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
