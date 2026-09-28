import EventsWorkspace from '@/app/apps/events/EventsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function EventsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <EventsWorkspace section={section} />;
}
