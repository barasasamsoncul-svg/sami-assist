import { NextRequest, NextResponse } from 'next/server';
import {
  requireSession,
  revokeSession,
  logout,
} from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: NextRequest,
  context: {
    params: Promise<{
      sessionId: string;
    }>;
  }
) {
  try {
    const currentSession =
      await requireSession();

    const { sessionId } =
      await context.params;

    if (!sessionId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Session ID is required.',
        },
        { status: 400 }
      );
    }

    if (sessionId === currentSession.sessionId) {
      await logout();

      return NextResponse.json(
        {
          success: true,
          message:
            'Current session revoked. You have been logged out.',
        },
        { status: 200 }
      );
    }

    await revokeSession(
      sessionId,
      currentSession.user.id
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Session revoked successfully.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      '[Auth] Failed to revoke session:',
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