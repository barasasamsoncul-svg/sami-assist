import ExpensesWorkspace from '@/app/apps/expenses/ExpensesWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ExpensesSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <ExpensesWorkspace section={section} />;
}
