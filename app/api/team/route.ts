import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserTenants } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

    const result = await queryControl(
      `SELECT tu.id, tu.user_id, tu.status, tu.is_owner, tu.joined_at,
              u.email, u.full_name, u.avatar_url,
              COALESCE(r.name, CASE WHEN tu.is_owner THEN 'Owner' ELSE 'Member' END) as role
       FROM tenant_users tu
       INNER JOIN users u ON u.id = tu.user_id
       LEFT JOIN user_roles ur ON ur.tenant_id = tu.tenant_id AND ur.user_id = tu.user_id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE tu.tenant_id = $1
       ORDER BY tu.joined_at ASC`,
      [activeTenantId]
    );

    return NextResponse.json({ success: true, team: result.rows });

  } catch (error) {
    console.error('Team API error:', error);
    return NextResponse.json({ error: 'Failed to load team' }, { status: 500 });
  }
}