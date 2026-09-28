import AppointmentsWorkspace from '@/app/apps/appointments/AppointmentsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function AppointmentsPage() {
  return <AppointmentsWorkspace />;
}
