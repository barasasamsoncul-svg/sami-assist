import TaxWorkspace from '@/app/apps/tax/TaxWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function TaxSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <TaxWorkspace section={section} />;
}
