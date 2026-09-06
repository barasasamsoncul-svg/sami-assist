import { NextResponse } from 'next/server';
import {
  requireSession,
  listActiveSessions,
} from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireSession();

    const sessions =
      await listActiveSessions(
        session.user.id
      );

    return NextResponse.json(
      {
        success: true,
        currentSessionId:
          session.sessionId,
        sessions,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      '[Auth] Failed to list sessions:',
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