import AccountingWorkspace from '@/app/apps/accounting/AccountingWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  return <AccountingWorkspace filters={await searchParams} />;
}
