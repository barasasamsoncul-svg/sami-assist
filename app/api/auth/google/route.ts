
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest
) {
  try {
    /*
     * ============================================================
     * 1. Google configuration
     * ============================================================
     */

    const clientId =
      process.env.GOOGLE_CLIENT_ID;

    if (!clientId) {
      console.error(
        'GOOGLE_CLIENT_ID is not configured.'
      );

      return NextResponse.json(
        {
          success: false,
          error:
            'Google OAuth is not configured.',
        },
        { status: 500 }
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
     * 3. Generate OAuth state
     * ============================================================
     *
     * This protects the OAuth flow against CSRF attacks.
     */

    const state =
      crypto
        .randomBytes(32)
        .toString('hex');

    /*
     * Store the state in a short-lived, HttpOnly cookie.
     *
     * The callback will validate this cookie before accepting
     * Google's authorization response.
     */

    const response =
      NextResponse.redirect(
        buildGoogleAuthUrl({
          clientId,
          redirectUri,
          state,
        })
      );

    response.cookies.set(
      'sami_google_oauth_state',
      state,
      {
        httpOnly: true,

        secure:
          process.env.NODE_ENV ===
          'production',

        sameSite: 'lax',

        path: '/',

        maxAge: 10 * 60,

      }
    );

    return response;
  } catch (error) {
    console.error(
      'Google OAuth start error:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          'Unable to start Google sign-in.',
      },
      { status: 500 }
    );
  }
}

/*
 * ================================================================
 * Build Google authorization URL
 * ================================================================
 */

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

      access_type:
        'online',

      prompt:
        'select_account',
    });

  return (
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    params.toString()
  );
}