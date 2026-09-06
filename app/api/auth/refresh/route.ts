import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getAccountContextForUser } from '@/lib/auth/account-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        {
          authenticated: false,
          user: null,
          tenant: null,
          subscription: null,
          role: null,
          modules: [],
        },
        { status: 401 }
      );
    }

    const accountContext =
      await getAccountContextForUser(
        session.user.id
      );

    return NextResponse.json(
      {
        authenticated: true,
        user: session.user,
        tenant: accountContext.tenant,
        subscription:
          accountContext.subscription,
        role: accountContext.role,
        modules: accountContext.modules,
        session: {
          id: session.sessionId,
          expiresAt:
            session.expiresAt.toISOString(),
          device: {
            ipAddress:
              session.device.ipAddress,
            deviceType:
              session.device.deviceType,
            browser:
              session.device.browser,
            operatingSystem:
              session.device.operatingSystem,
            lastActiveAt:
              session.device.lastActiveAt
                ? session.device.lastActiveAt.toISOString()
                : null,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      '[Auth] Refresh session failed:',
      error
    );

    return NextResponse.json(
      {
        authenticated: false,
        error:
          'Failed to refresh session.',
      },
      { status: 500 }
    );
  }
}