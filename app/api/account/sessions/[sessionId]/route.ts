import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getSession,
  listActiveSessions,
  revokeSession,
} from '@/lib/auth/session';

import {
  recordAuthEvent,
} from '@/lib/auth/auth-events';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   TYPES
   ============================================================ */

type RouteContext = {
  params:
    Promise<{
      sessionId: string;
    }>;
};

/* ============================================================
   RESPONSE
   ============================================================ */

function json(
  body:
    Record<
      string,
      unknown
    >,

  status =
    200
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
   SESSION ID
   ============================================================ */

function normalizeSessionId(
  value:
    unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value.trim();
}

/* ============================================================
   DELETE
   /api/account/sessions/[sessionId]

   Revokes ONE session belonging to the signed-in user.

   Security rules:

   - session must belong to current user
   - session must still be active
   - current browser cannot use this endpoint to revoke itself
   - current browser uses /api/auth/logout instead
   - operation is idempotent from the user's perspective
   ============================================================ */

export async function DELETE(
  request:
    NextRequest,

  context:
    RouteContext
) {
  try {
    /* ========================================================
       AUTHENTICATED SESSION
       ======================================================== */

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
       TARGET SESSION
       ======================================================== */

    const params =
      await context.params;

    const targetSessionId =
      normalizeSessionId(
        params.sessionId
      );

    if (
      !targetSessionId
    ) {
      return json(
        {
          success:
            false,

          code:
            'INVALID_SESSION_ID',

          error:
            'The session identifier is invalid.',
        },
        400
      );
    }

    /* ========================================================
       CURRENT SESSION PROTECTION

       A user should never accidentally invalidate the browser
       making the request through the remote-device endpoint.

       Current browser logout belongs to:

         POST /api/auth/logout
       ======================================================== */

    if (
      targetSessionId ===
      currentSession
        .sessionId
    ) {
      return json(
        {
          success:
            false,

          code:
            'CURRENT_SESSION_REQUIRES_LOGOUT',

          error:
            'Use Sign out to end your current session.',
        },
        409
      );
    }

    /* ========================================================
       OWNERSHIP / ACTIVE STATE

       Never revoke a session merely because the caller knows
       its UUID.

       It must appear inside the signed-in user's active session
       list.
       ======================================================== */

    const activeSessions =
      await listActiveSessions(
        currentSession
          .user.id
      );

    const targetSession =
      activeSessions.find(
        (
          session
        ) =>
          session.sessionId ===
          targetSessionId
      );

    if (
      !targetSession
    ) {
      /*
       * This may mean:
       *
       * - already revoked
       * - expired
       * - does not belong to this user
       *
       * Do not leak which case occurred.
       */

      return json(
        {
          success:
            true,

          code:
            'SESSION_ALREADY_INACTIVE',

          message:
            'This session is already signed out.',

          sessionId:
            targetSessionId,
        }
      );
    }

    /* ========================================================
       REVOKE
       ======================================================== */

    await revokeSession(
      targetSessionId,

      currentSession
        .user.id
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
        'SESSION_REVOKED',

      metadata: {
        targetSessionId,

        deviceType:
          targetSession
            .deviceType,

        browser:
          targetSession
            .browser,

        operatingSystem:
          targetSession
            .operatingSystem,
      },
    });

    return json({
      success:
        true,

      code:
        'SESSION_REVOKED',

      message:
        'The session has been signed out.',

      sessionId:
        targetSessionId,
    });
  } catch (
    error
  ) {
    console.error(
      '[Sessions] Failed to revoke session:',
      error
    );

    return json(
      {
        success:
          false,

        code:
          'SESSION_REVOKE_FAILED',

        error:
          'SaMi could not sign out this session.',
      },
      500
    );
  }
}