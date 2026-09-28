import BarcodeWorkspace from '@/app/apps/barcode/BarcodeWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function BarcodeSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <BarcodeWorkspace section={section} />;
}
