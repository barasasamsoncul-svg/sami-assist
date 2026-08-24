import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    if (!activeBusinessId) return NextResponse.json({ error: 'No business found' }, { status: 403 });

    const result = await queryControl(
      `SELECT 
        al.id,
        al.action,
        al.resource_type,
        al.resource_id,
        al.details,
        al.ip,
        al.user_agent,
        al.created_at,
        u.full_name,
        u.email
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.business_id = $1
       ORDER BY al.created_at DESC
       LIMIT 100`,
      [activeBusinessId]
    );

    return NextResponse.json({ success: true, logs: result.rows });

  } catch (error) {
    console.error('Audit logs error:', error);
    return NextResponse.json({ error: 'Failed to load audit logs' }, { status: 500 });
  }
}