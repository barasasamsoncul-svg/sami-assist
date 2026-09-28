import PlanningWorkspace from '@/app/apps/planning/PlanningWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PlanningSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <PlanningWorkspace section={section} />;
}
