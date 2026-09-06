import { NextRequest, NextResponse } from 'next/server';
import {
  getSession,
  logout,
  getSessionRequestMetadata,
} from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function recordLogoutEvent(
  request: Request,
  userId: string,
  tenantId: string | null,
  sessionId: string
): Promise<void> {
  try {
    const metadata =
      getSessionRequestMetadata(request);

    await queryControl(
      `
        INSERT INTO audit_logs (
          tenant_id,
          user_id,
          event_type,
          entity_type,
          entity_id,
          ip_address,
          user_agent,
          metadata,
          created_at
        )
        VALUES (
          $1,
          $2,
          'LOGOUT',
          'auth',
          $4,
          $5,
          $6,
          $7,
          NOW()
        )
      `,
      [
        tenantId,
        userId,
        'LOGOUT',
        sessionId,
        metadata.ipAddress,
        metadata.userAgent,
        JSON.stringify({
          browser: metadata.browser,
          operatingSystem:
            metadata.operatingSystem,
          deviceType:
            metadata.deviceType,
        }),
      ]
    );
  } catch (error) {
    console.error(
      '[Auth] Failed to record logout event:',
      error
    );
  }
}

async function getTenantIdForUser(
  userId: string
): Promise<string | null> {
  try {
    const result = await queryControl(
      `
        SELECT tenant_id
        FROM tenant_users
        WHERE user_id = $1
          AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [userId]
    );

    return result.rows[0]?.tenant_id || null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (session) {
      const tenantId =
        await getTenantIdForUser(
          session.user.id
        );

      await recordLogoutEvent(
        request,
        session.user.id,
        tenantId,
        session.sessionId
      );
    }

    await logout();

    return NextResponse.json(
      {
        success: true,
        message: 'Logged out successfully.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Auth] Logout failed:', error);

    await logout();

    return NextResponse.json(
      {
        success: true,
        message: 'Logged out.',
      },
      { status: 200 }
    );
  }
}