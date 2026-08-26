import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    if (!activeBusinessId) {
      return NextResponse.json({ error: 'No business found' }, { status: 403 });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action'); // Filter by action type
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build query
    let query = `
      SELECT 
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
    `;

    const params: any[] = [activeBusinessId];

    if (action && action !== 'all') {
      params.push(action);
      query += ` AND al.action = $${params.length}`;
    }

    query += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await queryControl(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total FROM audit_logs 
      WHERE business_id = $1
    `;
    const countParams: any[] = [activeBusinessId];

    if (action && action !== 'all') {
      countParams.push(action);
      countQuery += ` AND action = $${countParams.length}`;
    }

    const countResult = await queryControl(countQuery, countParams);

    // Get unique action types for filter dropdown
    const actionsResult = await queryControl(
      `SELECT DISTINCT action FROM audit_logs WHERE business_id = $1 ORDER BY action`,
      [activeBusinessId]
    );

    return NextResponse.json({
      success: true,
      logs: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit,
      offset,
      actions: actionsResult.rows.map((row: any) => row.action),
    });

  } catch (error) {
    console.error('Audit logs API error:', error);
    return NextResponse.json({ error: 'Failed to load audit logs' }, { status: 500 });
  }
}