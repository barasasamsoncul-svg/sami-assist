import AccountingWorkspace from '@/app/apps/accounting/AccountingWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AccountingSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <AccountingWorkspace section={section} />;
}
