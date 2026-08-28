import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await queryControl(
      `UPDATE sessions SET is_current = false, revoked_at = NOW() 
       WHERE user_id = $1 AND id != $2 AND revoked_at IS NULL`,
      [session.user.id, session.sessionId]
    );

    await queryControl(
      `INSERT INTO audit_logs (user_id, actor_type, action, resource_type, module, result)
       VALUES ($1, 'human', 'logout_all', 'session', 'auth', 'success')`,
      [session.user.id]
    );

    return NextResponse.json({ success: true, message: 'All other sessions signed out' });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}