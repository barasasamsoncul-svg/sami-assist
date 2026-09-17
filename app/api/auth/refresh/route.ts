import {
  NextResponse,
} from 'next/server';

import {
  getSession,
} from '@/lib/auth/session';

import {
  getAccountContextForUser,
  listAccessibleWorkspaces,
} from '@/lib/auth/account-context';

import {
  queryControl,
} from '@/lib/db/control';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


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
  body:
    Record<
      string,
      unknown
    >,

  status =
    200,
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
    },
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
    | undefined,
): string | null {
  if (
    !value
  ) {
    return null;
  }


  const date =
    value instanceof
      Date
      ? value
      : new Date(
          value,
        );


  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null;
  }


  return date.toISOString();
}


/* ============================================================
   SESSION DEVICE
   ============================================================ */

async function getCurrentSessionDevice(
  sessionId:
    string,

  userId:
    string,
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

          AND is_current =
              TRUE

          AND revoked_at
              IS NULL

          AND expires_at >
              NOW()

        LIMIT 1
      `,
      [
        sessionId,
        userId,
      ],
    );


  return (
    result.rows[0] ||
    null
  );
}


/* ============================================================
   GET
   ============================================================ */

export async function GET() {
  try {
    const session =
      await getSession();


    if (
      !session
    ) {
      return jsonResponse(
        {
          success:
            false,

          authenticated:
            false,

          code:
            'UNAUTHENTICATED',

          user:
            null,

          tenant:
            null,

          currentWorkspaceId:
            null,

          workspaces:
            [],

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

        401,
      );
    }


    const [
      accountContext,
      workspaces,
      sessionDevice,
    ] =
      await Promise.all([
        getAccountContextForUser(
          session.user.id,
          session.currentTenantId,
        ),

        listAccessibleWorkspaces(
          session.user.id,
        ),

        getCurrentSessionDevice(
          session.sessionId,
          session.user.id,
        ),
      ]);


    const currentWorkspaceId =
      accountContext.tenant?.id ||
      session.currentTenantId ||
      null;


    return jsonResponse({
      success:
        true,

      authenticated:
        true,

      code:
        'SESSION_REFRESHED',

      user:
        session.user,

      currentWorkspaceId,

      workspaces,

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

        currentWorkspaceId,

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
                    sessionDevice.last_active_at,
                  ),
              }
            : null,
      },
    });
  } catch (
    error
  ) {
    console.error(
      '[Auth] Refresh session failed:',
      error,
    );


    return jsonResponse(
      {
        success:
          false,

        authenticated:
          false,

        code:
          'SESSION_REFRESH_ERROR',

        error:
          'Could not refresh the current session.',
      },

      500,
    );
  }
}