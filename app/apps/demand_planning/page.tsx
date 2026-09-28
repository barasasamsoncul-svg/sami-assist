import DemandPlanningWorkspace from '@/app/apps/demand_planning/DemandPlanningWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function DemandPlanningPage() {
  return <DemandPlanningWorkspace />;
}
