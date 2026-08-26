import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { memberId } = await request.json();

    if (!memberId) {
      return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
    }

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    // Check permission
    const currentUserRole = await queryControl(
      `SELECT role FROM business_users WHERE business_id = $1 AND user_id = $2`,
      [activeBusinessId, session.user.id]
    );

    if (!['owner', 'admin'].includes(currentUserRole.rows[0]?.role)) {
      return NextResponse.json({ error: 'You do not have permission to remove members' }, { status: 403 });
    }

    // Check if member is owner (can't remove owner)
    const memberResult = await queryControl(
      `SELECT role FROM business_users WHERE id = $1 AND business_id = $2`,
      [memberId, activeBusinessId]
    );

    if (memberResult.rows[0]?.role === 'owner') {
      return NextResponse.json({ error: 'Cannot remove the owner' }, { status: 400 });
    }

    // Remove member (deactivate)
    await queryControl(
      `UPDATE business_users SET status = 'removed', updated_at = NOW() WHERE id = $1 AND business_id = $2`,
      [memberId, activeBusinessId]
    );

    // Log
    await queryControl(
      `INSERT INTO audit_logs (user_id, business_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'member_removed', 'business_user', $3, $4)`,
      [session.user.id, activeBusinessId, memberId, JSON.stringify({ removed: true })]
    );

    return NextResponse.json({ success: true, message: 'Member removed' });

  } catch (error) {
    console.error('Remove member error:', error);
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
  }
}