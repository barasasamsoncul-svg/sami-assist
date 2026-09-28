import AccountingWorkspace from '@/app/apps/accounting/AccountingWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function AccountingPage() {
  return <AccountingWorkspace />;
}
