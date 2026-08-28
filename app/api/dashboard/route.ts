import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserTenants } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';
import { getTenantDatabaseName } from '@/lib/db/registry';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get user's tenants (memberships)
    const tenants = await getUserTenants(session.user.id);

    if (tenants.length === 0) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }

    // Get active tenant
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0].id;
    const activeTenant = tenants.find(t => t.id === activeTenantId) || tenants[0];

    // Get installed modules
    const modulesResult = await queryControl(
      `SELECT m.key, m.name, m.category, m.icon, tm.status, tm.version
       FROM tenant_modules tm
       INNER JOIN modules m ON m.id = tm.module_id
       WHERE tm.tenant_id = $1 AND tm.status = 'installed'
       ORDER BY tm.installed_at ASC`,
      [activeTenantId]
    );

    // Get subscription
    const subResult = await queryControl(
      `SELECT s.status, s.billing_cycle, s.trial_ends_at, p.key as plan_key, p.name as plan_name
       FROM subscriptions s
       INNER JOIN plans p ON p.id = s.plan_id
       WHERE s.tenant_id = $1
       ORDER BY s.created_at DESC LIMIT 1`,
      [activeTenantId]
    );

    // Check database status
    const databaseName = await getTenantDatabaseName(activeTenantId);

    return NextResponse.json({
      success: true,
      user: session.user,
      tenants,
      activeTenant,
      installedModules: modulesResult.rows,
      subscription: subResult.rows[0] || null,
      databaseReady: !!databaseName,
    });

  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}