import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        {
          authenticated: false,
          user: null,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        authenticated: true,
        user: {
          id: session.user.id,
          email: session.user.email,
          firstName: session.user.firstName,
          lastName: session.user.lastName,
          fullName: session.user.fullName,
          avatarFileId: session.user.avatarFileId,
        },
        session: {
          id: session.sessionId,
          expiresAt: session.expiresAt.toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[SaMi] Get me error:', error);

    return NextResponse.json(
      {
        authenticated: false,
        error: 'Failed to get user information.',
      },
      { status: 500 }
    );
  }
}