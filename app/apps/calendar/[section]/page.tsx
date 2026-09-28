import CalendarWorkspace from '@/app/apps/calendar/CalendarWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function CalendarSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <CalendarWorkspace section={section} />;
}
