'use client';

import EnterpriseDataWorkspaceClient from '@/app/apps/_shared/EnterpriseDataWorkspaceClient';

import CrmSalesIntegrationPanel from '@/app/apps/crm/CrmSalesIntegrationPanel';

import CrmCustomerLinkPanel from '@/app/apps/crm/CrmCustomerLinkPanel';

import CrmRelationshipTimelinePanel from '@/app/apps/crm/CrmRelationshipTimelinePanel';

import type {
  EnterpriseWorkspaceData,
} from '@/lib/apps/enterprise/service';

import type {
  StandaloneEnterpriseWorkspaceView,
} from '@/app/apps/_shared/loadStandaloneEnterpriseApp';

export default function CrmWorkspaceClient({
  initialData,
  userId,
  initialView,
  initialTableKey,
  accessibleModuleKeys,
}: {
  initialData: EnterpriseWorkspaceData;
  userId: string;
  initialView: StandaloneEnterpriseWorkspaceView;
  initialTableKey: string | null;
  accessibleModuleKeys: string[];
}) {
  return (
    <>
      {initialView === 'overview' ? (
        <>
          <CrmSalesIntegrationPanel
            enabled={accessibleModuleKeys.includes('sales')}
          />
          <CrmCustomerLinkPanel
            enabled={accessibleModuleKeys.includes('invoicing')}
          />
          <CrmRelationshipTimelinePanel
            salesEnabled={accessibleModuleKeys.includes('sales')}
            canCreate={initialData.capabilities.canCreate}
            canEdit={initialData.capabilities.canEdit}
          />
        </>
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
