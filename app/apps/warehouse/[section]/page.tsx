import WarehouseWorkspace from '@/app/apps/warehouse/WarehouseWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function WarehouseSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <WarehouseWorkspace section={section} />;
}
