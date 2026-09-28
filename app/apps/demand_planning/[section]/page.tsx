import DemandPlanningWorkspace from '@/app/apps/demand_planning/DemandPlanningWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function DemandPlanningSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <DemandPlanningWorkspace section={section} />;
}
