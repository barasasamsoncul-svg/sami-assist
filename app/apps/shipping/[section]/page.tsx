import ShippingWorkspace from '@/app/apps/shipping/ShippingWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ShippingSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <ShippingWorkspace section={section} />;
}
