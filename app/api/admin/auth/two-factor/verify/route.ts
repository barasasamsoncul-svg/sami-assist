import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  findPlatformAdminById,
  getSafePlatformAdmin,
  isPlatformAdminLocked,
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
  verifyAdminSecondFactor,
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

type VerifyBody = {
  code?:
    unknown;
};

/* ============================================================
   RESPONSE
   ============================================================ */

function jsonResponse(
  body:
    Record<
      string,
      unknown
    >,
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
   NORMALIZATION
   ============================================================ */

function normalizeSecondFactorCode(
  value:
    unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value
    .trim()
    .slice(
      0,
      128
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
       1. CHALLENGE COOKIE
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
          'Your administrator sign-in challenge is missing or invalid.'
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
          'Your administrator sign-in challenge has expired. Sign in again.'
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
          'admin.login.challenge_mismatch',

        action:
          'admin_two_factor_verify',

        targetType:
          'platform_admin',

        targetId:
          challenge.adminId,

        successful:
          false,

        failureReason:
          'challenge_request_mismatch',

        metadata: {
          challengeId:
            challenge.id,
        },
      });

      const response =
        errorResponse(
          401,
          'LOGIN_CHALLENGE_INVALID',
          'Your administrator sign-in challenge is no longer valid.'
        );

      clearAdminLoginChallengeCookie(
        response
      );

      return response;
    }

    /* ========================================================
       4. ADMIN
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
          401,
          'LOGIN_CHALLENGE_INVALID',
          'The administrator account associated with this sign-in no longer exists.'
        );

      clearAdminLoginChallengeCookie(
        response
      );

      return response;
    }

    /* ========================================================
       5. CURRENT ACCOUNT STATUS
       ======================================================== */

    if (
      admin.status ===
        'disabled' ||
      admin.status ===
        'suspended'
    ) {
      await recordAdminLoginFailure({
        request,

        adminId:
          admin.id,

        attemptedEmail:
          admin.email,

        failureReason:
          `account_${admin.status}`,

        metadata: {
          stage:
            'two_factor',
        },
      });

      const response =
        errorResponse(
          403,
          admin.status ===
            'disabled'
            ? 'ACCOUNT_DISABLED'
            : 'ACCOUNT_SUSPENDED',
          `This administrator account is ${admin.status}.`
        );

      clearAdminLoginChallengeCookie(
        response
      );

      return response;
    }

    if (
      isPlatformAdminLocked(
        admin
      )
    ) {
      const response =
        errorResponse(
          423,
          'ACCOUNT_LOCKED',
          'This administrator account is temporarily locked.'
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
          'The administrator email address has not been verified.'
        );

      clearAdminLoginChallengeCookie(
        response
      );

      return response;
    }

    if (
      !admin.twoFactorEnabled
    ) {
      const response =
        errorResponse(
          403,
          'TWO_FACTOR_NOT_ENABLED',
          'Two-factor authentication is not configured for this administrator account.'
        );

      clearAdminLoginChallengeCookie(
        response
      );

      return response;
    }

    /* ========================================================
       6. PARSE REQUEST BODY
       ======================================================== */

    let body:
      VerifyBody;

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
          VerifyBody;
    } catch {
      return errorResponse(
        400,
        'INVALID_REQUEST',
        'Invalid request body.'
      );
    }

    const code =
      normalizeSecondFactorCode(
        body.code
      );

    if (
      !code
    ) {
      return errorResponse(
        400,
        'TWO_FACTOR_CODE_REQUIRED',
        'Enter your administrator verification code.'
      );
    }

    /* ========================================================
       7. VERIFY SECOND FACTOR
       ======================================================== */

    const verification =
      await verifyAdminSecondFactor({
        adminId:
          admin.id,

        code,
      });

    if (
      !verification.valid
    ) {
      await recordAdminLoginFailure({
        request,

        adminId:
          admin.id,

        attemptedEmail:
          admin.email,

        failureReason:
          'invalid_second_factor',

        metadata: {
          stage:
            'two_factor',

          challengeId:
            challenge.id,
        },
      });

      await recordAdminAuditEvent({
        request,

        adminId:
          admin.id,

        eventType:
          'admin.two_factor.failed',

        action:
          'admin_two_factor_verify',

        targetType:
          'platform_admin',

        targetId:
          admin.id,

        successful:
          false,

        failureReason:
          'invalid_second_factor',

        metadata: {
          challengeId:
            challenge.id,
        },
      });

      return errorResponse(
        401,
        'INVALID_TWO_FACTOR_CODE',
        'The verification code is incorrect or has expired.'
      );
    }

    /* ========================================================
       8. CONSUME CHALLENGE

       This prevents replay.
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
          'This administrator sign-in challenge has already been used.'
        );

      clearAdminLoginChallengeCookie(
        response
      );

      return response;
    }

    /* ========================================================
       9. CREATE FINAL ADMIN SESSION
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
       10. UPDATE ADMIN LOGIN STATE
       ======================================================== */

    await updateAdminSuccessfulLogin(
      admin.id,
      getAdminRequestIp(
        request
      )
    );

    /* ========================================================
       11. AUDIT SUCCESS
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
          'password_and_two_factor',

        secondFactorMethod:
          verification.method,

        challengeId:
          challenge.id,

        rememberMe:
          challenge.rememberMe,
      },
    });

    await recordAdminAuditEvent({
      request,

      adminId:
        admin.id,

      sessionId:
        session.sessionId,

      eventType:
        'admin.two_factor.success',

      action:
        'admin_two_factor_verify',

      targetType:
        'platform_admin',

      targetId:
        admin.id,

      successful:
        true,

      metadata: {
        secondFactorMethod:
          verification.method,
      },
    });

    /* ========================================================
       12. RESPONSE
       ======================================================== */

    const response =
      jsonResponse({
        success:
          true,

        code:
          'ADMIN_TWO_FACTOR_SUCCESS',

        authenticated:
          true,

        admin:
          getSafePlatformAdmin(
            admin
          ),

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
      '[Admin Auth] Two-factor verification error:',
      error instanceof
        Error
        ? error.message
        : 'Unknown administrator two-factor error'
    );

    return errorResponse(
      500,
      'ADMIN_TWO_FACTOR_ERROR',
      'SaMi could not complete administrator verification.'
    );
  }
}