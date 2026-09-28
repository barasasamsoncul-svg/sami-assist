import PlmWorkspace from '@/app/apps/plm/PlmWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PlmSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <PlmWorkspace section={section} />;
}
