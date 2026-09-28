import TimesheetsWorkspace from '@/app/apps/timesheets/TimesheetsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function TimesheetsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <TimesheetsWorkspace section={section} />;
}
