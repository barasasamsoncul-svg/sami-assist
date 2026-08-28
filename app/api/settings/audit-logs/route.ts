import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserTenants } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = `SELECT al.*, u.full_name, u.email FROM audit_logs al
                 LEFT JOIN users u ON u.id = al.user_id
                 WHERE al.tenant_id = $1`;
    const params: any[] = [activeTenantId];

    if (action && action !== 'all') {
      params.push(action);
      query += ` AND al.action = $${params.length}`;
    }

    query += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await queryControl(query, params);

    return NextResponse.json({ success: true, logs: result.rows });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}