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

    // Get all team members with their roles
    const teamResult = await queryControl(
      `SELECT 
        bu.id,
        bu.user_id,
        bu.role,
        bu.status,
        bu.permissions,
        bu.invited_at,
        bu.last_active_at,
        u.email,
        u.full_name,
        u.last_login_at
       FROM business_users bu
       INNER JOIN users u ON u.id = bu.user_id
       WHERE bu.business_id = $1
       ORDER BY 
         CASE bu.role 
           WHEN 'owner' THEN 1 
           WHEN 'admin' THEN 2 
           WHEN 'manager' THEN 3 
           WHEN 'member' THEN 4 
           ELSE 5 
         END,
         bu.created_at ASC`,
      [activeBusinessId]
    );

    return NextResponse.json({
      success: true,
      team: teamResult.rows,
    });

  } catch (error) {
    console.error('Team API error:', error);
    return NextResponse.json({ error: 'Failed to load team' }, { status: 500 });
  }
}