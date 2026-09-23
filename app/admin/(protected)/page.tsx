import AdminDashboard from '@/app/admin/components/dashboard/AdminDashboard';
import { getAdminDashboardData } from '@/lib/admin/dashboard';
import { getAdminOperationsDashboard } from '@/lib/admin/dashboard-operations';
import { requireAdminCapability } from '@/lib/admin/require-capability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session =
    await requireAdminCapability(
      'dashboard.read',
    );

  const [
    dashboard,
    operations,
  ] =
    await Promise.all([
      getAdminDashboardData(
        session.role,
      ),
      getAdminOperationsDashboard(
        session.role,
      ),
    ]);

  return (
    <AdminDashboard
      dashboard={dashboard}
      operations={operations}
    />
  );
}