import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (session) {
      await queryControl(
        `UPDATE sessions SET is_current = false, revoked_at = NOW() WHERE id = $1`,
        [session.sessionId]
      );

      await queryControl(
        `INSERT INTO audit_logs (user_id, actor_type, action, resource_type, module, result)
         VALUES ($1, 'human', 'logout', 'session', 'auth', 'success')`,
        [session.user.id]
      );
    }

    const response = NextResponse.json({ success: true, message: 'Logged out' });
    response.cookies.delete('sami_session');
    response.cookies.delete('sami_tenant_id');

    return response;

  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
}