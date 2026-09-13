import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  findPlatformAdminById,
  getSafePlatformAdmin,
  updateAdminSuccessfulLogin,
} from '@/lib/auth/admin-auth';

import {
  createAdminSession,
  getAdminRequestIp,
} from '@/lib/auth/admin-session';

import {
  adminLoginChallengeMatchesRequest,
  clearAdminLoginChallengeCookie,
  consumeAdminLoginChallenge,
  getAdminLoginChallengeTokenFromRequest,
  getValidAdminLoginChallenge,
} from '@/lib/auth/admin-login-challenges';

import {
  confirmAdminTwoFactorSetup,
} from '@/lib/auth/admin-two-factor';

import {
  recordAdminAuditEvent,
  recordAdminLoginFailure,
  recordAdminLoginSuccess,
} from '@/lib/auth/admin-events';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   TYPES
   ============================================================ */

type ConfirmSetupBody = {
  code?:
    unknown;
};

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
   CODE
   ============================================================ */

function normalizeCode(
  value:
    unknown
) {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value
    .replace(
      /\s+/g,
      ''
    )
    .trim();
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
       1. CHALLENGE
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

    if (
      !adminLoginChallengeMatchesRequest(
        challenge,
        request
      )
    ) {
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
       2. ADMIN
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

    if (
      admin.status !==
        'active' ||
      !admin.emailVerified
    ) {
      const response =
        errorResponse(
          403,
          'ADMIN_ACCOUNT_UNAVAILABLE',
          'This administrator account cannot complete two-factor setup.'
        );

      clearAdminLoginChallengeCookie(
        response
      );

      return response;
    }

    if (
      admin.twoFactorEnabled
    ) {
      return errorResponse(
        409,
        'TWO_FACTOR_ALREADY_ENABLED',
        'Two-factor authentication is already enabled.'
      );
    }

    /* ========================================================
       3. BODY
       ======================================================== */

    let body:
      ConfirmSetupBody;

    try {
      const parsed:
        unknown =
        await request.json();

      if (
        !parsed ||
        typeof parsed !==
          'object' ||
        Array.isArray(
          parsed
        )
      ) {
        return errorResponse(
          400,
          'INVALID_REQUEST',
          'Invalid request body.'
        );
      }

      body =
        parsed as
          ConfirmSetupBody;
    } catch {
      return errorResponse(
        400,
        'INVALID_REQUEST',
        'Invalid request body.'
      );
    }

    const code =
      normalizeCode(
        body.code
      );

    if (
      !/^\d{6}$/.test(
        code
      )
    ) {
      return errorResponse(
        400,
        'INVALID_TWO_FACTOR_CODE',
        'Enter the 6-digit code from your authenticator app.'
      );
    }

    /* ========================================================
       4. CONFIRM AUTHENTICATOR
       ======================================================== */

    const confirmation =
      await confirmAdminTwoFactorSetup({
        adminId:
          admin.id,

        code,
      });

    if (
      !confirmation.enabled
    ) {
      await recordAdminAuditEvent({
        request,

        adminId:
          admin.id,

        eventType:
          'admin.two_factor.setup_failed',

        action:
          'admin_two_factor_setup',

        targetType:
          'platform_admin',

        targetId:
          admin.id,

        successful:
          false,

        failureReason:
          'invalid_authenticator_code',

        metadata: {
          challengeId:
            challenge.id,
        },
      });

      return errorResponse(
        401,
        'INVALID_TWO_FACTOR_CODE',
        'The authenticator code is incorrect or has expired.'
      );
    }

    /* ========================================================
       5. CONSUME LOGIN CHALLENGE
       ======================================================== */

    const consumed =
      await consumeAdminLoginChallenge(
        challenge.id
      );

    if (
      !consumed
    ) {
      const response =
        errorResponse(
          409,
          'LOGIN_CHALLENGE_CONSUMED',
          'This administrator setup session has already been used.'
        );

      clearAdminLoginChallengeCookie(
        response
      );

      return response;
    }

    /* ========================================================
       6. CREATE ADMIN SESSION
       ======================================================== */

    const session =
      await createAdminSession({
        adminId:
          admin.id,

        request,

        rememberMe:
          challenge.rememberMe,
      });

    /* ========================================================
       7. LOGIN STATE
       ======================================================== */

    await updateAdminSuccessfulLogin(
      admin.id,
      getAdminRequestIp(
        request
      )
    );

    /* ========================================================
       8. LOGIN HISTORY
       ======================================================== */

    await recordAdminLoginSuccess({
      request,

      adminId:
        admin.id,

      sessionId:
        session.sessionId,

      attemptedEmail:
        admin.email,

      metadata: {
        authenticationMethod:
          'password_and_new_two_factor',

        secondFactorMethod:
          'totp',

        firstTimeEnrollment:
          true,

        challengeId:
          challenge.id,

        rememberMe:
          challenge.rememberMe,
      },
    });

    /* ========================================================
       9. SETUP AUDIT
       ======================================================== */

    await recordAdminAuditEvent({
      request,

      adminId:
        admin.id,

      sessionId:
        session.sessionId,

      eventType:
        'admin.two_factor.enabled',

      action:
        'admin_two_factor_setup',

      targetType:
        'platform_admin',

      targetId:
        admin.id,

      successful:
        true,

      metadata: {
        method:
          'authenticator',

        recoveryCodeCount:
          confirmation.recoveryCodes.length,
      },
    });

    /* ========================================================
       10. RESPONSE

       Recovery codes are returned ONCE.
       ======================================================== */

    const response =
      jsonResponse({
        success:
          true,

        code:
          'ADMIN_TWO_FACTOR_SETUP_COMPLETE',

        authenticated:
          true,

        admin:
          getSafePlatformAdmin(
            {
              ...admin,

              twoFactorEnabled:
                true,
            }
          ),

        recoveryCodes:
          confirmation.recoveryCodes,

        session: {
          id:
            session.sessionId,

          expiresAt:
            session.expiresAt.toISOString(),
        },

        next:
          '/admin',
      });

    clearAdminLoginChallengeCookie(
      response
    );

    return response;
  } catch (
    error
  ) {
    console.error(
      '[Admin 2FA] Setup confirmation error:',
      error instanceof Error
        ? error.message
        : 'Unknown administrator 2FA setup confirmation error'
    );

    return errorResponse(
      500,
      'ADMIN_TWO_FACTOR_SETUP_CONFIRM_ERROR',
      'SaMi could not complete administrator two-factor setup.'
    );
  }
}