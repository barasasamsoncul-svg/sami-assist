import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getSession,
  revokeAllOtherSessions,
} from '@/lib/auth/session';

import {
  verifyEmailTwoFactorCode,
} from '@/lib/auth/email-two-factor';

import {
  enableEmailTwoFactorMethod,
  getTwoFactorMethodStatus,
} from '@/lib/auth/two-factor-methods';

import {
  createRecoveryCodes,
} from '@/lib/auth/recovery-codes';

import {
  checkRateLimit,
  resetRateLimit,
} from '@/lib/auth/rate-limit';

import {
  getClientIp,
  recordAuthEvent,
} from '@/lib/auth/auth-events';

import {
  notifyCriticalSecurityEvent,
} from '@/lib/security/notifications';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   CONSTANTS
   ============================================================ */

const MAX_SETUP_TOKEN_LENGTH =
  512;

const EMAIL_CODE_LENGTH =
  6;

const CONFIRM_RATE_LIMIT_MAX_ATTEMPTS =
  8;

const CONFIRM_RATE_LIMIT_WINDOW_MS =
  10 * 60 * 1000;

const CONFIRM_RATE_LIMIT_BLOCK_MS =
  15 * 60 * 1000;

/* ============================================================
   TYPES
   ============================================================ */

type ConfirmBody = {
  setupToken?: unknown;

  code?: unknown;
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
      success: false,

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
  ConfirmBody | null
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
      ConfirmBody;
  } catch {
    return null;
  }
}

/* ============================================================
   NORMALIZATION
   ============================================================ */

function normalizeSetupToken(
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

function normalizeEmailCode(
  value: unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  /*
   * Do not silently remove invalid characters.
   *
   * 12a3456 must remain invalid rather than becoming 123456.
   */
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
   SETUP CONTEXT
   ============================================================ */

/**
 * MUST match setup/route.ts exactly.
 *
 * The emailed code is not merely attached to the user.
 *
 * It is bound to:
 *
 *   user
 *   + email_2fa_setup purpose
 *   + current SaMi session
 *   + this setup token
 */
function buildSetupContext(
  sessionId: string,
  setupToken: string
): string {
  return [
    'email-2fa-setup',
    sessionId,
    setupToken,
  ].join(
    ':'
  );
}

/* ============================================================
   RATE LIMIT IDENTIFIER
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

  return `email-2fa-confirm:${userId}:${ip}`;
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
    /*
     * Audit storage must never turn a completed security
     * operation into a failed browser response.
     */
    console.error(
      '[Security] Failed to record Email 2FA confirmation event:',
      error
    );
  }
}

/* ============================================================
   INVALID CODE RESPONSE
   ============================================================ */

function verificationFailureResponse(
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
    /* --------------------------------------------------------
       WRONG CODE
       -------------------------------------------------------- */

    case 'invalid':
      return errorResponse(
        401,
        'INVALID_EMAIL_TWO_FACTOR_CODE',
        'The email verification code is incorrect.',
        {
          attemptsRemaining:
            result
              .attemptsRemaining,
        }
      );

    /* --------------------------------------------------------
       EXPIRED
       -------------------------------------------------------- */

    case 'expired':
      return errorResponse(
        410,
        'EMAIL_TWO_FACTOR_CODE_EXPIRED',
        'This email verification code has expired. Request a new code.',
        {
          attemptsRemaining:
            0,
        }
      );

    /* --------------------------------------------------------
       ATTEMPT LIMIT
       -------------------------------------------------------- */

    case 'attempts_exhausted':
      return errorResponse(
        429,
        'EMAIL_TWO_FACTOR_CODE_ATTEMPTS_EXHAUSTED',
        'Too many incorrect attempts. Request a new email verification code.',
        {
          attemptsRemaining:
            0,
        }
      );

    /* --------------------------------------------------------
       SETUP NO LONGER EXISTS
       -------------------------------------------------------- */

    case 'not_found':
      return errorResponse(
        410,
        'EMAIL_TWO_FACTOR_SETUP_UNAVAILABLE',
        'This email verification setup is no longer available. Start again to receive a new code.'
      );

    /* --------------------------------------------------------
       ACCOUNT EMAIL CHANGED
       -------------------------------------------------------- */

    case 'email_changed':
      return errorResponse(
        409,
        'EMAIL_CHANGED',
        'Your SaMi email address changed during verification. Start email verification again.'
      );

    /* --------------------------------------------------------
       METHOD STATE CHANGED
       -------------------------------------------------------- */

    case 'method_disabled':
      return errorResponse(
        409,
        'EMAIL_TWO_FACTOR_METHOD_UNAVAILABLE',
        'Email verification is not available for this security operation.'
      );

    /* --------------------------------------------------------
       ACCOUNT NO LONGER AVAILABLE
       -------------------------------------------------------- */

    case 'account_unavailable':
      return errorResponse(
        403,
        'ACCOUNT_NOT_AVAILABLE',
        'This SaMi account is not available for security changes.'
      );

    default:
      return errorResponse(
        400,
        'EMAIL_TWO_FACTOR_CONFIRMATION_FAILED',
        'SaMi could not verify this email security code.'
      );
  }
}

/* ============================================================
   POST
   /api/account/security/email-two-factor/confirm

   FLOW

   Current session
       ↓
   Same-origin security check
       ↓
   Validate setup token + code
       ↓
   Rate limit
       ↓
   Read current verification-method state
       ↓
   Rebuild exact session-bound setup context
       ↓
   Verify + consume Email OTP
       ↓
   Enable Email 2FA
       ↓
   If this is first 2FA method:
       ├── create recovery codes
       └── revoke other active sessions
       ↓
   Return updated method state
   ============================================================ */

export async function POST(
  request:
    NextRequest
) {
  /* ==========================================================
     1. TRUSTED REQUEST
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
      '[Security] Email 2FA confirmation session lookup failed:',
      error
    );

    return errorResponse(
      500,
      'EMAIL_TWO_FACTOR_CONFIRMATION_ERROR',
      'SaMi could not complete email verification.'
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

  const setupToken =
    normalizeSetupToken(
      body.setupToken
    );

  const code =
    normalizeEmailCode(
      body.code
    );

  /* ==========================================================
     4. SETUP TOKEN VALIDATION
     ========================================================== */

  if (
    !setupToken ||
    setupToken.length >
      MAX_SETUP_TOKEN_LENGTH
  ) {
    return errorResponse(
      400,
      'INVALID_EMAIL_TWO_FACTOR_SETUP',
      'The email verification setup is invalid. Start again.'
    );
  }

  /* ==========================================================
     5. CODE VALIDATION
     ========================================================== */

  if (
    !new RegExp(
      `^\\d{${EMAIL_CODE_LENGTH}}$`
    ).test(
      code
    )
  ) {
    return errorResponse(
      400,
      'INVALID_EMAIL_TWO_FACTOR_CODE',
      'Enter the six-digit code sent to your email.'
    );
  }

  /* ==========================================================
     6. RATE LIMIT
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
        'email-2fa-confirm',

      maxAttempts:
        CONFIRM_RATE_LIMIT_MAX_ATTEMPTS,

      windowMs:
        CONFIRM_RATE_LIMIT_WINDOW_MS,

      blockMs:
        CONFIRM_RATE_LIMIT_BLOCK_MS,
    });

  if (
    !rateLimit.allowed
  ) {
    await safeRecordAuthEvent({
      request,

      userId,

      eventType:
        'EMAIL_TWO_FACTOR_CONFIRM_RATE_LIMITED',

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
      'EMAIL_TWO_FACTOR_CONFIRM_RATE_LIMITED',
      'Too many verification attempts. Wait before trying again.',
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
       7. CURRENT METHOD STATE
       ======================================================== */

    const beforeStatus =
      await getTwoFactorMethodStatus(
        userId
      );

    /*
     * If Email 2FA is already active there is nothing to
     * confirm.
     *
     * Do not consume another setup code.
     */
    if (
      beforeStatus
        .email
        .enabled
    ) {
      return errorResponse(
        409,
        'EMAIL_TWO_FACTOR_ALREADY_ENABLED',
        'Email login verification is already enabled.'
      );
    }

    /*
     * Remember whether this account already had another
     * enabled second-factor method.
     *
     * If false, Email becomes the account's first real 2FA
     * method.
     */
    const hadExistingTwoFactor =
      beforeStatus.enabled;

    /* ========================================================
       8. BUILD EXACT SETUP CONTEXT
       ======================================================== */

    const context =
      buildSetupContext(
        session.sessionId,
        setupToken
      );

    /* ========================================================
       9. VERIFY + CONSUME EMAIL OTP

       verifyEmailTwoFactorCode() itself:
       - checks account state
       - checks email ownership state
       - checks purpose/context
       - checks expiration
       - tracks failed attempts
       - compares the HMAC
       - consumes successful OTP once
       ======================================================== */

    const verification =
      await verifyEmailTwoFactorCode({
        userId,

        purpose:
          'email_2fa_setup',

        context,

        code,
      });

    if (
      !verification.success
    ) {
      await safeRecordAuthEvent({
        request,

        userId,

        eventType:
          'EMAIL_TWO_FACTOR_CONFIRM_FAILED',

        entityType:
          'user',

        entityId:
          userId,

        metadata: {
          reason:
            verification.reason,

          attemptsRemaining:
            verification
              .attemptsRemaining,
        },
      });

      return verificationFailureResponse(
        verification
      );
    }

    /* ========================================================
       10. ENABLE EMAIL METHOD

       This service becomes responsible for:
       - email_two_factor_enabled
       - email_two_factor_enabled_at
       - preferred-method fallback
       - users.two_factor_enabled reconciliation
       ======================================================== */

    let updatedStatus;

    try {
      updatedStatus =
        await enableEmailTwoFactorMethod(
          userId
        );
    } catch (error) {
      /*
       * The OTP has already been consumed at this point.
       *
       * This is safe from an authentication perspective:
       * Email 2FA has NOT been silently confirmed by this route
       * unless the method service succeeds.
       *
       * The user may restart setup to obtain a fresh OTP.
       */
      console.error(
        '[Security] Email OTP verified but Email 2FA activation failed:',
        error
      );

      await safeRecordAuthEvent({
        request,

        userId,

        eventType:
          'EMAIL_TWO_FACTOR_ACTIVATION_FAILED',

        entityType:
          'user',

        entityId:
          userId,

        metadata: {
          reason:
            'method_activation_failed',
        },
      });

      return errorResponse(
        500,
        'EMAIL_TWO_FACTOR_ACTIVATION_FAILED',
        'The code was verified, but SaMi could not enable email verification. Start the setup again.'
      );
    }

    /* ========================================================
       11. FIRST-FACTOR RECOVERY CODES

       If Email is the user's FIRST enabled 2FA method, create
       the emergency recovery-code set just as first-time
       authenticator setup does.

       IMPORTANT:
       If the account already had authenticator 2FA, DO NOT
       regenerate codes here because that would invalidate the
       user's existing recovery codes unexpectedly.
       ======================================================== */

    let recoveryCodes:
      string[] =
      [];

    if (
      !hadExistingTwoFactor
    ) {
      try {
        recoveryCodes =
          await createRecoveryCodes(
            userId
          );

        /*
         * Refresh status so recoveryCodeCount reflects the new
         * recovery-code set.
         */
        updatedStatus =
          await getTwoFactorMethodStatus(
            userId
          );
      } catch (error) {
        /*
         * Email 2FA is already successfully enabled.
         *
         * Do not pretend activation failed merely because
         * recovery-code creation encountered a separate issue.
         */
        console.error(
          '[Security] Email 2FA enabled but initial recovery-code generation failed:',
          error
        );

        await safeRecordAuthEvent({
          request,

          userId,

          eventType:
            'EMAIL_TWO_FACTOR_RECOVERY_CODE_ERROR',

          entityType:
            'user',

          entityId:
            userId,

          metadata: {
            reason:
              'recovery_code_generation_failed',
          },
        });
      }
    }

    /* ========================================================
       12. SESSION HARDENING

       When this is the user's FIRST enabled second factor,
       existing sessions on other devices were created before
       that protection existed.

       Revoke them so those devices must authenticate again
       under the new security policy.

       Keep this browser's current session alive.
       ======================================================== */

    if (
      !hadExistingTwoFactor
    ) {
      await revokeAllOtherSessions(
        userId,
        session.sessionId
      ).catch(
        (error) => {
          /*
           * Email 2FA is already enabled.
           *
           * Log this, but do not lie to the browser and claim
           * activation itself failed.
           */
          console.error(
            '[Security] Failed to revoke other sessions after first Email 2FA activation:',
            error
          );
        }
      );
    }

    /* ========================================================
       13. RESET CONFIRM RATE LIMIT
       ======================================================== */

    await resetRateLimit(
      rateLimitKey,
      'email-2fa-confirm'
    ).catch(
      (error) => {
        console.error(
          '[Security] Failed to reset Email 2FA confirmation rate limit:',
          error
        );
      }
    );

    /* ========================================================
       14. AUDIT SUCCESS
       ======================================================== */

    await safeRecordAuthEvent({
      request,

      userId,

      eventType:
        'EMAIL_TWO_FACTOR_ENABLED',

      entityType:
        'user',

      entityId:
        userId,

      metadata: {
        firstTwoFactorMethod:
          !hadExistingTwoFactor,

        preferredMethod:
          updatedStatus
            .preferredMethod,

        authenticatorEnabled:
          updatedStatus
            .authenticator
            .enabled,

        emailEnabled:
          updatedStatus
            .email
            .enabled,

        otherSessionsRevoked:
          !hadExistingTwoFactor,

        recoveryCodesCreated:
          recoveryCodes.length >
          0,
      },
    });

    await notifyCriticalSecurityEvent({
      tenantId:
        session.currentTenantId,
      userId,
      eventKey:
        'security.email_two_factor_enabled',
      title:
        'Email verification enabled',
      message:
        'Email login verification is now enabled on your SaMi account. If this was not you, secure your account immediately.',
      dedupeKey:
        `security:email-two-factor-enabled:${userId}:${Date.now()}`,
      metadata: {
        firstTwoFactorMethod:
          !hadExistingTwoFactor,
      },
    });

    /* ========================================================
       15. SUCCESS

       Plaintext recovery codes are returned only when they were
       created during FIRST-TIME 2FA activation.

       NEVER RETURN:
       - email OTP
       - OTP hash
       - setup context
       - context hash
       - code database ID
       ======================================================== */

    return jsonResponse({
      success: true,

      code:
        'EMAIL_TWO_FACTOR_ENABLED',

      message:
        'Email login verification is now enabled.',

      twoFactor:
        updatedStatus,

      /*
       * Like authenticator setup, recovery codes are shown once.
       *
       * Existing 2FA users receive [] because we deliberately
       * preserve their current recovery-code set.
       */
      recoveryCodes,
    });
  } catch (error) {
    /* ========================================================
       16. INTERNAL ERROR
       ======================================================== */

    console.error(
      '[Security] Failed to confirm Email 2FA setup:',
      error
    );

    await safeRecordAuthEvent({
      request,

      userId,

      eventType:
        'EMAIL_TWO_FACTOR_CONFIRM_ERROR',

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
      'EMAIL_TWO_FACTOR_CONFIRMATION_ERROR',
      'SaMi could not complete email verification. Try again.'
    );
  }
}