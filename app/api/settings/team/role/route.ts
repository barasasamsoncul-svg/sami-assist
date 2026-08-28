import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserTenants } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { memberId, role } = await request.json();
    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

    // Check permission
    const currentRole = await queryControl(
      `SELECT r.name FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id
       WHERE ur.tenant_id = $1 AND ur.user_id = $2 LIMIT 1`,
      [activeTenantId, session.user.id]
    );

    if (!['Owner', 'Administrator'].includes(currentRole.rows[0]?.name)) {
      return NextResponse.json({ error: 'No permission' }, { status: 403 });
    }

    // Get role ID
    const roleResult = await queryControl(`SELECT id FROM roles WHERE name = $1`, [role]);

    // Remove old role
    await queryControl(
      `DELETE FROM user_roles WHERE tenant_id = $1 AND user_id = $2`,
      [activeTenantId, memberId]
    );

    // Assign new role
    if (roleResult.rows.length > 0) {
      await queryControl(
        `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)`,
        [activeTenantId, memberId, roleResult.rows[0].id]
      );
    }

    return NextResponse.json({ success: true, message: 'Role updated' });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}