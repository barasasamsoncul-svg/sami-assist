import MaintenanceWorkspace from '@/app/apps/maintenance/MaintenanceWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function MaintenanceSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <MaintenanceWorkspace section={section} />;
}
