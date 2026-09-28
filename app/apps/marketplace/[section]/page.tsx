import MarketplaceWorkspace from '@/app/apps/marketplace/MarketplaceWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function MarketplaceSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <MarketplaceWorkspace section={section} />;
}
