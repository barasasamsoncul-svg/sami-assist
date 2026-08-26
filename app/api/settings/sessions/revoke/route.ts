import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    // Verify session belongs to user
    const result = await queryControl(
      `SELECT id FROM sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, session.user.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Revoke session (set is_current to false)
    await queryControl(
      `UPDATE sessions SET is_current = false WHERE id = $1 AND user_id = $2`,
      [sessionId, session.user.id]
    );

    // Log
    await queryControl(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
       VALUES ($1, 'session_revoked', 'session', $2, $3)`,
      [session.user.id, sessionId, JSON.stringify({ revoked: true })]
    );

    return NextResponse.json({ success: true, message: 'Session revoked' });

  } catch (error) {
    console.error('Revoke session error:', error);
    return NextResponse.json({ error: 'Failed to revoke session' }, { status: 500 });
  }
}