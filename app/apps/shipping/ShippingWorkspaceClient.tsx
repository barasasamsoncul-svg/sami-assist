'use client';

import EnterpriseDataWorkspaceClient from '@/app/apps/_shared/EnterpriseDataWorkspaceClient';
import ShippingOperationsPanel from '@/app/apps/shipping/ShippingOperationsPanel';
import type { EnterpriseWorkspaceData } from '@/lib/apps/enterprise/service';
import type { StandaloneEnterpriseWorkspaceView } from '@/app/apps/_shared/loadStandaloneEnterpriseApp';

type ShippingSection = 'overview' | 'shipments' | 'tracking';

export default function ShippingWorkspaceClient({
  initialData, userId, initialView, initialTableKey, accessibleModuleKeys, nativeView, initialSection,
}: {
  initialData: EnterpriseWorkspaceData;
  userId: string;
  initialView: StandaloneEnterpriseWorkspaceView;
  initialTableKey: string | null;
  accessibleModuleKeys: string[];
  nativeView: boolean;
  initialSection: ShippingSection;
}) {
  if (nativeView) return <ShippingOperationsPanel initialSection={initialSection} warehouseAvailable={accessibleModuleKeys.includes('warehouse')} />;
  return <EnterpriseDataWorkspaceClient initialData={initialData} userId={userId} initialView={initialView}
    initialTableKey={initialTableKey} accessibleModuleKeys={accessibleModuleKeys} />;
}
