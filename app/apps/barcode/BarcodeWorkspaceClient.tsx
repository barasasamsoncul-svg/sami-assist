'use client';

import EnterpriseDataWorkspaceClient from '@/app/apps/_shared/EnterpriseDataWorkspaceClient';
import BarcodeScannerPanel from '@/app/apps/barcode/BarcodeScannerPanel';
import type { EnterpriseWorkspaceData } from '@/lib/apps/enterprise/service';
import type { StandaloneEnterpriseWorkspaceView } from '@/app/apps/_shared/loadStandaloneEnterpriseApp';

type BarcodeSection = 'overview' | 'scanner' | 'history';

export default function BarcodeWorkspaceClient({
  initialData, userId, initialView, initialTableKey, accessibleModuleKeys, nativeView, initialSection,
}: {
  initialData: EnterpriseWorkspaceData;
  userId: string;
  initialView: StandaloneEnterpriseWorkspaceView;
  initialTableKey: string | null;
  accessibleModuleKeys: string[];
  nativeView: boolean;
  initialSection: BarcodeSection;
}) {
  if (nativeView) return <BarcodeScannerPanel initialSection={initialSection} />;
  return <EnterpriseDataWorkspaceClient initialData={initialData} userId={userId} initialView={initialView}
    initialTableKey={initialTableKey} accessibleModuleKeys={accessibleModuleKeys} />;
}
