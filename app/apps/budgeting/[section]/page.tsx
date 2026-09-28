import BudgetingWorkspace from '@/app/apps/budgeting/BudgetingWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function BudgetingSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <BudgetingWorkspace section={section} />;
}
