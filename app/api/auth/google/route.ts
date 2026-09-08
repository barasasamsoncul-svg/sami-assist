import {
  NextRequest,
  NextResponse,
} from 'next/server';

import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   CONSTANTS
   ============================================================ */

const GOOGLE_AUTH_URL =
  'https://accounts.google.com/o/oauth2/v2/auth';

const GOOGLE_CALLBACK_PATH =
  '/api/auth/google/callback';

const GOOGLE_STATE_COOKIE =
  'sami_google_oauth_state';

const GOOGLE_INTENT_COOKIE =
  'sami_google_oauth_intent';

const GOOGLE_NEXT_COOKIE =
  'sami_google_oauth_next';

const OAUTH_COOKIE_MAX_AGE =
  10 * 60;

/* ============================================================
   TYPES
   ============================================================ */

type GoogleIntent =
  | 'login'
  | 'register';

/* ============================================================
   URL HELPERS
   ============================================================ */

function normalizeBaseUrl(
  value: string
) {
  return value
    .trim()
    .replace(/\/+$/, '');
}

function getCanonicalBaseUrl(
  request: NextRequest
): string {
  /*
   * Prefer an explicitly configured SaMi URL.
   *
   * Production example:
   *
   * APP_URL=https://sami.example.com
   */
  const configured =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (configured) {
    try {
      const url =
        new URL(configured);

      if (
        url.protocol ===
          'https:' ||
        url.protocol ===
          'http:'
      ) {
        return normalizeBaseUrl(
          url.origin
        );
      }
    } catch {
      console.error(
        '[Auth][Google] APP_URL/NEXT_PUBLIC_APP_URL is invalid.'
      );
    }
  }

  return normalizeBaseUrl(
    request.nextUrl.origin
  );
}

function getGoogleRedirectUri(
  request: NextRequest
): string {
  /*
   * GOOGLE_REDIRECT_URI wins when configured.
   *
   * This must exactly match the URI registered
   * in Google Cloud Console.
   */
  const configured =
    process.env.GOOGLE_REDIRECT_URI?.trim();

  if (configured) {
    try {
      const url =
        new URL(configured);

      if (
        url.protocol ===
          'https:' ||
        url.protocol ===
          'http:'
      ) {
        return url.toString();
      }
    } catch {
      console.error(
        '[Auth][Google] GOOGLE_REDIRECT_URI is invalid.'
      );
    }
  }

  return (
    getCanonicalBaseUrl(
      request
    ) +
    GOOGLE_CALLBACK_PATH
  );
}

/* ============================================================
   FLOW / INTENT
   ============================================================ */

/**
 * Both Login and Register currently call:
 *
 *   /api/auth/google
 *
 * without a required intent query.
 *
 * Therefore this route remains backwards compatible:
 *
 * 1. ?intent=login/register if supplied
 * 2. otherwise infer from same-origin Referer
 * 3. default to login
 */
function getGoogleIntent(
  request: NextRequest
): GoogleIntent {
  const requested =
    request.nextUrl.searchParams.get(
      'intent'
    );

  if (
    requested === 'register'
  ) {
    return 'register';
  }

  if (
    requested === 'login'
  ) {
    return 'login';
  }

  const referer =
    request.headers.get(
      'referer'
    );

  if (referer) {
    try {
      const refererUrl =
        new URL(referer);

      /*
       * Never trust a cross-origin referer
       * for authentication flow state.
       */
      if (
        refererUrl.origin ===
        request.nextUrl.origin
      ) {
        if (
          refererUrl.pathname ===
            '/register' ||
          refererUrl.pathname.startsWith(
            '/register/'
          )
        ) {
          return 'register';
        }
      }
    } catch {
      // Fall through to login.
    }
  }

  return 'login';
}

/* ============================================================
   SAFE NEXT ROUTE
   ============================================================ */

function isSafeNextPath(
  value: string
): boolean {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return false;
  }

  if (
    value.startsWith(
      '/api/'
    )
  ) {
    return false;
  }

  /*
   * Do not send a successfully authenticated
   * user back into another auth/onboarding page.
   */
  const blocked =
    [
      '/login',
      '/register',
      '/forgot-password',
      '/reset-password',
      '/verify-email',
      '/select-apps',
      '/select-plan',
      '/google-complete',
    ];

  return !blocked.some(
    (route) =>
      value === route ||
      value.startsWith(
        `${route}?`
      ) ||
      value.startsWith(
        `${route}/`
      )
  );
}

function getRequestedNext(
  request: NextRequest,
  intent: GoogleIntent
): string | null {
  if (
    intent !== 'login'
  ) {
    return null;
  }

  /*
   * First support:
   *
   * /api/auth/google?next=/settings
   */
  const queryNext =
    request.nextUrl.searchParams.get(
      'next'
    );

  if (
    queryNext &&
    isSafeNextPath(
      queryNext
    )
  ) {
    return queryNext;
  }

  /*
   * Current login UI may simply navigate to
   * /api/auth/google.
   *
   * Preserve ?next= from its same-origin
   * referring login URL when available.
   */
  const referer =
    request.headers.get(
      'referer'
    );

  if (!referer) {
    return null;
  }

  try {
    const url =
      new URL(referer);

    if (
      url.origin !==
      request.nextUrl.origin
    ) {
      return null;
    }

    const next =
      url.searchParams.get(
        'next'
      );

    if (
      next &&
      isSafeNextPath(
        next
      )
    ) {
      return next;
    }
  } catch {
    return null;
  }

  return null;
}

/* ============================================================
   ERROR REDIRECTION
   ============================================================ */

function getFailureRoute(
  intent: GoogleIntent,
  code: string
) {
  const pathname =
    intent === 'register'
      ? '/register'
      : '/login';

  const params =
    new URLSearchParams({
      google_error:
        code,
    });

  return `${pathname}?${params.toString()}`;
}

function redirectToGoogleError(
  request: NextRequest,
  intent: GoogleIntent,
  code: string
) {
  return NextResponse.redirect(
    new URL(
      getFailureRoute(
        intent,
        code
      ),
      request.nextUrl.origin
    )
  );
}

/* ============================================================
   COOKIE OPTIONS
   ============================================================ */

function oauthCookieOptions() {
  return {
    httpOnly: true,

    secure:
      process.env.NODE_ENV ===
      'production',

    sameSite:
      'lax' as const,

    path: '/',

    maxAge:
      OAUTH_COOKIE_MAX_AGE,
  };
}

/* ============================================================
   GOOGLE AUTH URL
   ============================================================ */

function buildGoogleAuthUrl({
  clientId,
  redirectUri,
  state,
}: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const params =
    new URLSearchParams({
      client_id:
        clientId,

      redirect_uri:
        redirectUri,

      response_type:
        'code',

      scope:
        'openid email profile',

      state,

      /*
       * We do not need offline access because
       * SaMi is authenticating the user, not
       * requesting a long-lived Google API
       * refresh token.
       */
      access_type:
        'online',

      /*
       * Give the user explicit control when
       * multiple Google accounts are signed in.
       */
      prompt:
        'select_account',
    });

  return (
    `${GOOGLE_AUTH_URL}?` +
    params.toString()
  );
}

/* ============================================================
   GET /api/auth/google
   ============================================================ */

export async function GET(
  request: NextRequest
) {
  const intent =
    getGoogleIntent(
      request
    );

  try {
    /* ========================================================
       CONFIGURATION
       ======================================================== */

    const clientId =
      process.env
        .GOOGLE_CLIENT_ID
        ?.trim();

    if (!clientId) {
      console.error(
        '[Auth][Google] GOOGLE_CLIENT_ID is not configured.'
      );

      return redirectToGoogleError(
        request,
        intent,
        'google_config'
      );
    }

    const redirectUri =
      getGoogleRedirectUri(
        request
      );

    /* ========================================================
       CSRF STATE
       ======================================================== */

    const state =
      crypto
        .randomBytes(32)
        .toString(
          'base64url'
        );

    const next =
      getRequestedNext(
        request,
        intent
      );

    /* ========================================================
       GOOGLE REDIRECT
       ======================================================== */

    const googleUrl =
      buildGoogleAuthUrl({
        clientId,
        redirectUri,
        state,
      });

    const response =
      NextResponse.redirect(
        googleUrl
      );

    /* ========================================================
       STATE COOKIE
       ======================================================== */

    response.cookies.set(
      GOOGLE_STATE_COOKIE,
      state,
      oauthCookieOptions()
    );

    /* ========================================================
       LOGIN / REGISTER INTENT
       ======================================================== */

    response.cookies.set(
      GOOGLE_INTENT_COOKIE,
      intent,
      oauthCookieOptions()
    );

    /* ========================================================
       ORIGINAL DESTINATION
       ======================================================== */

    if (next) {
      response.cookies.set(
        GOOGLE_NEXT_COOKIE,
        next,
        oauthCookieOptions()
      );
    } else {
      /*
       * Remove stale data from an older OAuth
       * attempt.
       */
      response.cookies.set(
        GOOGLE_NEXT_COOKIE,
        '',
        {
          ...oauthCookieOptions(),
          maxAge: 0,
        }
      );
    }

    /* ========================================================
       RESPONSE SECURITY
       ======================================================== */

    response.headers.set(
      'Cache-Control',
      'no-store, no-cache, must-revalidate'
    );

    response.headers.set(
      'Pragma',
      'no-cache'
    );

    return response;
  } catch (error) {
    console.error(
      '[Auth][Google] Unable to start OAuth:',
      error
    );

    return redirectToGoogleError(
      request,
      intent,
      'google_start_failed'
    );
  }
}