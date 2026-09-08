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
   RESPONSE
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
   GET /api/auth/refresh
   ============================================================ */

export async function GET() {
  try {
    /* ========================================================
       1. CURRENT SESSION

       getSession() remains authoritative for authentication
       and also performs the normal SaMi session-activity
       refresh logic.
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
       2. REFRESH AUTHENTICATED CONTEXT
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

       IMPORTANT BILLING RULE:

       accountContext.subscription is authoritative.

       Therefore, during the first free month this endpoint
       should naturally return:

         status = trialing

       It must NOT:
       - charge the customer
       - activate the subscription
       - alter trial dates
       - calculate a new billing period

       Billing state is controlled by the subscription /
       PesaPal backend.
       ======================================================== */

    return jsonResponse({
      success: true,

      authenticated:
        true,

      code:
        'SESSION_REFRESHED',

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
                  sessionDevice
                    .ip_address,

                deviceType:
                  sessionDevice
                    .device_type ||
                  'unknown',

                browser:
                  sessionDevice
                    .browser ||
                  'Unknown',

                operatingSystem:
                  sessionDevice
                    .operating_system ||
                  'Unknown',

                lastActiveAt:
                  toIsoString(
                    sessionDevice
                      .last_active_at
                  ),
              }
            : null,
      },
    });
  } catch (error) {
    console.error(
      '[Auth] Refresh session failed:',
      error
    );

    return jsonResponse(
      {
        success: false,

        authenticated:
          false,

        code:
          'SESSION_REFRESH_ERROR',

        error:
          'Could not refresh the current session.',
      },
      500
    );
  }
}