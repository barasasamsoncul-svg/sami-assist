'use client';

import EnterpriseDataWorkspaceClient from '@/app/apps/_shared/EnterpriseDataWorkspaceClient';
import VendorPortalOperationsPanel from '@/app/apps/vendor_portal/VendorPortalOperationsPanel';
import type { EnterpriseWorkspaceData } from '@/lib/apps/enterprise/service';
import type { StandaloneEnterpriseWorkspaceView } from '@/app/apps/_shared/loadStandaloneEnterpriseApp';

type VendorPortalSection = 'overview' | 'accounts' | 'rfqs' | 'responses' | 'documents' | 'messages';

export default function VendorPortalWorkspaceClient({
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
  initialSection: VendorPortalSection;
}) {
  if (nativeView) {
    return (
      <VendorPortalOperationsPanel
        initialSection={initialSection}
        canTransition={initialData.capabilities.canTransition}
        canManageAccess={initialData.capabilities.canEdit}
        availableTableKeys={initialData.tables.map((table) => table.key)}
      />
    );
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
