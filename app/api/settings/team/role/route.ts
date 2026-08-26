import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { memberId, role } = await request.json();

    if (!memberId || !role) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    if (!['owner', 'admin', 'manager', 'member'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    // Check if current user is owner or admin
    const currentUserRole = await queryControl(
      `SELECT role FROM business_users WHERE business_id = $1 AND user_id = $2`,
      [activeBusinessId, session.user.id]
    );

    if (!['owner', 'admin'].includes(currentUserRole.rows[0]?.role)) {
      return NextResponse.json({ error: 'You do not have permission to change roles' }, { status: 403 });
    }

    // Update role
    await queryControl(
      `UPDATE business_users SET role = $1, updated_at = NOW() WHERE id = $2 AND business_id = $3`,
      [role, memberId, activeBusinessId]
    );

    // Log
    await queryControl(
      `INSERT INTO audit_logs (user_id, business_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'role_changed', 'business_user', $3, $4)`,
      [session.user.id, activeBusinessId, memberId, JSON.stringify({ role })]
    );

    return NextResponse.json({ success: true, message: `Role updated to ${role}` });

  } catch (error) {
    console.error('Change role error:', error);
    return NextResponse.json({ error: 'Failed to change role' }, { status: 500 });
  }
}