import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { sessionId } = await request.json();

    await queryControl(
      `UPDATE sessions SET is_current = false, revoked_at = NOW() WHERE id = $1 AND user_id = $2`,
      [sessionId, session.user.id]
    );

    return NextResponse.json({ success: true, message: 'Session revoked' });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}