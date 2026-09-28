'use client';

import EnterpriseDataWorkspaceClient from '@/app/apps/_shared/EnterpriseDataWorkspaceClient';

import type {
  EnterpriseWorkspaceData,
} from '@/lib/apps/enterprise/service';

import type {
  StandaloneEnterpriseWorkspaceView,
} from '@/app/apps/_shared/loadStandaloneEnterpriseApp';

export default function SmsMarketingWorkspaceClient({
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
    <EnterpriseDataWorkspaceClient
      initialData={initialData}
      userId={userId}
      initialView={initialView}
      initialTableKey={initialTableKey}
      accessibleModuleKeys={accessibleModuleKeys}
    />
  );
}
