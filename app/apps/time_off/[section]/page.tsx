import TimeOffWorkspace from '@/app/apps/time_off/TimeOffWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function TimeOffSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <TimeOffWorkspace section={section} />;
}
