import MaintenanceWorkspace from '@/app/apps/maintenance/MaintenanceWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function MaintenancePage() {
  return <MaintenanceWorkspace />;
}
