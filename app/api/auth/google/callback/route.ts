
import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import crypto from 'crypto';

export const runtime = 'nodejs';

const GOOGLE_TOKEN_URL =
  'https://oauth2.googleapis.com/token';

const GOOGLE_USERINFO_URL =
  'https://www.googleapis.com/oauth2/v3/userinfo';

const GOOGLE_STATE_TTL_MINUTES = 10;

export async function GET(
  request: NextRequest
) {
  try {
    /*
     * ============================================================
     * 1. Get authorization code
     * ============================================================
     */

    const code =
      request.nextUrl.searchParams.get(
        'code'
      );

    if (!code) {
      return redirectToRegister(
        request,
        'google'
      );
    }

    /*
     * ============================================================
     * 2. Get Google configuration
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
     *
 * ============================================================
 * 3. Build exact redirect URI
 * ============================================================
 *
 * Use the request origin for the callback URL.
 */

const redirectUri =
  `${request.nextUrl.origin}/api/auth/google/callback`;
    /*
     * ============================================================
     * 4. Exchange authorization code for Google tokens
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
        'Invalid Google token response:',
        tokenText
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
     * 5. Get Google user information
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
        'Invalid Google userinfo response:',
        userText
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
     * 6. Validate Google identity
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
     * Google should confirm that the email belongs to the
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
     * 7. Normalize Google account information
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
     * 8. Check whether SaMi account already exists
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
          WHERE email = $1
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
       * A soft-deleted account should not automatically be treated
       * as a completely new Google identity here.
       *
       * The normal account-recovery/re-registration flow should
       * decide what happens to it.
       */

      if (user.deleted_at) {
        return redirectToRegister(
          request,
          'google_account_deleted'
        );
      }

      /*
       * Existing account.
       *
       * Do not create another user.
       *
       * Your login flow should handle the Google sign-in.
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
     * 9. Create short-lived server-side signup state
     * ============================================================
     *
     * IMPORTANT:
     *
     * We do NOT put:
     *
     *   email
     *   firstName
     *   lastName
     *   avatar
     *
     * in the browser URL.
     *
     * Instead, create a random state ID and store the information
     * server-side.
     *
     * This requires a google_signup_states table.
     */

    const stateId =
      crypto.randomBytes(32)
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
     * 10. Redirect to Google completion page
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