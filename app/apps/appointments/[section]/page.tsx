import AppointmentsWorkspace from '@/app/apps/appointments/AppointmentsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AppointmentsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <AppointmentsWorkspace section={section} />;
}
