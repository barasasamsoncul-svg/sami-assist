import InventoryWorkspace from '@/app/apps/inventory/InventoryWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function InventorySectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <InventoryWorkspace section={section} />;
}
