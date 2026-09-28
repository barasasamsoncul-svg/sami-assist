import EventsWorkspace from '@/app/apps/events/EventsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function EventsPage() {
  return <EventsWorkspace />;
}
