import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  clearSessionCookie,
  getSession,
  logout,
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
   RESPONSE
   ============================================================ */

function createSuccessResponse() {
  const response =
    NextResponse.json(
      {
        success: true,

        code:
          'LOGOUT_SUCCESS',

        message:
          'Logged out successfully.',
      },
      {
        status: 200,

        headers: {
          'Cache-Control':
            'no-store, no-cache, must-revalidate',

          Pragma:
            'no-cache',
        },
      }
    );

  /*
   * Remove temporary server-side authentication flow
   * cookies as part of sign-out.
   *
   * The actual SaMi session cookie is handled by logout()
   * / clearSessionCookie().
   */
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

async function recordLogoutEvent(
  request: NextRequest,
  session: Session,
  serverSessionRevoked: boolean
) {
  try {
    await recordAuthEvent({
      request,

      userId:
        session.user.id,

      eventType:
        'LOGOUT',

      entityType:
        'session',

      entityId:
        session.sessionId,

      metadata: {
        serverSessionRevoked,
      },
    });
  } catch (error) {
    /*
     * Audit logging must never prevent the user
     * from signing out.
     */
    console.error(
      '[Auth] Failed to record logout event:',
      error
    );
  }
}

/* ============================================================
   COOKIE FALLBACK
   ============================================================ */

async function ensureSessionCookieCleared() {
  try {
    await clearSessionCookie();
  } catch (error) {
    console.error(
      '[Auth] Failed to clear session cookie:',
      error
    );
  }
}

/* ============================================================
   POST /api/auth/logout
   ============================================================ */

export async function POST(
  request: NextRequest
) {
  /*
   * Logout is intentionally idempotent.
   *
   * Calling it when already logged out still returns success.
   */

  let session:
    Session | null =
    null;

  /* ==========================================================
     1. CAPTURE CURRENT SESSION
     ========================================================== */

  try {
    session =
      await getSession();
  } catch (error) {
    /*
     * Do not prevent logout merely because session
     * inspection failed.
     *
     * logout() below can still revoke the cookie's
     * database session directly.
     */
    console.error(
      '[Auth] Failed to read session during logout:',
      error
    );
  }

  /* ==========================================================
     2. REVOKE SERVER SESSION
     ========================================================== */

  let serverSessionRevoked =
    false;

  try {
    /*
     * logout() is authoritative.
     *
     * It:
     * - reads the HttpOnly SaMi session cookie
     * - hashes the raw token
     * - revokes the database session
     * - clears the browser session cookie
     */
    await logout();

    serverSessionRevoked =
      true;
  } catch (error) {
    console.error(
      '[Auth] Failed to revoke session during logout:',
      error
    );

    /*
     * Even if PostgreSQL/session revocation fails,
     * remove the browser's session cookie so the
     * local browser is signed out.
     */
    await ensureSessionCookieCleared();
  }

  /* ==========================================================
     3. AUDIT

     Record only when we successfully identified the
     authenticated session before logout.
     ========================================================== */

  if (session) {
    await recordLogoutEvent(
      request,
      session,
      serverSessionRevoked
    );
  }

  /* ==========================================================
     4. SUCCESS

     Logout remains idempotent:

     - authenticated user -> success
     - expired session -> success
     - already logged out -> success

     This prevents the frontend from getting stuck on logout.
     ========================================================== */

  return createSuccessResponse();
}