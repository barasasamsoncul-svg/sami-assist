import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getSession,
  revokeSession,
  logout,
} from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   CONSTANTS
   ============================================================ */

const MAX_SESSION_ID_LENGTH = 128;

/* ============================================================
   RESPONSE
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

/* ============================================================
   DELETE /api/auth/sessions/[sessionId]
   ============================================================ */

export async function DELETE(
  _request: NextRequest,

  context: {
    params: Promise<{
      sessionId: string;
    }>;
  }
) {
  try {
    /* ========================================================
       1. AUTHENTICATION
       ======================================================== */

    const currentSession =
      await getSession();

    if (!currentSession) {
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
       2. SESSION ID
       ======================================================== */

    const params =
      await context.params;

    const sessionId =
      typeof params.sessionId ===
      'string'
        ? params.sessionId.trim()
        : '';

    if (
      !sessionId ||
      sessionId.length >
        MAX_SESSION_ID_LENGTH
    ) {
      return jsonResponse(
        {
          success: false,

          code:
            'INVALID_SESSION_ID',

          error:
            'A valid session ID is required.',
        },
        400
      );
    }

    /* ========================================================
       3. CURRENT SESSION

       Revoking the current browser session is equivalent to
       signing out this browser.

       logout():

       - reads the current HttpOnly SaMi cookie
       - hashes the token
       - revokes the database session
       - clears the cookie
       ======================================================== */

    if (
      sessionId ===
      currentSession.sessionId
    ) {
      await logout();

      return jsonResponse({
        success: true,

        code:
          'CURRENT_SESSION_REVOKED',

        message:
          'This session has been revoked. You have been signed out.',

        sessionId,

        currentSessionRevoked:
          true,

        loggedOut:
          true,
      });
    }

    /* ========================================================
       4. ANOTHER SESSION

       revokeSession() includes BOTH:

       session ID
       +
       authenticated user ID

       so a user cannot revoke a session belonging to another
       SaMi account.

       The operation is intentionally idempotent. If the
       session was already revoked, expired, or does not belong
       to this user, no session is changed and no information
       about another user's session is exposed.
       ======================================================== */

    await revokeSession(
      sessionId,
      currentSession.user.id
    );

    return jsonResponse({
      success: true,

      code:
        'SESSION_REVOKED',

      message:
        'Session revoked successfully.',

      sessionId,

      currentSessionRevoked:
        false,

      loggedOut:
        false,
    });
  } catch (error) {
    console.error(
      '[Auth] Failed to revoke session:',
      error
    );

    /*
     * Authentication is handled explicitly above.
     *
     * Therefore a failure reaching this catch is an unexpected
     * database/session operation failure, not automatically an
     * authentication failure.
     */
    return jsonResponse(
      {
        success: false,

        code:
          'SESSION_REVOKE_ERROR',

        error:
          'Could not revoke the session. Please try again.',
      },
      500
    );
  }
}