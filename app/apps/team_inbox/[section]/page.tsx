import TeamInboxWorkspace from '@/app/apps/team_inbox/TeamInboxWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function TeamInboxSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <TeamInboxWorkspace section={section} />;
}
