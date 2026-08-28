import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const result = await queryControl(
      `SELECT id, device_type, browser, operating_system, ip_address, location, is_current, last_active_at, created_at
       FROM sessions WHERE user_id = $1 AND is_current = true ORDER BY last_active_at DESC`,
      [session.user.id]
    );

    return NextResponse.json({ success: true, sessions: result.rows });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}