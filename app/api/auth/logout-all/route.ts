import { NextResponse } from 'next/server';
import {
  requireSession,
  revokeAllSessions,
} from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await requireSession();

    await revokeAllSessions(session.user.id);

    return NextResponse.json(
      {
        success: true,
        message:
          'All sessions have been revoked.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      '[Auth] Logout all failed:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: 'Unauthenticated.',
      },
      { status: 401 }
    );
  }
}