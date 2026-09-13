import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  findPlatformAdminById,
} from '@/lib/auth/admin-auth';

import {
  adminLoginChallengeMatchesRequest,
  clearAdminLoginChallengeCookie,
  getAdminLoginChallengeTokenFromRequest,
  getValidAdminLoginChallenge,
} from '@/lib/auth/admin-login-challenges';

import {
  createAdminTwoFactorSetup,
} from '@/lib/auth/admin-two-factor';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   RESPONSE
   ============================================================ */

function jsonResponse(
  body:
    Record<string, unknown>,
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

function errorResponse(
  status:
    number,
  code:
    string,
  error:
    string
) {
  return jsonResponse(
    {
      success:
        false,

      code,

      error,
    },
    status
  );
}

/* ============================================================
   POST
   ============================================================ */

export async function POST(
  request:
    NextRequest
) {
  try {
    /* ========================================================
       1. CHALLENGE TOKEN
       ======================================================== */

    const challengeToken =
      getAdminLoginChallengeTokenFromRequest(
        request
      );

    if (
      !challengeToken
    ) {
      const response =
        errorResponse(
          401,
          'LOGIN_CHALLENGE_INVALID',
          'Your administrator setup session is missing or invalid.'
        );

      clearAdminLoginChallengeCookie(
        response
      );

      return response;
    }

    /* ========================================================
       2. LOAD CHALLENGE
       ======================================================== */

    const challenge =
      await getValidAdminLoginChallenge(
        challengeToken
      );

    if (
      !challenge
    ) {
      const response =
        errorResponse(
          401,
          'LOGIN_CHALLENGE_EXPIRED',
          'Your administrator setup session has expired. Sign in again.'
        );

      clearAdminLoginChallengeCookie(
        response
      );

      return response;
    }

    /* ========================================================
       3. REQUEST BINDING
       ======================================================== */

    if (
      !adminLoginChallengeMatchesRequest(
        challenge,
        request
      )
    ) {
      await recordAdminAuditEvent({
        request,

        adminId:
          challenge.adminId,

        eventType:
          'admin.two_factor.setup_challenge_mismatch',

        action:
          'admin_two_factor_setup',

        targetType:
          'platform_admin',

        targetId:
          challenge.adminId,

        successful:
          false,

        failureReason:
          'challenge_request_mismatch',
      });

      const response =
        errorResponse(
          401,
          'LOGIN_CHALLENGE_INVALID',
          'Your administrator setup session is no longer valid.'
        );

      clearAdminLoginChallengeCookie(
        response
      );

      return response;
    }

    /* ========================================================
       4. LOAD ADMIN
       ======================================================== */

    const admin =
      await findPlatformAdminById(
        challenge.adminId
      );

    if (
      !admin
    ) {
      const response =
        errorResponse(
          404,
          'ADMIN_NOT_FOUND',
          'Administrator account was not found.'
        );

      clearAdminLoginChallengeCookie(
        response
      );

      return response;
    }

    /* ========================================================
       5. ACCOUNT MUST STILL BE ACTIVE
       ======================================================== */

    if (
      admin.status !==
        'active'
    ) {
      const response =
        errorResponse(
          403,
          'ADMIN_ACCOUNT_UNAVAILABLE',
          'This administrator account cannot configure two-factor authentication.'
        );

      clearAdminLoginChallengeCookie(
        response
      );

      return response;
    }

    if (
      !admin.emailVerified
    ) {
      const response =
        errorResponse(
          403,
          'EMAIL_NOT_VERIFIED',
          'The administrator email address must be verified first.'
        );

      clearAdminLoginChallengeCookie(
        response
      );

      return response;
    }

    /* ========================================================
       6. DO NOT RE-ENROLL THROUGH LOGIN SETUP FLOW
       ======================================================== */

    if (
      admin.twoFactorEnabled
    ) {
      return errorResponse(
        409,
        'TWO_FACTOR_ALREADY_ENABLED',
        'Two-factor authentication is already enabled for this administrator.'
      );
    }

    if (
      !admin.twoFactorRequired
    ) {
      return errorResponse(
        403,
        'TWO_FACTOR_SETUP_NOT_REQUIRED',
        'Two-factor enrollment is not required for this administrator.'
      );
    }

    /* ========================================================
       7. CREATE PENDING AUTHENTICATOR
       ======================================================== */

    const setup =
      await createAdminTwoFactorSetup({
        adminId:
          admin.id,

        email:
          admin.email,
      });

    /* ========================================================
       8. AUDIT

       Never place the secret or otpauth URL into audit metadata.
       ======================================================== */

    await recordAdminAuditEvent({
      request,

      adminId:
        admin.id,

      eventType:
        'admin.two_factor.setup_started',

      action:
        'admin_two_factor_setup',

      targetType:
        'platform_admin',

      targetId:
        admin.id,

      successful:
        true,

      metadata: {
        challengeId:
          challenge.id,

        method:
          'authenticator',
      },
    });

    /* ========================================================
       9. RESPONSE

       The raw TOTP secret must only be returned during setup.
       It is never persisted in plaintext.
       ======================================================== */

    return jsonResponse({
      success:
        true,

      code:
        'ADMIN_TWO_FACTOR_SETUP_STARTED',

      method:
        'authenticator',

      secret:
        setup.secret,

      otpauthUrl:
        setup.otpauthUrl,

      expiresAt:
        challenge.expiresAt.toISOString(),
    });
  } catch (
    error
  ) {
    console.error(
      '[Admin 2FA] Setup start error:',
      error instanceof Error
        ? error.message
        : 'Unknown administrator 2FA setup error'
    );

    return errorResponse(
      500,
      'ADMIN_TWO_FACTOR_SETUP_ERROR',
      'SaMi could not start administrator two-factor setup.'
    );
  }
}