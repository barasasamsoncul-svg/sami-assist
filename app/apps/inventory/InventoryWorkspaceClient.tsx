'use client';

import EnterpriseDataWorkspaceClient from '@/app/apps/_shared/EnterpriseDataWorkspaceClient';
import InventoryStockControlPanel from '@/app/apps/inventory/InventoryStockControlPanel';

import type {
  EnterpriseWorkspaceData,
} from '@/lib/apps/enterprise/service';

import type {
  StandaloneEnterpriseWorkspaceView,
} from '@/app/apps/_shared/loadStandaloneEnterpriseApp';

export default function InventoryWorkspaceClient({
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
    <div className="min-w-0 space-y-6">
      <InventoryStockControlPanel />
      <EnterpriseDataWorkspaceClient
        initialData={initialData}
        userId={userId}
        initialView={initialView}
        initialTableKey={initialTableKey}
        accessibleModuleKeys={accessibleModuleKeys}
      />
    </div>
  );
}
