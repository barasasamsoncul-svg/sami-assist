import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { inviteId } = await request.json();

    if (!inviteId) {
      return NextResponse.json({ error: 'Invite ID is required' }, { status: 400 });
    }

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    // Cancel invite
    await queryControl(
      `UPDATE invites SET status = 'cancelled' WHERE id = $1 AND business_id = $2`,
      [inviteId, activeBusinessId]
    );

    // Log
    await queryControl(
      `INSERT INTO audit_logs (user_id, business_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'invite_cancelled', 'invite', $3, $4)`,
      [session.user.id, activeBusinessId, inviteId, JSON.stringify({ cancelled: true })]
    );

    return NextResponse.json({ success: true, message: 'Invite cancelled' });

  } catch (error) {
    console.error('Cancel invite error:', error);
    return NextResponse.json({ error: 'Failed to cancel invite' }, { status: 500 });
  }
}