import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const result = await queryControl(
      `SELECT id, device, browser, os, ip, location, last_active, is_current, created_at
       FROM sessions 
       WHERE user_id = $1 AND is_current = true
       ORDER BY last_active DESC`,
      [session.user.id]
    );

    return NextResponse.json({
      success: true,
      sessions: result.rows,
      currentSessionId: session.sessionId,
    });

  } catch (error) {
    console.error('Get sessions error:', error);
    return NextResponse.json({ error: 'Failed to load sessions' }, { status: 500 });
  }
}