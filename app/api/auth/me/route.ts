import {
  NextResponse,
} from 'next/server';

import {
  getSession,
} from '@/lib/auth/session';

import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';

import {
  queryControl,
} from '@/lib/db/control';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   TYPES
   ============================================================ */

type SessionDeviceRow = {
  ip_address:
    | string
    | null;

  device_type:
    | string
    | null;

  browser:
    | string
    | null;

  operating_system:
    | string
    | null;

  last_active_at:
    | Date
    | string
    | null;

  expires_at:
    | Date
    | string;
};

/* ============================================================
   RESPONSE HELPER
   ============================================================ */

function jsonResponse(
  body: Record<
    string,
    unknown
  >,
  status = 200
) {
  return NextResponse.json(
    body,
    {
      status,

      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',

        Pragma:
          'no-cache',
      },
    }
  );
}

/* ============================================================
   DATE
   ============================================================ */

function toIsoString(
  value:
    | Date
    | string
    | null
    | undefined
): string | null {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date.toISOString();
}

/* ============================================================
   CURRENT SESSION DEVICE
   ============================================================ */

async function getCurrentSessionDevice(
  sessionId: string,
  userId: string
): Promise<
  SessionDeviceRow | null
> {
  const result =
    await queryControl(
      `
        SELECT
          ip_address,
          device_type,
          browser,
          operating_system,
          last_active_at,
          expires_at

        FROM sessions

        WHERE id = $1
          AND user_id = $2
          AND is_current = TRUE
          AND revoked_at IS NULL
          AND expires_at > NOW()

        LIMIT 1
      `,
      [
        sessionId,
        userId,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}

/* ============================================================
   GET /api/auth/me
   ============================================================ */

export async function GET() {
  try {
    /* ========================================================
       1. SESSION
       ======================================================== */

    const session =
      await getSession();

    if (!session) {
      return jsonResponse(
        {
          success: false,

          authenticated:
            false,

          code:
            'UNAUTHENTICATED',

          user:
            null,

          tenant:
            null,

          owner:
            null,

          membership:
            null,

          subscription:
            null,

          role:
            null,

          modules:
            [],

          session:
            null,
        },
        401
      );
    }

    /* ========================================================
       2. ACCOUNT CONTEXT + SESSION DEVICE
       ======================================================== */

    const [
      accountContext,
      sessionDevice,
    ] =
      await Promise.all([
        getAccountContextForUser(
          session.user.id
        ),

        getCurrentSessionDevice(
          session.sessionId,
          session.user.id
        ),
      ]);

    /* ========================================================
       3. RESPONSE
       ======================================================== */

    return jsonResponse({
      success: true,

      authenticated:
        true,

      code:
        'AUTHENTICATED',

      user:
        session.user,

      tenant:
        accountContext.tenant,

      owner:
        accountContext.owner,

      membership:
        accountContext.membership,

      subscription:
        accountContext.subscription,

      role:
        accountContext.role,

      modules:
        accountContext.modules,

      session: {
        id:
          session.sessionId,

        expiresAt:
          session.expiresAt.toISOString(),

        device:
          sessionDevice
            ? {
                ipAddress:
                  sessionDevice.ip_address,

                deviceType:
                  sessionDevice.device_type ||
                  'unknown',

                browser:
                  sessionDevice.browser ||
                  'Unknown',

                operatingSystem:
                  sessionDevice.operating_system ||
                  'Unknown',

                lastActiveAt:
                  toIsoString(
                    sessionDevice.last_active_at
                  ),
              }
            : null,
      },
    });
  } catch (error) {
    console.error(
      '[Auth] Failed to load current user:',
      error
    );

    return jsonResponse(
      {
        success: false,

        authenticated:
          false,

        code:
          'CURRENT_USER_ERROR',

        error:
          'Could not load the current account.',
      },
      500
    );
  }
}