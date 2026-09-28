import BillingWorkspace from '@/app/apps/billing/BillingWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function BillingSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <BillingWorkspace section={section} />;
}
