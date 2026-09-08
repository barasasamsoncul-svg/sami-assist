import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  clearSessionCookie,
  getSession,
  revokeAllSessions,
  type Session,
} from '@/lib/auth/session';

import {
  recordAuthEvent,
} from '@/lib/auth/auth-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   TEMPORARY AUTH COOKIES
   ============================================================ */

const TEMPORARY_AUTH_COOKIES = [
  'sami_google_oauth_state',
  'sami_google_oauth_intent',
  'sami_google_oauth_next',
  'sami_google_signup_state',
] as const;

/* ============================================================
   RESPONSE HELPERS
   ============================================================ */

function jsonResponse(
  body: Record<string, unknown>,
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

function clearTemporaryAuthCookies(
  response: NextResponse
) {
  for (
    const cookieName of
    TEMPORARY_AUTH_COOKIES
  ) {
    response.cookies.set(
      cookieName,
      '',
      {
        httpOnly: true,

        secure:
          process.env.NODE_ENV ===
          'production',

        sameSite:
          'lax',

        path: '/',

        maxAge: 0,

        expires:
          new Date(0),
      }
    );
  }

  return response;
}

/* ============================================================
   AUDIT
   ============================================================ */

async function recordLogoutAllEvent(
  request: NextRequest,
  session: Session
) {
  try {
    await recordAuthEvent({
      request,

      userId:
        session.user.id,

      eventType:
        'LOGOUT_ALL',

      entityType:
        'user',

      entityId:
        session.user.id,

      metadata: {
        initiatedFromSessionId:
          session.sessionId,
      },
    });
  } catch (error) {
    /*
     * Audit failure must not undo a successful
     * security action.
     */
    console.error(
      '[Auth] Failed to record logout-all event:',
      error
    );
  }
}

/* ============================================================
   FAILED REVOCATION AUDIT
   ============================================================ */

async function recordLogoutAllFailure(
  request: NextRequest,
  session: Session,
  error: unknown
) {
  try {
    await recordAuthEvent({
      request,

      userId:
        session.user.id,

      eventType:
        'LOGOUT_ALL_FAILED',

      entityType:
        'user',

      entityId:
        session.user.id,

      metadata: {
        initiatedFromSessionId:
          session.sessionId,

        reason:
          error instanceof Error
            ? error.message
            : 'Unknown logout-all error',
      },
    });
  } catch (auditError) {
    console.error(
      '[Auth] Failed to record logout-all failure:',
      auditError
    );
  }
}

/* ============================================================
   COOKIE FALLBACK
   ============================================================ */

async function safelyClearCurrentCookie() {
  try {
    await clearSessionCookie();
  } catch (error) {
    console.error(
      '[Auth] Failed to clear current session cookie:',
      error
    );
  }
}

/* ============================================================
   POST /api/auth/logout-all
   ============================================================ */

export async function POST(
  request: NextRequest
) {
  let session: Session | null =
    null;

  try {
    /* ========================================================
       1. REQUIRE AUTHENTICATED SESSION
       ======================================================== */

    session =
      await getSession();

    if (!session) {
      return jsonResponse(
        {
          success: false,

          code:
            'UNAUTHENTICATED',

          error:
            'Please sign in to continue.',
        },
        401
      );
    }

    /* ========================================================
       2. REVOKE EVERY SESSION
       ======================================================== */

    try {
      /*
       * revokeAllSessions():
       *
       * - revokes all database sessions for this user
       * - sets is_current = false
       * - sets revoked_at
       * - clears this browser's SaMi session cookie
       */
      await revokeAllSessions(
        session.user.id
      );
    } catch (error) {
      console.error(
        '[Auth] Failed to revoke all sessions:',
        error
      );

      /*
       * Even if server-wide revocation failed,
       * remove this browser's authentication
       * cookie where possible.
       */
      await safelyClearCurrentCookie();

      await recordLogoutAllFailure(
        request,
        session,
        error
      );

      return jsonResponse(
        {
          success: false,

          code:
            'LOGOUT_ALL_ERROR',

          error:
            'SaMi could not sign out all sessions. Please try again.',
        },
        500
      );
    }

    /* ========================================================
       3. AUDIT SUCCESS
       ======================================================== */

    await recordLogoutAllEvent(
      request,
      session
    );

    /* ========================================================
       4. RESPONSE
       ======================================================== */

    const response =
      jsonResponse({
        success: true,

        code:
          'LOGOUT_ALL_SUCCESS',

        message:
          'You have been signed out on all devices.',
      });

    /*
     * Also remove temporary authentication-flow
     * cookies that should not survive logout.
     */
    clearTemporaryAuthCookies(
      response
    );

    return response;
  } catch (error) {
    console.error(
      '[Auth] Logout all failed:',
      error
    );

    /*
     * If something unexpected happens after a
     * session was identified, at least remove
     * this browser's session cookie.
     */
    if (session) {
      await safelyClearCurrentCookie();
    }

    return jsonResponse(
      {
        success: false,

        code:
          'LOGOUT_ALL_ERROR',

        error:
          'SaMi could not complete the sign-out request.',
      },
      500
    );
  }
}