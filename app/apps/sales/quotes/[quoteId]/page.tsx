import SalesSectionPage from '@/app/apps/sales/SalesSectionPage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SalesQuotePage({
  params,
}: {
  params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;
  return <SalesSectionPage view="quotes" quoteId={quoteId} />;
}