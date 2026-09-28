import SafetyWorkspace from '@/app/apps/safety/SafetyWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SafetySectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <SafetyWorkspace section={section} />;
}
