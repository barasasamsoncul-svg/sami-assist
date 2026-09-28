import FacilitiesWorkspace from '@/app/apps/facilities/FacilitiesWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function FacilitiesSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <FacilitiesWorkspace section={section} />;
}
