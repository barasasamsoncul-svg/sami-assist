import PosShopWorkspace from '@/app/apps/pos_shop/PosShopWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PosShopSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <PosShopWorkspace section={section} />;
}
