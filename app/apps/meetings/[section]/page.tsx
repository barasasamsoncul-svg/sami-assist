import MeetingsWorkspace from '@/app/apps/meetings/MeetingsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function MeetingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <MeetingsWorkspace section={section} />;
}
