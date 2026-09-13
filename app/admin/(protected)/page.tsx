import AdminDashboard from '@/app/admin/components/dashboard/AdminDashboard';
import { getAdminDashboardData } from '@/lib/admin/dashboard';
import { requireAdminSession } from '@/lib/auth/admin-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await requireAdminSession();

  const dashboard = await getAdminDashboardData();

  return (
    <AdminDashboard
      dashboard={dashboard}
    />
  );
}