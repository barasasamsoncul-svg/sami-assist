import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get current session ID
    const currentSessionId = session.sessionId;

    // Revoke all sessions except current
    await queryControl(
      `UPDATE sessions SET is_current = false 
       WHERE user_id = $1 AND id != $2`,
      [session.user.id, currentSessionId]
    );

    // Log
    await queryControl(
      `INSERT INTO audit_logs (user_id, action, resource_type, details)
       VALUES ($1, 'all_sessions_revoked', 'session', $2)`,
      [session.user.id, JSON.stringify({ exceptCurrent: true })]
    );

    return NextResponse.json({ success: true, message: 'All other sessions signed out' });

  } catch (error) {
    console.error('Logout all error:', error);
    return NextResponse.json({ error: 'Failed to sign out all sessions' }, { status: 500 });
  }
}