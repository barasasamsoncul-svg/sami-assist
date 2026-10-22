'use client';

import EnterpriseDataWorkspaceClient from '@/app/apps/_shared/EnterpriseDataWorkspaceClient';
import PurchaseOperationsPanel from '@/app/apps/purchase/PurchaseOperationsPanel';
import type { EnterpriseWorkspaceData } from '@/lib/apps/enterprise/service';
import type { StandaloneEnterpriseWorkspaceView } from '@/app/apps/_shared/loadStandaloneEnterpriseApp';

type PurchaseSection = 'overview' | 'requisitions' | 'orders' | 'receipts';

export default function PurchaseWorkspaceClient({
  initialData, userId, initialView, initialTableKey, accessibleModuleKeys, nativeView, initialSection,
}: {
  initialData: EnterpriseWorkspaceData;
  userId: string;
  initialView: StandaloneEnterpriseWorkspaceView;
  initialTableKey: string | null;
  accessibleModuleKeys: string[];
  nativeView: boolean;
  initialSection: PurchaseSection;
}) {
  if (nativeView) {
    return <PurchaseOperationsPanel
      initialSection={initialSection}
      canTransition={initialData.capabilities.canTransition}
    />;
  }
  return (
    <EnterpriseDataWorkspaceClient
      initialData={initialData}
      userId={userId}
      initialView={initialView}
      initialTableKey={initialTableKey}
      accessibleModuleKeys={accessibleModuleKeys}
    />
  );
}
