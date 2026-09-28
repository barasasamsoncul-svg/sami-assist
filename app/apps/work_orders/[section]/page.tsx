import WorkOrdersWorkspace from '@/app/apps/work_orders/WorkOrdersWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function WorkOrdersSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <WorkOrdersWorkspace section={section} />;
}
