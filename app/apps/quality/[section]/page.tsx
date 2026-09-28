import QualityWorkspace from '@/app/apps/quality/QualityWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function QualitySectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <QualityWorkspace section={section} />;
}
