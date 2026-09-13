import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getSession,
  revokeAllOtherSessions,
} from '@/lib/auth/session';

import {
  queryControl,
} from '@/lib/db/control';

import {
  verifyPassword,
} from '@/lib/auth/password';

import {
  verifyUserTwoFactorCode,
} from '@/lib/auth/two-factor';

import {
  disableEmailTwoFactorMethod,
  getTwoFactorMethodStatus,
} from '@/lib/auth/two-factor-methods';

import {
  createEmailTwoFactorContextToken,
  EmailTwoFactorError,
  invalidateIssuedEmailTwoFactorCode,
  issueEmailTwoFactorCode,
  verifyEmailTwoFactorCode,
} from '@/lib/auth/email-two-factor';

import {
  sendSecurityCodeEmail,
} from '@/lib/services/email';

import {
  checkRateLimit,
  resetRateLimit,
} from '@/lib/auth/rate-limit';

import {
  getClientIp,
  recordAuthEvent,
} from '@/lib/auth/auth-events';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   CONSTANTS
   ============================================================ */

const MAX_PASSWORD_LENGTH =
  128;

const MAX_TWO_FACTOR_CODE_LENGTH =
  64;

const MAX_STEP_UP_TOKEN_LENGTH =
  512;

const MANAGE_RATE_LIMIT_MAX_ATTEMPTS =
  8;

const MANAGE_RATE_LIMIT_WINDOW_MS =
  10 * 60 * 1000;

const MANAGE_RATE_LIMIT_BLOCK_MS =
  15 * 60 * 1000;

/* ============================================================
   TYPES
   ============================================================ */

type DeleteBody = {
  currentPassword?: unknown;

  /**
   * Existing authenticator code or recovery code.
   *
   * Optional because the user may instead use Email 2FA
   * step-up verification.
   */
  twoFactorCode?: unknown;

  /**
   * Email security code issued for this exact disable action.
   */
  emailCode?: unknown;

  /**
   * Opaque token that binds the Email OTP to this:
   *
   * - account
   * - current session
   * - disable-email-2fa operation
   */
  stepUpToken?: unknown;
};

type UserSecurityRow = {
  id: string;

  email: string;

  password_hash:
    | string
    | null;

  status:
    | string
    | null;

  first_name:
    | string
    | null;

  last_name:
    | string
    | null;

  full_name:
    | string
    | null;
};

/* ============================================================
   RESPONSE
   ============================================================ */

function jsonResponse(
  body: Record<
    string,
    unknown
  >,
  status = 200,
  extraHeaders?:
    Record<
      string,
      string
    >
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

        ...extraHeaders,
      },
    }
  );
}

/* ============================================================
   ERROR RESPONSE
   ============================================================ */

function errorResponse(
  status: number,
  code: string,
  error: string,
  extra?: Record<
    string,
    unknown
  >,
  headers?: Record<
    string,
    string
  >
) {
  return jsonResponse(
    {
      success:
        false,

      code,

      error,

      ...(extra || {}),
    },
    status,
    headers
  );
}

/* ============================================================
   BODY
   ============================================================ */

async function readBody(
  request:
    NextRequest
): Promise<
  DeleteBody | null
> {
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
      return null;
    }

    return parsed as
      DeleteBody;
  } catch {
    return null;
  }
}

/* ============================================================
   NORMALIZATION
   ============================================================ */

function normalizePassword(
  value: unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  /*
   * Passwords must NEVER be trimmed.
   */
  return value;
}

function normalizeSecurityCode(
  value: unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value.trim();
}

function normalizeStepUpToken(
  value: unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value.trim();
}

/* ============================================================
   TRUSTED MUTATION
   ============================================================ */

function isTrustedMutationRequest(
  request:
    NextRequest
): boolean {
  const fetchSite =
    request.headers
      .get(
        'sec-fetch-site'
      )
      ?.trim()
      .toLowerCase();

  if (
    fetchSite &&
    fetchSite !==
      'same-origin' &&
    fetchSite !==
      'same-site' &&
    fetchSite !==
      'none'
  ) {
    return false;
  }

  const origin =
    request.headers
      .get(
        'origin'
      )
      ?.trim();

  if (
    !origin
  ) {
    return true;
  }

  const host =
    request.headers
      .get(
        'host'
      )
      ?.trim()
      .toLowerCase();

  if (
    !host
  ) {
    return false;
  }

  try {
    const originUrl =
      new URL(
        origin
      );

    return (
      originUrl.host
        .toLowerCase() ===
      host
    );
  } catch {
    return false;
  }
}

/* ============================================================
   USER
   ============================================================ */

async function getUserSecurityRecord(
  userId: string
): Promise<
  UserSecurityRow | null
> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          email,
          password_hash,
          status,
          first_name,
          last_name,
          full_name

        FROM users

        WHERE id = $1
          AND deleted_at IS NULL

        LIMIT 1
      `,
      [
        userId,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}

/* ============================================================
   DISPLAY NAME
   ============================================================ */

function getDisplayName(
  user:
    UserSecurityRow
): string {
  const firstName =
    user.first_name
      ?.trim();

  if (
    firstName
  ) {
    return firstName;
  }

  const fullName =
    user.full_name
      ?.trim();

  if (
    fullName
  ) {
    return fullName;
  }

  const combined =
    `${
      user.first_name ||
      ''
    } ${
      user.last_name ||
      ''
    }`
      .trim()
      .replace(
        /\s+/g,
        ' '
      );

  if (
    combined
  ) {
    return combined;
  }

  return 'there';
}

/* ============================================================
   RATE LIMIT
   ============================================================ */

function getRateLimitIdentifier(
  request:
    NextRequest,
  userId:
    string
): string {
  const ip =
    getClientIp(
      request
    ) ||
    'unknown-ip';

  return `email-2fa-manage:${userId}:${ip}`;
}

/* ============================================================
   EMAIL STEP-UP CONTEXT
   ============================================================ */

function buildDisableStepUpContext(
  sessionId: string,
  stepUpToken: string
): string {
  return [
    'email-2fa-disable',
    sessionId,
    stepUpToken,
  ].join(
    ':'
  );
}

/* ============================================================
   AUDIT
   ============================================================ */

async function safeRecordAuthEvent(
  input: Parameters<
    typeof recordAuthEvent
  >[0]
) {
  try {
    await recordAuthEvent(
      input
    );
  } catch (error) {
    console.error(
      '[Security] Failed to record Email 2FA management event:',
      error
    );
  }
}

/* ============================================================
   EMAIL OTP ERROR
   ============================================================ */

function emailOtpErrorResponse(
  error:
    EmailTwoFactorError
) {
  switch (
    error.code
  ) {
    case 'EMAIL_CODE_COOLDOWN': {
      const retryAfterSeconds =
        error
          .retryAfterSeconds ??
        60;

      return errorResponse(
        429,
        error.code,
        error.message,
        {
          retryAfterSeconds,
        },
        {
          'Retry-After':
            String(
              retryAfterSeconds
            ),
        }
      );
    }

    case 'EMAIL_TWO_FACTOR_NOT_ENABLED':
    case 'EMAIL_NOT_VERIFIED':
    case 'INVALID_EMAIL_ADDRESS':
      return errorResponse(
        409,
        error.code,
        error.message
      );

    case 'ACCOUNT_NOT_AVAILABLE':
      return errorResponse(
        403,
        error.code,
        error.message
      );

    case 'INVALID_EMAIL_CODE_CONTEXT':
    case 'INVALID_EMAIL_CODE_PURPOSE':
    default:
      return errorResponse(
        400,
        error.code,
        error.message
      );
  }
}

/* ============================================================
   EMAIL VERIFICATION FAILURE
   ============================================================ */

function emailVerificationFailureResponse(
  result: {
    reason:
      | 'verified'
      | 'invalid'
      | 'expired'
      | 'attempts_exhausted'
      | 'not_found'
      | 'email_changed'
      | 'method_disabled'
      | 'account_unavailable';

    attemptsRemaining:
      number | null;
  }
) {
  switch (
    result.reason
  ) {
    case 'invalid':
      return errorResponse(
        401,
        'INVALID_EMAIL_SECURITY_CODE',
        'The email security code is incorrect.',
        {
          attemptsRemaining:
            result
              .attemptsRemaining,
        }
      );

    case 'expired':
      return errorResponse(
        410,
        'EMAIL_SECURITY_CODE_EXPIRED',
        'This email security code has expired. Request a new code.'
      );

    case 'attempts_exhausted':
      return errorResponse(
        429,
        'EMAIL_SECURITY_CODE_ATTEMPTS_EXHAUSTED',
        'Too many incorrect attempts. Request another security code.',
        {
          attemptsRemaining:
            0,
        }
      );

    case 'not_found':
      return errorResponse(
        410,
        'EMAIL_SECURITY_VERIFICATION_UNAVAILABLE',
        'This email security verification is no longer available. Request another code.'
      );

    case 'email_changed':
      return errorResponse(
        409,
        'EMAIL_CHANGED',
        'Your SaMi email address changed during verification. Start again.'
      );

    case 'method_disabled':
      return errorResponse(
        409,
        'EMAIL_TWO_FACTOR_NOT_ENABLED',
        'Email login verification is no longer enabled.'
      );

    case 'account_unavailable':
      return errorResponse(
        403,
        'ACCOUNT_NOT_AVAILABLE',
        'This SaMi account is not available for security changes.'
      );

    default:
      return errorResponse(
        400,
        'EMAIL_SECURITY_VERIFICATION_FAILED',
        'SaMi could not verify this security code.'
      );
  }
}

/* ============================================================
   RECOVERY CODE CLEANUP
   ============================================================ */

/**
 * Recovery codes are account-level emergency second-factor
 * credentials.
 *
 * If Email was the LAST active primary 2FA method, there is no
 * longer any 2FA configuration for those recovery codes to
 * recover.
 *
 * In that case revoke all unused recovery codes.
 *
 * If authenticator remains active, preserve the codes.
 */
async function revokeRecoveryCodesIfNoTwoFactorRemains(
  userId: string,
  twoFactorStillEnabled:
    boolean
) {
  if (
    twoFactorStillEnabled
  ) {
    return;
  }

  await queryControl(
    `
      UPDATE user_recovery_codes

      SET
        revoked_at = NOW()

      WHERE user_id = $1
        AND used_at IS NULL
        AND revoked_at IS NULL
    `,
    [
      userId,
    ]
  );
}

/* ============================================================
   GET
   /api/account/security/email-two-factor

   Returns the authenticated user's real multi-method
   verification state.
   ============================================================ */

export async function GET() {
  /* ==========================================================
     1. SESSION
     ========================================================== */

  let session;

  try {
    session =
      await getSession();
  } catch (error) {
    console.error(
      '[Security] Email 2FA status session lookup failed:',
      error
    );

    return errorResponse(
      500,
      'EMAIL_TWO_FACTOR_STATUS_ERROR',
      'SaMi could not load email verification settings.'
    );
  }

  if (
    !session
  ) {
    return errorResponse(
      401,
      'UNAUTHENTICATED',
      'Your SaMi session has expired. Sign in again to continue.'
    );
  }

  /* ==========================================================
     2. STATUS
     ========================================================== */

  try {
    const status =
      await getTwoFactorMethodStatus(
        session.user.id
      );

    return jsonResponse({
      success:
        true,

      code:
        'EMAIL_TWO_FACTOR_STATUS',

      twoFactor:
        status,
    });
  } catch (error) {
    console.error(
      '[Security] Failed to load Email 2FA status:',
      error
    );

    return errorResponse(
      500,
      'EMAIL_TWO_FACTOR_STATUS_ERROR',
      'SaMi could not load email verification settings.'
    );
  }
}

/* ============================================================
   DELETE
   /api/account/security/email-two-factor

   SECURITY FLOW

   Session
      ↓
   Trusted same-origin mutation
      ↓
   Password reauthentication
      ↓
   Second-factor reauthentication

        Option A:
        Authenticator / recovery code

        Option B:
        Email security step-up code

      ↓
   Disable ONLY Email 2FA
      ↓
   Reconcile global 2FA state
      ↓
   Revoke recovery codes only when no 2FA remains
      ↓
   Revoke other active sessions
   ============================================================ */

export async function DELETE(
  request:
    NextRequest
) {
  /* ==========================================================
     1. TRUSTED MUTATION
     ========================================================== */

  if (
    !isTrustedMutationRequest(
      request
    )
  ) {
    return errorResponse(
      403,
      'UNTRUSTED_SECURITY_REQUEST',
      'SaMi could not verify the origin of this security request.'
    );
  }

  /* ==========================================================
     2. SESSION
     ========================================================== */

  let session;

  try {
    session =
      await getSession();
  } catch (error) {
    console.error(
      '[Security] Email 2FA disable session lookup failed:',
      error
    );

    return errorResponse(
      500,
      'EMAIL_TWO_FACTOR_DISABLE_ERROR',
      'SaMi could not disable email verification.'
    );
  }

  if (
    !session
  ) {
    return errorResponse(
      401,
      'UNAUTHENTICATED',
      'Your SaMi session has expired. Sign in again to continue.'
    );
  }

  const userId =
    session.user.id;

  /* ==========================================================
     3. BODY
     ========================================================== */

  const body =
    await readBody(
      request
    );

  if (
    !body
  ) {
    return errorResponse(
      400,
      'INVALID_REQUEST',
      'Invalid request body.'
    );
  }

  const currentPassword =
    normalizePassword(
      body.currentPassword
    );

  const twoFactorCode =
    normalizeSecurityCode(
      body.twoFactorCode
    );

  const emailCode =
    normalizeSecurityCode(
      body.emailCode
    );

  const requestedStepUpToken =
    normalizeStepUpToken(
      body.stepUpToken
    );

  /* ==========================================================
     4. BASIC VALIDATION
     ========================================================== */

  if (
    !currentPassword
  ) {
    return errorResponse(
      400,
      'PASSWORD_REQUIRED',
      'Enter your current password to disable email verification.'
    );
  }

  if (
    currentPassword.length >
      MAX_PASSWORD_LENGTH
  ) {
    return errorResponse(
      401,
      'INVALID_CURRENT_PASSWORD',
      'Your current password is incorrect.'
    );
  }

  if (
    twoFactorCode.length >
      MAX_TWO_FACTOR_CODE_LENGTH
  ) {
    return errorResponse(
      400,
      'INVALID_TWO_FACTOR_CODE',
      'The verification code is invalid.'
    );
  }

  if (
    emailCode &&
    !/^\d{6}$/.test(
      emailCode
    )
  ) {
    return errorResponse(
      400,
      'INVALID_EMAIL_SECURITY_CODE',
      'Enter the six-digit security code sent to your email.'
    );
  }

  if (
    requestedStepUpToken.length >
      MAX_STEP_UP_TOKEN_LENGTH
  ) {
    return errorResponse(
      400,
      'INVALID_SECURITY_STEP_UP',
      'The security verification request is invalid.'
    );
  }

  /* ==========================================================
     5. RATE LIMIT
     ========================================================== */

  const rateLimitKey =
    getRateLimitIdentifier(
      request,
      userId
    );

  const rateLimit =
    await checkRateLimit({
      identifier:
        rateLimitKey,

      action:
        'email-2fa-manage',

      maxAttempts:
        MANAGE_RATE_LIMIT_MAX_ATTEMPTS,

      windowMs:
        MANAGE_RATE_LIMIT_WINDOW_MS,

      blockMs:
        MANAGE_RATE_LIMIT_BLOCK_MS,
    });

  if (
    !rateLimit.allowed
  ) {
    await safeRecordAuthEvent({
      request,

      userId,

      eventType:
        'EMAIL_TWO_FACTOR_MANAGE_RATE_LIMITED',

      entityType:
        'user',

      entityId:
        userId,

      metadata: {
        retryAfterSeconds:
          rateLimit
            .retryAfterSeconds,
      },
    });

    const retryAfterSeconds =
      rateLimit
        .retryAfterSeconds ??
      undefined;

    return errorResponse(
      429,
      'EMAIL_TWO_FACTOR_MANAGE_RATE_LIMITED',
      'Too many security attempts. Wait before trying again.',
      {
        retryAfterSeconds,
      },
      retryAfterSeconds
        ? {
            'Retry-After':
              String(
                retryAfterSeconds
              ),
          }
        : undefined
    );
  }

  try {
    /* ========================================================
       6. ACCOUNT
       ======================================================== */

    const user =
      await getUserSecurityRecord(
        userId
      );

    if (
      !user ||
      String(
        user.status ||
        ''
      )
        .trim()
        .toLowerCase() !==
        'active'
    ) {
      return errorResponse(
        403,
        'ACCOUNT_NOT_AVAILABLE',
        'This SaMi account is not available for security changes.'
      );
    }

    /* ========================================================
       7. EMAIL 2FA STATUS
       ======================================================== */

    const methodStatus =
      await getTwoFactorMethodStatus(
        userId
      );

    if (
      !methodStatus
        .email
        .enabled
    ) {
      return errorResponse(
        409,
        'EMAIL_TWO_FACTOR_NOT_ENABLED',
        'Email login verification is not enabled.'
      );
    }

    /* ========================================================
       8. PASSWORD AVAILABILITY

       Google-only/federated accounts are NOT silently allowed
       to bypass password reauthentication.
       ======================================================== */

    if (
      !user.password_hash
    ) {
      return errorResponse(
        409,
        'PASSWORD_REAUTH_UNAVAILABLE',
        'Password reauthentication is not available for this account yet.'
      );
    }

    /* ========================================================
       9. CURRENT PASSWORD
       ======================================================== */

    const passwordValid =
      await verifyPassword(
        currentPassword,
        user.password_hash
      );

    if (
      !passwordValid
    ) {
      await safeRecordAuthEvent({
        request,

        userId,

        eventType:
          'EMAIL_TWO_FACTOR_DISABLE_REAUTH_FAILED',

        entityType:
          'user',

        entityId:
          userId,

        metadata: {
          reason:
            'invalid_password',
        },
      });

      return errorResponse(
        401,
        'INVALID_CURRENT_PASSWORD',
        'Your current password is incorrect.'
      );
    }

    /* ========================================================
       10. SECOND-FACTOR VERIFICATION STATE
       ======================================================== */

    let secondFactorVerified =
      false;

    let verificationMethod:
      | 'authenticator_or_recovery'
      | 'email'
      | null =
      null;

    /* ========================================================
       OPTION A — AUTHENTICATOR / RECOVERY CODE

       If the user deliberately supplied this field, validate it.
       Do NOT silently fall back to email after an incorrect
       authenticator/recovery credential.
       ======================================================== */

    if (
      twoFactorCode
    ) {
      const valid =
        await verifyUserTwoFactorCode({
          userId,

          code:
            twoFactorCode,
        });

      if (
        !valid
      ) {
        await safeRecordAuthEvent({
          request,

          userId,

          eventType:
            'EMAIL_TWO_FACTOR_DISABLE_REAUTH_FAILED',

          entityType:
            'user',

          entityId:
            userId,

          metadata: {
            reason:
              'invalid_authenticator_or_recovery_code',
          },
        });

        return errorResponse(
          401,
          'INVALID_TWO_FACTOR_CODE',
          'The authenticator or recovery code is invalid.'
        );
      }

      secondFactorVerified =
        true;

      verificationMethod =
        'authenticator_or_recovery';
    }

    /* ========================================================
       OPTION B — EMAIL SECURITY CODE
       ======================================================== */

    if (
      !secondFactorVerified &&
      emailCode
    ) {
      if (
        !requestedStepUpToken
      ) {
        return errorResponse(
          400,
          'EMAIL_SECURITY_STEP_UP_REQUIRED',
          'Request an email security code before entering the verification code.'
        );
      }

      const context =
        buildDisableStepUpContext(
          session.sessionId,
          requestedStepUpToken
        );

      const verification =
        await verifyEmailTwoFactorCode({
          userId,

          purpose:
            'security_step_up',

          context,

          code:
            emailCode,
        });

      if (
        !verification.success
      ) {
        await safeRecordAuthEvent({
          request,

          userId,

          eventType:
            'EMAIL_TWO_FACTOR_DISABLE_REAUTH_FAILED',

          entityType:
            'user',

          entityId:
            userId,

          metadata: {
            reason:
              verification.reason,

            method:
              'email',

            attemptsRemaining:
              verification
                .attemptsRemaining,
          },
        });

        return emailVerificationFailureResponse(
          verification
        );
      }

      secondFactorVerified =
        true;

      verificationMethod =
        'email';
    }

    /* ========================================================
       11. NO SECOND FACTOR YET — SEND EMAIL STEP-UP

       This lets an Email-only 2FA user disable Email 2FA
       without requiring an authenticator.

       If stepUpToken is supplied without a code, it acts as a
       resend for that SAME context. The OTP helper then applies
       its built-in per-context resend cooldown.
       ======================================================== */

    if (
      !secondFactorVerified
    ) {
      const stepUpToken =
        requestedStepUpToken ||
        createEmailTwoFactorContextToken();

      const context =
        buildDisableStepUpContext(
          session.sessionId,
          stepUpToken
        );

      let issued;

      try {
        issued =
          await issueEmailTwoFactorCode({
            userId,

            purpose:
              'security_step_up',

            context,

            email:
              user.email,
          });
      } catch (error) {
        if (
          error instanceof
            EmailTwoFactorError
        ) {
          return emailOtpErrorResponse(
            error
          );
        }

        throw error;
      }

      /* ======================================================
         DELIVER STEP-UP CODE
         ====================================================== */

      try {
        const delivery =
          await sendSecurityCodeEmail(
            issued.email,
            issued.code,
            getDisplayName(
              user
            ),
            {
              purpose:
                'security_step_up',

              expiresInMinutes:
                Math.max(
                  1,
                  Math.ceil(
                    issued
                      .expiresInSeconds /
                      60
                  )
                ),
            }
          );

        if (
          !delivery.success
        ) {
          throw new Error(
            'Email delivery is unavailable.'
          );
        }
      } catch (error) {
        await invalidateIssuedEmailTwoFactorCode({
          userId,

          codeId:
            issued.codeId,
        }).catch(
          (
            invalidationError
          ) => {
            console.error(
              '[Security] Failed to invalidate undelivered Email 2FA step-up code:',
              invalidationError
            );
          }
        );

        console.error(
          '[Security] Failed to deliver Email 2FA disable step-up code:',
          error
        );

        await safeRecordAuthEvent({
          request,

          userId,

          eventType:
            'EMAIL_TWO_FACTOR_DISABLE_STEP_UP_DELIVERY_FAILED',

          entityType:
            'user',

          entityId:
            userId,

          metadata: {
            maskedEmail:
              issued
                .maskedEmail,
          },
        });

        return errorResponse(
          503,
          'EMAIL_SECURITY_CODE_DELIVERY_FAILED',
          'SaMi could not send the security verification code. Try again.'
        );
      }

      await safeRecordAuthEvent({
        request,

        userId,

        eventType:
          'EMAIL_TWO_FACTOR_DISABLE_STEP_UP_SENT',

        entityType:
          'user',

        entityId:
          userId,

        metadata: {
          maskedEmail:
            issued
              .maskedEmail,

          expiresAt:
            issued
              .expiresAt,
        },
      });

      /*
       * HTTP 428 = the initial authenticated request is valid,
       * but an additional prerequisite is required before the
       * destructive security action can be completed.
       */
      return errorResponse(
        428,
        'EMAIL_SECURITY_STEP_UP_REQUIRED',
        'Enter the security code SaMi sent to your email.',
        {
          stepUp: {
            stepUpToken,

            maskedEmail:
              issued
                .maskedEmail,

            expiresAt:
              issued
                .expiresAt,

            expiresInSeconds:
              issued
                .expiresInSeconds,

            resendCooldownSeconds:
              issued
                .resendCooldownSeconds,
          },
        }
      );
    }

    /* ========================================================
       12. DISABLE EMAIL METHOD ONLY

       Authenticator configuration is intentionally untouched.
       ======================================================== */

    const updatedStatus =
      await disableEmailTwoFactorMethod(
        userId
      );

    /* ========================================================
       13. RECOVERY CODES

       If Authenticator still exists:
         keep recovery codes.

       If Email was the final primary verification method:
         revoke unused recovery codes.
       ======================================================== */

    await revokeRecoveryCodesIfNoTwoFactorRemains(
      userId,
      updatedStatus.enabled
    );

    /*
     * Refresh after potential recovery-code revocation so the
     * response reflects the authoritative current count.
     */
    const finalStatus =
      await getTwoFactorMethodStatus(
        userId
      );

    /* ========================================================
       14. SESSION HARDENING

       Security was weakened/changed. Existing sessions on
       other devices should authenticate again.

       Keep the current browser session alive.
       ======================================================== */

    await revokeAllOtherSessions(
      userId,
      session.sessionId
    ).catch(
      (error) => {
        console.error(
          '[Security] Failed to revoke other sessions after disabling Email 2FA:',
          error
        );
      }
    );

    /* ========================================================
       15. RESET RATE LIMIT
       ======================================================== */

    await resetRateLimit(
      rateLimitKey,
      'email-2fa-manage'
    ).catch(
      (error) => {
        console.error(
          '[Security] Failed to reset Email 2FA management rate limit:',
          error
        );
      }
    );

    /* ========================================================
       16. AUDIT
       ======================================================== */

    await safeRecordAuthEvent({
      request,

      userId,

      eventType:
        'EMAIL_TWO_FACTOR_DISABLED',

      entityType:
        'user',

      entityId:
        userId,

      metadata: {
        verificationMethod,

        authenticatorStillEnabled:
          finalStatus
            .authenticator
            .enabled,

        twoFactorStillEnabled:
          finalStatus
            .enabled,

        remainingRecoveryCodes:
          finalStatus
            .recovery
            .count,

        otherSessionsRevoked:
          true,
      },
    });

    /* ========================================================
       17. SUCCESS
       ======================================================== */

    return jsonResponse({
      success:
        true,

      code:
        'EMAIL_TWO_FACTOR_DISABLED',

      message:
        finalStatus.enabled
          ? 'Email login verification has been disabled. Your other verification method remains active.'
          : 'Email login verification has been disabled.',

      twoFactor:
        finalStatus,
    });
  } catch (error) {
    /* ========================================================
       18. EXPECTED EMAIL OTP ERRORS
       ======================================================== */

    if (
      error instanceof
        EmailTwoFactorError
    ) {
      return emailOtpErrorResponse(
        error
      );
    }

    /* ========================================================
       19. UNKNOWN ERROR
       ======================================================== */

    console.error(
      '[Security] Failed to disable Email 2FA:',
      error
    );

    await safeRecordAuthEvent({
      request,

      userId,

      eventType:
        'EMAIL_TWO_FACTOR_DISABLE_ERROR',

      entityType:
        'user',

      entityId:
        userId,

      metadata: {
        reason:
          'internal_error',
      },
    });

    return errorResponse(
      500,
      'EMAIL_TWO_FACTOR_DISABLE_ERROR',
      'SaMi could not disable email verification. Try again.'
    );
  }
}