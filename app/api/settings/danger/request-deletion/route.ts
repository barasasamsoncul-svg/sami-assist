import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Mark account for deletion (30-day grace period)
    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + 30);

    await queryControl(
      `UPDATE users SET status = 'deactivated', deleted_at = $1, updated_at = NOW() WHERE id = $2`,
      [deletionDate, session.user.id]
    );

    // Revoke all sessions
    await queryControl(
      `UPDATE sessions SET is_current = false, revoked_at = NOW() WHERE user_id = $1`,
      [session.user.id]
    );

    await queryControl(
      `INSERT INTO audit_logs (user_id, actor_type, action, resource_type, module, result, metadata)
       VALUES ($1, 'human', 'deletion_requested', 'user', 'settings', 'success', $2)`,
      [session.user.id, JSON.stringify({ deletionDate })]
    );

    const response = NextResponse.json({
      success: true,
      message: 'Account deletion requested. You have 30 days to cancel.',
    });

    response.cookies.delete('sami_session');

    return response;

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}