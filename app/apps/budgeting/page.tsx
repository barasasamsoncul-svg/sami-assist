import BudgetingWorkspace from '@/app/apps/budgeting/BudgetingWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function BudgetingPage() {
  return <BudgetingWorkspace />;
}
