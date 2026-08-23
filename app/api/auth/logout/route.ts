import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (session) {
      // Invalidate session
      await queryControl(
        `UPDATE sessions SET is_current = false WHERE id = $1`,
        [session.sessionId]
      );
    }

    // Clear cookie
    const response = NextResponse.json({ success: true });
    response.cookies.delete('sami_session');
    response.cookies.delete('sami_business_id');

    return response;

  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    );
  }
}