import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  authenticatePlatformAdmin,
  findPlatformAdminById,
  getSafePlatformAdmin,
  normalizeAdminEmail,
  updateAdminSuccessfulLogin,
} from '@/lib/auth/admin-auth';

import {
  createAdminSession,
  getAdminRequestIp,
} from '@/lib/auth/admin-session';

import {
  clearAdminLoginChallengeCookie,
  createAdminLoginChallenge,
  setAdminLoginChallengeCookie,
} from '@/lib/auth/admin-login-challenges';

import {
  recordAdminAuditEvent,
  recordAdminLoginFailure,
  recordAdminLoginSuccess,
} from '@/lib/auth/admin-events';

import {
  requestAdminEmailVerification,
} from '@/lib/auth/admin-email-verification';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   TYPES
   ============================================================ */

type AdminLoginBody = {
  email?:
    unknown;

  password?:
    unknown;

  rememberMe?:
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

/* ============================================================
   AUTH FAILURE STATUS
   ============================================================ */

function authenticationFailureStatus(
  code:
    string
) {
  switch (
    code
  ) {
    case 'ACCOUNT_LOCKED':
      return 423;

    case 'ACCOUNT_SUSPENDED':
    case 'ACCOUNT_DISABLED':
    case 'EMAIL_NOT_VERIFIED':
    case 'ACCOUNT_INVITED':
      return 403;

    case 'INVALID_CREDENTIALS':
    default:
      return 401;
  }
}

/* ============================================================
   VERIFICATION URL
   ============================================================ */

function buildAdminVerificationPath(
  email:
    string
) {
  return `/admin/verify-email?email=${encodeURIComponent(
    email
  )}`;
}

/* ============================================================
   POST
   ============================================================ */

export async function POST(
  request:
    NextRequest
) {
  let attemptedEmail =
    '';

  try {
    /* ========================================================
       1. BODY
       ======================================================== */

    let body:
      AdminLoginBody;

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
        return jsonResponse(
          {
            success:
              false,

            code:
              'INVALID_REQUEST',

            error:
              'Invalid request body.',
          },
          400
        );
      }

      body =
        parsed as
          AdminLoginBody;
    } catch {
      return jsonResponse(
        {
          success:
            false,

          code:
            'INVALID_REQUEST',

          error:
            'Invalid request body.',
        },
        400
      );
    }

    /* ========================================================
       2. NORMALIZE
       ======================================================== */

    attemptedEmail =
      normalizeAdminEmail(
        body.email
      );

    const password =
      typeof body.password ===
      'string'
        ? body.password
        : '';

    const rememberMe =
      body.rememberMe ===
      true;

    /* ========================================================
       3. REQUIRED VALUES
       ======================================================== */

    if (
      !attemptedEmail ||
      !password
    ) {
      await recordAdminLoginFailure({
        request,

        attemptedEmail,

        failureReason:
          'invalid_credentials',

        metadata: {
          stage:
            'password',
        },
      });

      return jsonResponse(
        {
          success:
            false,

          code:
            'INVALID_CREDENTIALS',

          error:
            'The administrator email or password is incorrect.',
        },
        401
      );
    }

    /* ========================================================
       4. AUTHENTICATE PASSWORD
       ======================================================== */

    const authentication =
      await authenticatePlatformAdmin(
        attemptedEmail,
        password
      );

    /* ========================================================
       5. EMAIL VERIFICATION REQUIRED

       IMPORTANT:
       authenticatePlatformAdmin() reaches EMAIL_NOT_VERIFIED
       only after the identity/password path has been checked.

       We can therefore safely send a verification challenge
       for this administrator without exposing account existence
       to someone who only knows an email address.
       ======================================================== */

    if (
      !authentication.success &&
      authentication.code ===
        'EMAIL_NOT_VERIFIED' &&
      authentication.adminId
    ) {
      const admin =
        await findPlatformAdminById(
          authentication.adminId
        );

      if (
        !admin ||
        admin.emailVerified ||
        (
          admin.status !==
            'active' &&
          admin.status !==
            'invited'
        )
      ) {
        await recordAdminLoginFailure({
          request,

          adminId:
            authentication.adminId,

          attemptedEmail,

          failureReason:
            'email_verification_account_invalid',

          metadata: {
            stage:
              'email_verification',
          },
        });

        const response =
          jsonResponse(
            {
              success:
                false,

              code:
                'ACCOUNT_NOT_AVAILABLE',

              error:
                'This administrator account cannot continue sign-in.',
            },
            403
          );

        clearAdminLoginChallengeCookie(
          response
        );

        return response;
      }

      /*
       * Send or safely throttle the verification email.
       *
       * The shared verification engine handles:
       * - 6 digit code generation
       * - hashing
       * - expiry
       * - cooldown
       * - rate limiting
       * - SMTP
       * - audit events
       */
      const verification =
        await requestAdminEmailVerification({
          request,

          adminId:
            admin.id,

          email:
            admin.email,

          purpose:
            'initial_verification',
        });

      await recordAdminLoginFailure({
        request,

        adminId:
          admin.id,

        attemptedEmail,

        failureReason:
          'email_verification_required',

        metadata: {
          stage:
            'email_verification',

          verificationSent:
            verification.sent,

          verificationCooldown:
            verification.cooldown,

          retryAfterSeconds:
            verification.retryAfterSeconds,
        },
      });

      await recordAdminAuditEvent({
        request,

        adminId:
          admin.id,

        eventType:
          'admin.login.email_verification_required',

        action:
          'admin_login',

        targetType:
          'platform_admin',

        targetId:
          admin.id,

        successful:
          false,

        failureReason:
          'email_not_verified',

        metadata: {
          stage:
            'email_verification',

          verificationSent:
            verification.sent,

          verificationCooldown:
            verification.cooldown,

          retryAfterSeconds:
            verification.retryAfterSeconds,
        },
      });

      const response =
        jsonResponse(
          {
            success:
              false,

            code:
              'EMAIL_VERIFICATION_REQUIRED',

            authenticated:
              false,

            requiresEmailVerification:
              true,

            requiresTwoFactor:
              false,

            requiresTwoFactorSetup:
              false,

            /*
             * Returning the already-submitted email here is
             * safe because the caller supplied it and already
             * proved the password path.
             */
            email:
              admin.email,

            next:
              buildAdminVerificationPath(
                admin.email
              ),

            message:
              verification.sent
                ? 'A verification code has been sent to your administrator email.'
                : verification.cooldown
                  ? 'A verification code was recently requested. Use the latest code sent to your administrator email.'
                  : 'Verify your administrator email to continue signing in.',

            retryAfterSeconds:
              verification.retryAfterSeconds,
          },
          403
        );

      clearAdminLoginChallengeCookie(
        response
      );

      return response;
    }

    /* ========================================================
       6. FIRST-TIME 2FA SETUP REQUIRED

       authenticatePlatformAdmin only returns this AFTER the
       password has been verified successfully.

       Therefore it is safe to create a temporary authenticated
       login challenge for enrollment.
       ======================================================== */

    if (
      !authentication.success &&
      authentication.code ===
        'TWO_FACTOR_SETUP_REQUIRED' &&
      authentication.adminId
    ) {
      const admin =
        await findPlatformAdminById(
          authentication.adminId
        );

      if (
        !admin ||
        admin.status !==
          'active' ||
        !admin.emailVerified
      ) {
        await recordAdminLoginFailure({
          request,

          adminId:
            authentication.adminId,

          attemptedEmail,

          failureReason:
            'two_factor_setup_account_invalid',

          metadata: {
            stage:
              'two_factor_setup',
          },
        });

        return jsonResponse(
          {
            success:
              false,

            code:
              'ACCOUNT_NOT_AVAILABLE',

            error:
              'This administrator account cannot continue sign-in.',
          },
          403
        );
      }

      const {
        challengeToken,
        challenge,
      } =
        await createAdminLoginChallenge({
          adminId:
            admin.id,

          request,

          rememberMe,
        });

      await recordAdminAuditEvent({
        request,

        adminId:
          admin.id,

        eventType:
          'admin.two_factor.setup_required',

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

          stage:
            'enrollment_required',

          rememberMe,
        },
      });

      const response =
        jsonResponse({
          success:
            true,

          code:
            'TWO_FACTOR_SETUP_REQUIRED',

          authenticated:
            false,

          requiresEmailVerification:
            false,

          requiresTwoFactor:
            true,

          requiresTwoFactorSetup:
            true,

          admin:
            getSafePlatformAdmin(
              admin
            ),

          next:
            '/admin/two-factor/setup',

          challengeExpiresAt:
            challenge.expiresAt.toISOString(),
        });

      setAdminLoginChallengeCookie(
        response,
        challengeToken
      );

      return response;
    }

    /* ========================================================
       7. NORMAL AUTH FAILURE
       ======================================================== */

    if (
      !authentication.success
    ) {
      await recordAdminLoginFailure({
        request,

        adminId:
          authentication.adminId ??
          null,

        attemptedEmail,

        failureReason:
          authentication.code,

        metadata: {
          stage:
            'password',

          authenticationCode:
            authentication.code,
        },
      });

      const response =
        jsonResponse(
          {
            success:
              false,

            code:
              authentication.code,

            authenticated:
              false,

            requiresEmailVerification:
              false,

            error:
              authentication.message,

            lockedUntil:
              authentication.lockedUntil
                ? authentication.lockedUntil.toISOString()
                : undefined,
          },
          authenticationFailureStatus(
            authentication.code
          )
        );

      clearAdminLoginChallengeCookie(
        response
      );

      return response;
    }

    const admin =
      authentication.admin;

    /* ========================================================
       8. DEFENSIVE EMAIL VERIFICATION CHECK

       authenticatePlatformAdmin() should already enforce this.
       This check prevents a future auth-helper regression from
       accidentally establishing an admin session for an
       unverified identity.
       ======================================================== */

    if (
      !admin.emailVerified
    ) {
      const verification =
        await requestAdminEmailVerification({
          request,

          adminId:
            admin.id,

          email:
            admin.email,

          purpose:
            'initial_verification',
        });

      await recordAdminAuditEvent({
        request,

        adminId:
          admin.id,

        eventType:
          'admin.login.email_verification_required',

        action:
          'admin_login',

        targetType:
          'platform_admin',

        targetId:
          admin.id,

        successful:
          false,

        failureReason:
          'email_not_verified',

        metadata: {
          stage:
            'defensive_verification_check',

          verificationSent:
            verification.sent,

          verificationCooldown:
            verification.cooldown,
        },
      });

      const response =
        jsonResponse(
          {
            success:
              false,

            code:
              'EMAIL_VERIFICATION_REQUIRED',

            authenticated:
              false,

            requiresEmailVerification:
              true,

            requiresTwoFactor:
              false,

            requiresTwoFactorSetup:
              false,

            email:
              admin.email,

            next:
              buildAdminVerificationPath(
                admin.email
              ),

            message:
              'Verify your administrator email to continue signing in.',

            retryAfterSeconds:
              verification.retryAfterSeconds,
          },
          403
        );

      clearAdminLoginChallengeCookie(
        response
      );

      return response;
    }

    /* ========================================================
       9. EXISTING 2FA REQUIRED
       ======================================================== */

    if (
      authentication.requiresTwoFactor
    ) {
      const {
        challengeToken,
        challenge,
      } =
        await createAdminLoginChallenge({
          adminId:
            admin.id,

          request,

          rememberMe,
        });

      await recordAdminAuditEvent({
        request,

        adminId:
          admin.id,

        eventType:
          'admin.login.two_factor_required',

        action:
          'admin_login',

        targetType:
          'platform_admin',

        targetId:
          admin.id,

        successful:
          true,

        metadata: {
          challengeId:
            challenge.id,

          stage:
            'two_factor_required',

          rememberMe,
        },
      });

      const response =
        jsonResponse({
          success:
            true,

          code:
            'TWO_FACTOR_REQUIRED',

          authenticated:
            false,

          requiresEmailVerification:
            false,

          requiresTwoFactor:
            true,

          requiresTwoFactorSetup:
            false,

          admin:
            getSafePlatformAdmin(
              admin
            ),

          next:
            '/admin/two-factor',

          challengeExpiresAt:
            challenge.expiresAt.toISOString(),
        });

      setAdminLoginChallengeCookie(
        response,
        challengeToken
      );

      return response;
    }

    /* ========================================================
       10. NO 2FA REQUIRED — CREATE SESSION
       ======================================================== */

    const session =
      await createAdminSession({
        adminId:
          admin.id,

        request,

        rememberMe,
      });

    /* ========================================================
       11. UPDATE LOGIN STATE
       ======================================================== */

    await updateAdminSuccessfulLogin(
      admin.id,
      getAdminRequestIp(
        request
      )
    );

    /* ========================================================
       12. HISTORY + AUDIT
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
          'password',

        twoFactor:
          false,

        rememberMe,
      },
    });

    /* ========================================================
       13. RESPONSE
       ======================================================== */

    const response =
      jsonResponse({
        success:
          true,

        code:
          'ADMIN_LOGIN_SUCCESS',

        authenticated:
          true,

        requiresEmailVerification:
          false,

        requiresTwoFactor:
          false,

        requiresTwoFactorSetup:
          false,

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
      '[Admin Auth] Login error:',
      error instanceof Error
        ? error.message
        : 'Unknown administrator login error'
    );

    if (
      attemptedEmail
    ) {
      await recordAdminLoginFailure({
        request,

        attemptedEmail,

        failureReason:
          'internal_login_error',

        metadata: {
          stage:
            'login',

          message:
            error instanceof Error
              ? error.message
              : 'Unknown error',
        },
      });
    }

    const response =
      jsonResponse(
        {
          success:
            false,

          code:
            'ADMIN_LOGIN_ERROR',

          authenticated:
            false,

          requiresEmailVerification:
            false,

          error:
            'SaMi could not complete administrator sign-in.',
        },
        500
      );

    clearAdminLoginChallengeCookie(
      response
    );

    return response;
  }
}