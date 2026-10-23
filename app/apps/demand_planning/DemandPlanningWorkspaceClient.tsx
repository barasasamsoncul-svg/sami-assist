'use client';
import EnterpriseDataWorkspaceClient from '@/app/apps/_shared/EnterpriseDataWorkspaceClient';
import DemandPlanningOperationsPanel from '@/app/apps/demand_planning/DemandPlanningOperationsPanel';
import type { EnterpriseWorkspaceData } from '@/lib/apps/enterprise/service';
import type { StandaloneEnterpriseWorkspaceView } from '@/app/apps/_shared/loadStandaloneEnterpriseApp';

type DemandPlanningSection = 'overview' | 'forecast' | 'replenishment';
export default function DemandPlanningWorkspaceClient({
  initialData, userId, initialView, initialTableKey, accessibleModuleKeys, nativeView, initialSection,
}: {
  initialData: EnterpriseWorkspaceData; userId: string; initialView: StandaloneEnterpriseWorkspaceView;
  initialTableKey: string | null; accessibleModuleKeys: string[]; nativeView: boolean; initialSection: DemandPlanningSection;
}) {
  if (nativeView) return <DemandPlanningOperationsPanel initialSection={initialSection} />;
  return <EnterpriseDataWorkspaceClient initialData={initialData} userId={userId} initialView={initialView}
    initialTableKey={initialTableKey} accessibleModuleKeys={accessibleModuleKeys} />;
}
