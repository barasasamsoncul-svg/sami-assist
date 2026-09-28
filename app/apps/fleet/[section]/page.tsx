import FleetWorkspace from '@/app/apps/fleet/FleetWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function FleetSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <FleetWorkspace section={section} />;
}
