import ManufacturingWorkspace from '@/app/apps/manufacturing/ManufacturingWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ManufacturingSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <ManufacturingWorkspace section={section} />;
}
