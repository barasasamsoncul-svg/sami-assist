import ExpensesWorkspace from '@/app/apps/expenses/ExpensesWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function ExpensesPage() {
  return <ExpensesWorkspace />;
}
