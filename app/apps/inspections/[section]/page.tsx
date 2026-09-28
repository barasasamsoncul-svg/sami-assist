import InspectionsWorkspace from '@/app/apps/inspections/InspectionsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function InspectionsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <InspectionsWorkspace section={section} />;
}
