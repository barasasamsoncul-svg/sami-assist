import AccountingWorkspace from '@/app/apps/accounting/AccountingWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AccountingSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{
    from?: string;
    to?: string;
    accountId?: string;
    page?: string;
    bucket?: string;
    customerId?: string;
    search?: string;
  }>;
}) {
  const { section } = await params;

  return <AccountingWorkspace section={section} filters={await searchParams} />;
}
