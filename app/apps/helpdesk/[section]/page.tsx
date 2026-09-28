import HelpdeskWorkspace from '@/app/apps/helpdesk/HelpdeskWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function HelpdeskSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <HelpdeskWorkspace section={section} />;
}
