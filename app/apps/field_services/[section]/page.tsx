import FieldServicesWorkspace from '@/app/apps/field_services/FieldServicesWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function FieldServicesSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <FieldServicesWorkspace section={section} />;
}
