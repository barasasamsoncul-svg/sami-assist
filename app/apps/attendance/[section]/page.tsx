import AttendanceWorkspace from '@/app/apps/attendance/AttendanceWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AttendanceSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <AttendanceWorkspace section={section} />;
}
