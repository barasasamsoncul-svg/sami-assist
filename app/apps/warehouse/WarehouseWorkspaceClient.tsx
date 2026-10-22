'use client';

import EnterpriseDataWorkspaceClient from '@/app/apps/_shared/EnterpriseDataWorkspaceClient';
import WarehouseOperationsPanel from '@/app/apps/warehouse/WarehouseOperationsPanel';

import type {
  EnterpriseWorkspaceData,
} from '@/lib/apps/enterprise/service';

import type {
  StandaloneEnterpriseWorkspaceView,
} from '@/app/apps/_shared/loadStandaloneEnterpriseApp';

type WarehouseSection = 'overview' | 'locations' | 'operations' | 'putaway' | 'picking' | 'packages';

export default function WarehouseWorkspaceClient({
  initialData,
  userId,
  initialView,
  initialTableKey,
  accessibleModuleKeys,
  nativeView,
  initialSection,
}: {
  initialData: EnterpriseWorkspaceData;
  userId: string;
  initialView: StandaloneEnterpriseWorkspaceView;
  initialTableKey: string | null;
  accessibleModuleKeys: string[];
  nativeView: boolean;
  initialSection: WarehouseSection;
}) {
  if (nativeView) {
    return <WarehouseOperationsPanel initialSection={initialSection} />;
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
