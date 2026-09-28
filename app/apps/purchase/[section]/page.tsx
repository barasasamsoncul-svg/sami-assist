import PurchaseWorkspace from '@/app/apps/purchase/PurchaseWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PurchaseSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <PurchaseWorkspace section={section} />;
}
