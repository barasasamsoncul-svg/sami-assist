import {
  NextResponse,
} from 'next/server';

import {
  getSession,
  listActiveSessions,
} from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
   GET /api/auth/sessions
   ============================================================ */

export async function GET() {
  try {
    /* ========================================================
       1. AUTHENTICATION
       ======================================================== */

    const session =
      await getSession();

    if (!session) {
      return jsonResponse(
        {
          success: false,

          code:
            'UNAUTHENTICATED',

          error:
            'Please sign in to continue.',

          currentSessionId:
            null,

          sessions:
            [],
        },
        401
      );
    }

    /* ========================================================
       2. ACTIVE SESSIONS

       listActiveSessions() remains authoritative for:
       - session IDs
       - device information
       - browser
       - operating system
       - IP address
       - last activity
       - expiration
       ======================================================== */

    const sessions =
      await listActiveSessions(
        session.user.id
      );

    /* ========================================================
       3. SUCCESS
       ======================================================== */

    return jsonResponse({
      success: true,

      code:
        'SESSIONS_LOADED',

      currentSessionId:
        session.sessionId,

      sessions,
    });
  } catch (error) {
    console.error(
      '[Auth] Failed to list sessions:',
      error
    );

    /*
     * Authentication was checked explicitly above.
     *
     * Anything reaching this catch is therefore an unexpected
     * server/database/session-listing failure and must not be
     * reported as "Unauthenticated".
     */
    return jsonResponse(
      {
        success: false,

        code:
          'SESSIONS_LOAD_ERROR',

        error:
          'Could not load your sessions.',
      },
      500
    );
  }
}