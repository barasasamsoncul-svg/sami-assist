import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getSession,
  listActiveSessions,
  revokeAllOtherSessions,
} from '@/lib/auth/session';

import {
  recordAuthEvent,
} from '@/lib/auth/auth-events';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   RESPONSE
   ============================================================ */

function json(
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
      : new Date(
          value
        );

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
   GET
   /api/account/sessions

   Returns all ACTIVE sessions belonging to the signed-in user.

   IMPORTANT:

   We do NOT trust sessions.is_current to identify this browser.

   Why?

   In the current SaMi schema/helper that column also acts as an
   active-session flag.

   The authenticated cookie-backed session returned by
   getSession() is authoritative for "this device".
   ============================================================ */

export async function GET() {
  try {
    const currentSession =
      await getSession();

    if (
      !currentSession
    ) {
      return json(
        {
          success:
            false,

          code:
            'UNAUTHENTICATED',

          error:
            'You must sign in to view your sessions.',
        },
        401
      );
    }

    const activeSessions =
      await listActiveSessions(
        currentSession
          .user.id
      );

    const sessions =
      activeSessions.map(
        (
          session
        ) => {
          return {
            sessionId:
              session.sessionId,

            ipAddress:
              session.ipAddress,

            userAgent:
              session.userAgent,

            deviceType:
              session.deviceType,

            browser:
              session.browser,

            operatingSystem:
              session.operatingSystem,

            /*
             * Browser-current identity comes from the authenticated
             * session ID, not the sessions.is_current column.
             */
            isCurrent:
              session.sessionId ===
              currentSession.sessionId,

            lastActiveAt:
              toIsoString(
                session.lastActiveAt
              ),

            expiresAt:
              toIsoString(
                session.expiresAt
              ),

            createdAt:
              toIsoString(
                session.createdAt
              ),
          };
        }
      )
      .sort(
        (
          left,
          right
        ) => {
          /*
           * Always display the current device first.
           */

          if (
            left.isCurrent &&
            !right.isCurrent
          ) {
            return -1;
          }

          if (
            right.isCurrent &&
            !left.isCurrent
          ) {
            return 1;
          }

          const leftTime =
            left.lastActiveAt
              ? new Date(
                  left.lastActiveAt
                ).getTime()
              : 0;

          const rightTime =
            right.lastActiveAt
              ? new Date(
                  right.lastActiveAt
                ).getTime()
              : 0;

          return (
            rightTime -
            leftTime
          );
        }
      );

    return json({
      success:
        true,

      code:
        'ACTIVE_SESSIONS_LOADED',

      currentSessionId:
        currentSession.sessionId,

      total:
        sessions.length,

      sessions,
    });
  } catch (
    error
  ) {
    console.error(
      '[Sessions] Failed to load active sessions:',
      error
    );

    return json(
      {
        success:
          false,

        code:
          'ACTIVE_SESSIONS_LOAD_FAILED',

        error:
          'SaMi could not load your active sessions.',
      },
      500
    );
  }
}

/* ============================================================
   DELETE
   /api/account/sessions

   Revokes every active session except the browser currently
   making this request.

   This powers:

       Sign out all other devices

   The current browser remains authenticated.
   ============================================================ */

export async function DELETE(
  request:
    NextRequest
) {
  try {
    const currentSession =
      await getSession();

    if (
      !currentSession
    ) {
      return json(
        {
          success:
            false,

          code:
            'UNAUTHENTICATED',

          error:
            'You must sign in to manage your sessions.',
        },
        401
      );
    }

    /* ========================================================
       DETERMINE COUNT BEFORE REVOCATION
       ======================================================== */

    const activeSessions =
      await listActiveSessions(
        currentSession
          .user.id
      );

    const otherSessions =
      activeSessions.filter(
        (
          session
        ) =>
          session.sessionId !==
          currentSession.sessionId
      );

    /* ========================================================
       REVOKE ALL OTHERS
       ======================================================== */

    await revokeAllOtherSessions(
      currentSession
        .user.id,

      currentSession
        .sessionId
    );

    /* ========================================================
       AUDIT
       ======================================================== */

    await recordAuthEvent({
      request,

      userId:
        currentSession
          .user.id,

      eventType:
        'OTHER_SESSIONS_REVOKED',

      metadata: {
        currentSessionId:
          currentSession
            .sessionId,

        revokedCount:
          otherSessions.length,
      },
    });

    return json({
      success:
        true,

      code:
        'OTHER_SESSIONS_REVOKED',

      message:
        otherSessions.length ===
        1
          ? '1 other session has been signed out.'
          : `${otherSessions.length} other sessions have been signed out.`,

      revokedCount:
        otherSessions.length,
    });
  } catch (
    error
  ) {
    console.error(
      '[Sessions] Failed to revoke other sessions:',
      error
    );

    return json(
      {
        success:
          false,

        code:
          'OTHER_SESSIONS_REVOKE_FAILED',

        error:
          'SaMi could not sign out your other sessions.',
      },
      500
    );
  }
}