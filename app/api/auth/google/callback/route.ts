import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import crypto from 'crypto';

export const runtime = 'nodejs';

const GOOGLE_TOKEN_URL =
  'https://oauth2.googleapis.com/token';

const GOOGLE_USERINFO_URL =
  'https://www.googleapis.com/oauth2/v3/userinfo';

const GOOGLE_STATE_TTL_MINUTES = 10;

/*
 * ================================================================
 * Google OAuth callback
 *
 * Flow:
 *
 * Register
 *    ↓
 * /api/auth/google
 *    ↓
 * Google
 *    ↓
 * /api/auth/google/callback
 *    ↓
 * ┌───────────────────────────────┐
 * │                               │
 * │ success                       │ failure
 * │   ↓                               ↓
 * │ create signup state           /auth/register?error=...
 * │   ↓
 * │ /auth/google-complete
 * │
 * └───────────────────────────────┘
 *
 * IMPORTANT:
 *
 * This callback does NOT create the final SaMi account.
 *
 * It only verifies the Google identity and creates a short-lived
 * server-side signup state.
 *
 * The final account creation happens in the Google completion
 * step.
 * ================================================================
 */

export async function GET(
  request: NextRequest
) {
  try {
    /*
     * ============================================================
     * 1. Handle Google OAuth errors FIRST
     * ============================================================
     *
     * When the user presses "Cancel" on Google's screen,
     * Google normally returns:
     *
     *   ?error=access_denied
     *
     * There will be NO authorization code.
     *
     * Your previous implementation checked for "code" first,
     * which caused cancellation to be reported as a generic
     * Google error.
     */

    const oauthError =
      request.nextUrl.searchParams.get(
        'error'
      );

    const oauthErrorDescription =
      request.nextUrl.searchParams.get(
        'error_description'
      );

    if (oauthError) {
      console.warn(
        'Google OAuth returned an error:',
        {
          error: oauthError,
          description:
            oauthErrorDescription,
        }
      );

      switch (oauthError) {
        case 'access_denied':
          return redirectToRegister(
            request,
            'cancelled'
          );

        case 'invalid_request':
          return redirectToRegister(
            request,
            'google_invalid_request'
          );

        case 'unauthorized_client':
          return redirectToRegister(
            request,
            'google_unauthorized'
          );

        case 'unsupported_response_type':
          return redirectToRegister(
            request,
            'google_unsupported_response'
          );

        case 'invalid_scope':
          return redirectToRegister(
            request,
            'google_invalid_scope'
          );

        case 'server_error':
          return redirectToRegister(
            request,
            'google_server_error'
          );

        case 'temporarily_unavailable':
          return redirectToRegister(
            request,
            'google_unavailable'
          );

        default:
          return redirectToRegister(
            request,
            'google_failed'
          );
      }
    }

    /*
     * ============================================================
     * 2. Get authorization code
     * ============================================================
     */

    const code =
      request.nextUrl.searchParams.get(
        'code'
      );

    if (!code) {
      console.error(
        'Google callback did not contain an authorization code.'
      );

      return redirectToRegister(
        request,
        'google_missing_code'
      );
    }

    /*
     * ============================================================
     * 3. Get Google configuration
     * ============================================================
     */

    const clientId =
      process.env.GOOGLE_CLIENT_ID;

    const clientSecret =
      process.env.GOOGLE_CLIENT_SECRET;

    if (
      !clientId ||
      !clientSecret
    ) {
      console.error(
        'Google OAuth configuration is missing.'
      );

      return redirectToRegister(
        request,
        'google_config'
      );
    }

    /*
     * ============================================================
     * 4. Build exact redirect URI
     * ============================================================
     *
     * This MUST exactly match the URI configured in Google
     * Cloud Console.
     */

    const redirectUri =
      `${request.nextUrl.origin}/api/auth/google/callback`;

    /*
     * ============================================================
     * 5. Exchange authorization code for Google tokens
     * ============================================================
     */

    const tokenResponse =
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

          cache: 'no-store',
        }
      );

    const tokenText =
      await tokenResponse.text();

    let tokenData:
      {
        access_token?: string;
        id_token?: string;
        token_type?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
      } = {};

    try {
      tokenData =
        JSON.parse(
          tokenText
        );
    } catch {
      console.error(
        'Invalid Google token response.'
      );
    }

    if (
      !tokenResponse.ok ||
      !tokenData.access_token
    ) {
      console.error(
        'Google token exchange failed:',
        {
          status:
            tokenResponse.status,

          error:
            tokenData.error,

          description:
            tokenData.error_description,
        }
      );

      return redirectToRegister(
        request,
        'google_token'
      );
    }

    /*
     * ============================================================
     * 6. Get Google user information
     * ============================================================
     */

    const userResponse =
      await fetch(
        GOOGLE_USERINFO_URL,
        {
          method: 'GET',

          headers: {
            Authorization:
              `Bearer ${tokenData.access_token}`,

            Accept:
              'application/json',
          },

          cache: 'no-store',
        }
      );

    const userText =
      await userResponse.text();

    let googleUser:
      {
        sub?: string;
        email?: string;
        email_verified?: boolean;
        given_name?: string;
        family_name?: string;
        name?: string;
        picture?: string;
      } = {};

    try {
      googleUser =
        JSON.parse(
          userText
        );
    } catch {
      console.error(
        'Invalid Google userinfo response.'
      );
    }

    if (
      !userResponse.ok ||
      !googleUser.email
    ) {
      console.error(
        'Google user information request failed:',
        {
          status:
            userResponse.status,
        }
      );

      return redirectToRegister(
        request,
        'google_email'
      );
    }

    /*
     * ============================================================
     * 7. Validate Google identity
     * ============================================================
     */

    if (!googleUser.sub) {
      console.error(
        'Google user does not have a subject identifier.'
      );

      return redirectToRegister(
        request,
        'google_identity'
      );
    }

    /*
     * Google must confirm that the email belongs to the
     * authenticated Google account.
     */

    if (
      googleUser.email_verified !== true
    ) {
      return redirectToRegister(
        request,
        'google_unverified'
      );
    }

    /*
     * ============================================================
     * 8. Normalize Google account information
     * ============================================================
     */

    const email =
      googleUser.email
        .trim()
        .toLowerCase();

    const firstName =
      (
        googleUser.given_name ||
        ''
      ).trim();

    const lastName =
      (
        googleUser.family_name ||
        ''
      ).trim();

    const avatarUrl =
      (
        googleUser.picture ||
        ''
      ).trim();

    /*
     * ============================================================
     * 9. Check whether SaMi account already exists
     * ============================================================
     */

    const existingUser =
      await queryControl(
        `
          SELECT
            id,
            email,
            status,
            email_verified_at,
            deleted_at
          FROM users
          WHERE LOWER(email) = $1
          LIMIT 1
        `,
        [email]
      );

    if (
      existingUser.rows.length > 0
    ) {
      const user =
        existingUser.rows[0];

      /*
       * ----------------------------------------------------------
       * Soft-deleted account
       * ----------------------------------------------------------
       */

      if (user.deleted_at) {
        return redirectToRegister(
          request,
          'google_account_deleted'
        );
      }

      /*
       * ----------------------------------------------------------
       * Existing account
       * ----------------------------------------------------------
       *
       * Do NOT create another account.
       *
       * Send the user to login where the existing Google
       * authentication flow can handle them.
       */

      return NextResponse.redirect(
        new URL(
          '/auth/login?google=true',
          request.url
        )
      );
    }

    /*
     * ============================================================
     * 10. Create short-lived server-side signup state
     * ============================================================
     *
     * We intentionally DO NOT put:
     *
     *   email
     *   firstName
     *   lastName
     *   avatar
     *   Google subject
     *
     * into the browser URL.
     *
     * Only an opaque random state identifier is exposed.
     */

    const stateId =
      crypto
        .randomBytes(32)
        .toString('hex');

    const stateHash =
      crypto
        .createHash('sha256')
        .update(stateId)
        .digest('hex');

    const expiresAt =
      new Date(
        Date.now() +
          GOOGLE_STATE_TTL_MINUTES *
            60 *
            1000
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

        googleUser.sub,

        email,

        firstName || null,

        lastName || null,

        avatarUrl || null,

        expiresAt,
      ]
    );

    /*
     * ============================================================
     * 11. Redirect to Google completion page
     * ============================================================
     */

    const redirectUrl =
      new URL(
        '/auth/google-complete',
        request.url
      );

    redirectUrl.searchParams.set(
      'state',
      stateId
    );

    return NextResponse.redirect(
      redirectUrl
    );
  } catch (error) {
    /*
     * ============================================================
     * 12. Global failure
     * ============================================================
     */

    console.error(
      'Google callback error:',
      error
    );

    return redirectToRegister(
      request,
      'google_failed'
    );
  }
}

/*
 * ================================================================
 * Redirect helper
 * ================================================================
 *
 * Every recoverable Google failure ends up here.
 *
 * The register page understands these error codes and resets
 * the Google button automatically.
 * ================================================================
 */

function redirectToRegister(
  request: NextRequest,
  errorCode: string
) {
  const url =
    new URL(
      '/auth/register',
      request.url
    );

  url.searchParams.set(
    'error',
    errorCode
  );

  return NextResponse.redirect(
    url
  );
}