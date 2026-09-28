import WorkOrdersWorkspace from '@/app/apps/work_orders/WorkOrdersWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function WorkOrdersPage() {
  return <WorkOrdersWorkspace />;
}
