import {
  NextRequest,
  NextResponse,
} from 'next/server';

import crypto from 'crypto';

import { queryControl } from '@/lib/db/control';
import { createSession } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   GOOGLE
   ============================================================ */

const GOOGLE_TOKEN_URL =
  'https://oauth2.googleapis.com/token';

const GOOGLE_USERINFO_URL =
  'https://www.googleapis.com/oauth2/v3/userinfo';

const GOOGLE_CALLBACK_PATH =
  '/api/auth/google/callback';

/* ============================================================
   OAUTH COOKIES

   Must match /api/auth/google
   ============================================================ */

const GOOGLE_STATE_COOKIE =
  'sami_google_oauth_state';

const GOOGLE_INTENT_COOKIE =
  'sami_google_oauth_intent';

const GOOGLE_NEXT_COOKIE =
  'sami_google_oauth_next';

/*
 * This one belongs to the registration flow after Google
 * authentication has succeeded.
 */
const GOOGLE_SIGNUP_STATE_COOKIE =
  'sami_google_signup_state';

/* ============================================================
   LIMITS
   ============================================================ */

const GOOGLE_STATE_TTL_MINUTES =
  10;

const GOOGLE_STATE_TTL_SECONDS =
  GOOGLE_STATE_TTL_MINUTES * 60;

const MAX_EMAIL_LENGTH =
  254;

const MAX_NAME_LENGTH =
  100;

const MAX_AVATAR_URL_LENGTH =
  1000;

/* ============================================================
   TYPES
   ============================================================ */

type GoogleIntent =
  | 'login'
  | 'register';

type GoogleTokenResponse = {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;

  error?: string;
  error_description?: string;
};

type GoogleUser = {
  sub?: string;

  email?: string;

  email_verified?: boolean;

  given_name?: string;

  family_name?: string;

  name?: string;

  picture?: string;
};

type ExistingUser = {
  id: string;

  email: string;

  status: string | null;

  email_verified_at:
    | Date
    | string
    | null;

  deleted_at:
    | Date
    | string
    | null;

  two_factor_enabled:
    | boolean
    | null;
};

/* ============================================================
   BASIC HELPERS
   ============================================================ */

function normalizeEmail(
  value: string
) {
  return value
    .trim()
    .toLowerCase();
}

function isValidEmail(
  value: string
) {
  return (
    value.length > 0 &&
    value.length <=
      MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      value
    )
  );
}

function cleanName(
  value?: string
) {
  return (
    value ||
    ''
  )
    .trim()
    .slice(
      0,
      MAX_NAME_LENGTH
    );
}

function cleanAvatarUrl(
  value?: string
) {
  const clean =
    (value || '')
      .trim()
      .slice(
        0,
        MAX_AVATAR_URL_LENGTH
      );

  if (!clean) {
    return '';
  }

  try {
    const url =
      new URL(clean);

    if (
      url.protocol !==
        'https:' &&
      url.protocol !==
        'http:'
    ) {
      return '';
    }

    return url.toString();
  } catch {
    return '';
  }
}

/* ============================================================
   CONSTANT-TIME STATE COMPARISON
   ============================================================ */

function secureEqual(
  first: string,
  second: string
) {
  const firstBuffer =
    Buffer.from(
      first,
      'utf8'
    );

  const secondBuffer =
    Buffer.from(
      second,
      'utf8'
    );

  if (
    firstBuffer.length !==
    secondBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    firstBuffer,
    secondBuffer
  );
}

/* ============================================================
   BASE URL
   ============================================================ */

function normalizeBaseUrl(
  value: string
) {
  return value
    .trim()
    .replace(/\/+$/, '');
}

function getAppBaseUrl(
  request: NextRequest
) {
  const configured =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (configured) {
    try {
      const url =
        new URL(
          configured
        );

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
) {
  const configured =
    process.env
      .GOOGLE_REDIRECT_URI
      ?.trim();

  if (configured) {
    try {
      const url =
        new URL(
          configured
        );

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
    getAppBaseUrl(
      request
    ) +
    GOOGLE_CALLBACK_PATH
  );
}

/* ============================================================
   OAUTH INTENT
   ============================================================ */

function getOAuthIntent(
  request: NextRequest
): GoogleIntent {
  const value =
    request.cookies.get(
      GOOGLE_INTENT_COOKIE
    )?.value;

  return value ===
    'register'
    ? 'register'
    : 'login';
}

/* ============================================================
   NEXT PATH
   ============================================================ */

function safeNextPath(
  value?: string | null
) {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return '/dashboard';
  }

  if (
    value.startsWith(
      '/api/'
    )
  ) {
    return '/dashboard';
  }

  const blockedRoutes =
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

  if (
    blockedRoutes.some(
      (route) =>
        value === route ||
        value.startsWith(
          `${route}?`
        ) ||
        value.startsWith(
          `${route}/`
        )
    )
  ) {
    return '/dashboard';
  }

  return value;
}

/* ============================================================
   COOKIE HELPERS
   ============================================================ */

function cookieSecurity() {
  return {
    secure:
      process.env.NODE_ENV ===
      'production',

    sameSite:
      'lax' as const,

    path: '/',
  };
}

function clearOAuthCookies(
  response: NextResponse
) {
  const options = {
    ...cookieSecurity(),

    httpOnly: true,

    maxAge: 0,
  };

  response.cookies.set(
    GOOGLE_STATE_COOKIE,
    '',
    options
  );

  response.cookies.set(
    GOOGLE_INTENT_COOKIE,
    '',
    options
  );

  response.cookies.set(
    GOOGLE_NEXT_COOKIE,
    '',
    options
  );

  return response;
}

function clearSignupCookie(
  response: NextResponse
) {
  response.cookies.set(
    GOOGLE_SIGNUP_STATE_COOKIE,
    '',
    {
      ...cookieSecurity(),

      httpOnly: true,

      maxAge: 0,
    }
  );

  return response;
}

function noStore(
  response: NextResponse
) {
  response.headers.set(
    'Cache-Control',
    'no-store, no-cache, must-revalidate'
  );

  response.headers.set(
    'Pragma',
    'no-cache'
  );

  return response;
}

/* ============================================================
   REDIRECT HELPERS
   ============================================================ */

function redirectWithError(
  request: NextRequest,
  intent: GoogleIntent,
  errorCode: string
) {
  const pathname =
    intent === 'register'
      ? '/register'
      : '/login';

  const url =
    new URL(
      pathname,
      getAppBaseUrl(
        request
      )
    );

  url.searchParams.set(
    'google_error',
    errorCode
  );

  const response =
    NextResponse.redirect(
      url
    );

  clearOAuthCookies(
    response
  );

  return noStore(
    response
  );
}

function redirectToLogin(
  request: NextRequest,
  code?: string
) {
  const url =
    new URL(
      '/login',
      getAppBaseUrl(
        request
      )
    );

  if (code) {
    url.searchParams.set(
      'google_error',
      code
    );
  }

  const response =
    NextResponse.redirect(
      url
    );

  clearOAuthCookies(
    response
  );

  return noStore(
    response
  );
}

function redirectToRegister(
  request: NextRequest,
  code?: string
) {
  const url =
    new URL(
      '/register',
      getAppBaseUrl(
        request
      )
    );

  if (code) {
    url.searchParams.set(
      'google_error',
      code
    );
  }

  const response =
    NextResponse.redirect(
      url
    );

  clearOAuthCookies(
    response
  );

  return noStore(
    response
  );
}

/* ============================================================
   AUDIT
   ============================================================ */

function getClientIp(
  request: NextRequest
): string | null {
  return (
    request.headers
      .get(
        'x-forwarded-for'
      )
      ?.split(',')[0]
      ?.trim() ||
    request.headers.get(
      'x-real-ip'
    ) ||
    null
  );
}

async function recordAudit(
  request: NextRequest,
  userId: string,
  eventType: string,
  metadata: Record<
    string,
    unknown
  > = {}
) {
  try {
    await queryControl(
      `
        INSERT INTO audit_logs (
          user_id,
          event_type,
          entity_type,
          entity_id,
          ip_address,
          user_agent,
          metadata,
          created_at
        )
        VALUES (
          $1,
          $2,
          'auth',
          $1,
          $3,
          $4,
          $5,
          NOW()
        )
      `,
      [
        userId,

        eventType,

        getClientIp(
          request
        ),

        request.headers.get(
          'user-agent'
        ) || null,

        JSON.stringify(
          metadata
        ),
      ]
    );
  } catch (error) {
    console.error(
      '[Auth][Google] Failed to write audit event:',
      error
    );
  }
}

/* ============================================================
   GOOGLE TOKEN EXCHANGE
   ============================================================ */

async function exchangeGoogleCode({
  code,
  clientId,
  clientSecret,
  redirectUri,
}: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<
  GoogleTokenResponse | null
> {
  const response =
    await fetch(
      GOOGLE_TOKEN_URL,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',

          Accept:
            'application/json',
        },

        body:
          new URLSearchParams({
            code,

            client_id:
              clientId,

            client_secret:
              clientSecret,

            redirect_uri:
              redirectUri,

            grant_type:
              'authorization_code',
          }),

        cache:
          'no-store',
      }
    );

  let data:
    GoogleTokenResponse =
    {};

  try {
    data =
      (await response.json()) as GoogleTokenResponse;
  } catch {
    console.error(
      '[Auth][Google] Invalid token response.'
    );

    return null;
  }

  if (
    !response.ok ||
    !data.access_token
  ) {
    console.error(
      '[Auth][Google] Token exchange failed:',
      {
        status:
          response.status,

        error:
          data.error,

        description:
          data.error_description,
      }
    );

    return null;
  }

  return data;
}

/* ============================================================
   GOOGLE PROFILE
   ============================================================ */

async function getGoogleUser(
  accessToken: string
): Promise<
  GoogleUser | null
> {
  const response =
    await fetch(
      GOOGLE_USERINFO_URL,
      {
        method: 'GET',

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          Accept:
            'application/json',
        },

        cache:
          'no-store',
      }
    );

  let data:
    GoogleUser =
    {};

  try {
    data =
      (await response.json()) as GoogleUser;
  } catch {
    console.error(
      '[Auth][Google] Invalid Google userinfo response.'
    );

    return null;
  }

  if (!response.ok) {
    console.error(
      '[Auth][Google] Google userinfo failed:',
      response.status
    );

    return null;
  }

  return data;
}

/* ============================================================
   EXISTING USER
   ============================================================ */

async function findExistingUser(
  email: string
): Promise<
  ExistingUser | null
> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          email,
          status,
          email_verified_at,
          deleted_at,
          two_factor_enabled
        FROM users
        WHERE LOWER(email) = $1
        LIMIT 1
      `,
      [
        email,
      ]
    );

  if (
    result.rows.length ===
    0
  ) {
    return null;
  }

  return result
    .rows[0] as ExistingUser;
}

/* ============================================================
   GOOGLE SIGNUP STATE
   ============================================================ */

async function createGoogleSignupState({
  googleSubject,
  email,
  firstName,
  lastName,
  avatarUrl,
}: {
  googleSubject: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string;
}) {
  const rawState =
    crypto
      .randomBytes(32)
      .toString(
        'base64url'
      );

  const stateHash =
    crypto
      .createHash(
        'sha256'
      )
      .update(
        rawState,
        'utf8'
      )
      .digest('hex');

  const expiresAt =
    new Date(
      Date.now() +
        GOOGLE_STATE_TTL_MINUTES *
          60 *
          1000
    );

  /*
   * Remove expired states and previous unfinished
   * Google registration attempts for this email.
   */
  await queryControl(
    `
      DELETE FROM google_signup_states
      WHERE expires_at <= NOW()
         OR LOWER(email) = $1
    `,
    [
      email,
    ]
  );

  await queryControl(
    `
      INSERT INTO google_signup_states (
        state_hash,
        google_subject,
        email,
        first_name,
        last_name,
        avatar_url,
        expires_at,
        created_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        NOW()
      )
    `,
    [
      stateHash,

      googleSubject,

      email,

      firstName ||
        null,

      lastName ||
        null,

      avatarUrl ||
        null,

      expiresAt,
    ]
  );

  return rawState;
}

/* ============================================================
   CALLBACK
   ============================================================ */

export async function GET(
  request: NextRequest
) {
  const intent =
    getOAuthIntent(
      request
    );

  try {
    /* ========================================================
       1. VALIDATE OAUTH STATE
       ======================================================== */

    const returnedState =
      request.nextUrl.searchParams.get(
        'state'
      );

    const expectedState =
      request.cookies.get(
        GOOGLE_STATE_COOKIE
      )?.value;

    if (
      !returnedState ||
      !expectedState ||
      !secureEqual(
        returnedState,
        expectedState
      )
    ) {
      console.warn(
        '[Auth][Google] OAuth state validation failed.'
      );

      return redirectWithError(
        request,
        intent,
        'google_state'
      );
    }

    /* ========================================================
       2. GOOGLE ERROR
       ======================================================== */

    const oauthError =
      request.nextUrl.searchParams.get(
        'error'
      );

    const oauthDescription =
      request.nextUrl.searchParams.get(
        'error_description'
      );

    if (oauthError) {
      console.warn(
        '[Auth][Google] Google returned OAuth error:',
        {
          error:
            oauthError,

          description:
            oauthDescription,
        }
      );

      switch (
        oauthError
      ) {
        case 'access_denied':
          return redirectWithError(
            request,
            intent,
            'access_denied'
          );

        case 'invalid_request':
          return redirectWithError(
            request,
            intent,
            'google_invalid_request'
          );

        case 'unauthorized_client':
          return redirectWithError(
            request,
            intent,
            'google_unauthorized'
          );

        case 'unsupported_response_type':
          return redirectWithError(
            request,
            intent,
            'google_unsupported_response'
          );

        case 'invalid_scope':
          return redirectWithError(
            request,
            intent,
            'google_invalid_scope'
          );

        case 'server_error':
          return redirectWithError(
            request,
            intent,
            'google_server_error'
          );

        case 'temporarily_unavailable':
          return redirectWithError(
            request,
            intent,
            'google_unavailable'
          );

        default:
          return redirectWithError(
            request,
            intent,
            'google_failed'
          );
      }
    }

    /* ========================================================
       3. AUTHORIZATION CODE
       ======================================================== */

    const code =
      request.nextUrl.searchParams.get(
        'code'
      );

    if (!code) {
      return redirectWithError(
        request,
        intent,
        'google_missing_code'
      );
    }

    /* ========================================================
       4. CONFIGURATION
       ======================================================== */

    const clientId =
      process.env
        .GOOGLE_CLIENT_ID
        ?.trim();

    const clientSecret =
      process.env
        .GOOGLE_CLIENT_SECRET
        ?.trim();

    if (
      !clientId ||
      !clientSecret
    ) {
      console.error(
        '[Auth][Google] Google OAuth configuration is incomplete.'
      );

      return redirectWithError(
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
       5. TOKEN EXCHANGE
       ======================================================== */

    const tokenData =
      await exchangeGoogleCode({
        code,

        clientId,

        clientSecret,

        redirectUri,
      });

    if (
      !tokenData?.access_token
    ) {
      return redirectWithError(
        request,
        intent,
        'google_token'
      );
    }

    /* ========================================================
       6. GOOGLE PROFILE
       ======================================================== */

    const googleUser =
      await getGoogleUser(
        tokenData.access_token
      );

    if (
      !googleUser
    ) {
      return redirectWithError(
        request,
        intent,
        'google_email'
      );
    }

    /* ========================================================
       7. VERIFY GOOGLE IDENTITY
       ======================================================== */

    if (
      !googleUser.sub
    ) {
      return redirectWithError(
        request,
        intent,
        'google_identity'
      );
    }

    if (
      googleUser.email_verified !==
      true
    ) {
      return redirectWithError(
        request,
        intent,
        'google_unverified'
      );
    }

    if (
      !googleUser.email
    ) {
      return redirectWithError(
        request,
        intent,
        'google_email'
      );
    }

    /* ========================================================
       8. NORMALIZE PROFILE
       ======================================================== */

    const email =
      normalizeEmail(
        googleUser.email
      );

    if (
      !isValidEmail(
        email
      )
    ) {
      return redirectWithError(
        request,
        intent,
        'google_email'
      );
    }

    const firstName =
      cleanName(
        googleUser.given_name
      );

    const lastName =
      cleanName(
        googleUser.family_name
      );

    const avatarUrl =
      cleanAvatarUrl(
        googleUser.picture
      );

    /* ========================================================
       9. EXISTING SAMI ACCOUNT
       ======================================================== */

    const existingUser =
      await findExistingUser(
        email
      );

    if (existingUser) {
      /* ------------------------------------------------------
         Deleted account
         ------------------------------------------------------ */

      if (
        existingUser.deleted_at
      ) {
        return redirectWithError(
          request,
          intent,
          'google_account_deleted'
        );
      }

      let status =
        String(
          existingUser.status ||
            ''
        )
          .trim()
          .toLowerCase();

      /* ------------------------------------------------------
         Google itself verified this email.

         If the SaMi account was only waiting for email
         verification, Google can satisfy that requirement.
         ------------------------------------------------------ */

      if (
        status ===
        'pending_verification'
      ) {
        await queryControl(
          `
            UPDATE users
            SET
              email_verified_at =
                COALESCE(
                  email_verified_at,
                  NOW()
                ),
              status = 'active',
              updated_at = NOW()
            WHERE id = $1
              AND deleted_at IS NULL
          `,
          [
            existingUser.id,
          ]
        );

        status =
          'active';
      } else if (
        status === 'active' &&
        !existingUser.email_verified_at
      ) {
        await queryControl(
          `
            UPDATE users
            SET
              email_verified_at = NOW(),
              updated_at = NOW()
            WHERE id = $1
              AND email_verified_at IS NULL
              AND deleted_at IS NULL
          `,
          [
            existingUser.id,
          ]
        );
      }

      /* ------------------------------------------------------
         Account lock must NOT be bypassed by Google.
         ------------------------------------------------------ */

      if (
        status === 'locked'
      ) {
        await recordAudit(
          request,
          existingUser.id,
          'GOOGLE_LOGIN_BLOCKED',
          {
            reason:
              'account_locked',
          }
        );

        return redirectToLogin(
          request,
          'account_locked'
        );
      }

      if (
        status !== 'active'
      ) {
        await recordAudit(
          request,
          existingUser.id,
          'GOOGLE_LOGIN_BLOCKED',
          {
            reason:
              'account_unavailable',

            status,
          }
        );

        return redirectToLogin(
          request,
          'account_unavailable'
        );
      }

      /* ------------------------------------------------------
         SaMi 2FA

         Do NOT create a session here if SaMi 2FA is enabled.

         We will connect this branch to the existing login
         challenge helper when we review that API/helper.
         Bypassing SaMi 2FA would be a security regression.
         ------------------------------------------------------ */

      if (
        existingUser.two_factor_enabled ===
        true
      ) {
        await recordAudit(
          request,
          existingUser.id,
          'GOOGLE_LOGIN_SECOND_FACTOR_REQUIRED',
          {
            provider:
              'google',
          }
        );

        return redirectToLogin(
          request,
          'two_factor_required'
        );
      }

      /* ------------------------------------------------------
         GOOGLE LOGIN SUCCESS
         ------------------------------------------------------ */

      await createSession(
        existingUser.id,
        request,
        {
          rememberMe: false,
        }
      );

      await recordAudit(
        request,
        existingUser.id,
        'GOOGLE_LOGIN_SUCCESS',
        {
          provider:
            'google',
        }
      );

      const next =
        safeNextPath(
          request.cookies.get(
            GOOGLE_NEXT_COOKIE
          )?.value
        );

      const response =
        NextResponse.redirect(
          new URL(
            next,
            getAppBaseUrl(
              request
            )
          )
        );

      clearOAuthCookies(
        response
      );

      clearSignupCookie(
        response
      );

      return noStore(
        response
      );
    }

    /* ========================================================
       10. NEW GOOGLE USER

       No SaMi account exists yet.

       Continue into normal SaMi onboarding:
       Google → Workspace → Apps → Plan
       ======================================================== */

    const signupState =
      await createGoogleSignupState({
        googleSubject:
          googleUser.sub,

        email,

        firstName,

        lastName,

        avatarUrl,
      });

    /* ========================================================
       11. GOOGLE COMPLETE PAGE
       ======================================================== */

    const redirectUrl =
      new URL(
        '/google-complete',
        getAppBaseUrl(
          request
        )
      );

    /*
     * These values are DISPLAY / ONBOARDING data only.
     *
     * /api/auth/register must NOT trust them.
     *
     * The authoritative Google identity is stored in:
     *
     * google_signup_states
     *
     * and referenced through the HttpOnly signup cookie below.
     */

    redirectUrl.searchParams.set(
      'email',
      email
    );

    if (firstName) {
      redirectUrl.searchParams.set(
        'firstName',
        firstName
      );
    }

    if (lastName) {
      redirectUrl.searchParams.set(
        'lastName',
        lastName
      );
    }

    if (avatarUrl) {
      redirectUrl.searchParams.set(
        'avatar',
        avatarUrl
      );
    }

    const response =
      NextResponse.redirect(
        redirectUrl
      );

    /* --------------------------------------------------------
       AUTHORITATIVE GOOGLE SIGNUP STATE

       JavaScript cannot read this cookie.
       -------------------------------------------------------- */

    response.cookies.set(
      GOOGLE_SIGNUP_STATE_COOKIE,
      signupState,
      {
        ...cookieSecurity(),

        httpOnly: true,

        maxAge:
          GOOGLE_STATE_TTL_SECONDS,
      }
    );

    /*
     * The initial OAuth state has served its purpose.
     */
    clearOAuthCookies(
      response
    );

    return noStore(
      response
    );
  } catch (error) {
    console.error(
      '[Auth][Google] Callback failed:',
      error
    );

    return redirectWithError(
      request,
      intent,
      'google_failed'
    );
  }
}