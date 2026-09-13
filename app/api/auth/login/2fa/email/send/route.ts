import {
  NextRequest,
  NextResponse,
} from 'next/server';

import crypto from 'crypto';

import {
  getValidLoginChallenge,
} from '@/lib/auth/login-challenges';

import {
  findUserForLogin,
} from '@/lib/auth/account-context';

import {
  getLoginTwoFactorMethods,
} from '@/lib/auth/two-factor-methods';

import {
  EmailTwoFactorError,
  invalidateIssuedEmailTwoFactorCode,
  issueEmailTwoFactorCode,
} from '@/lib/auth/email-two-factor';

import {
  sendSecurityCodeEmail,
} from '@/lib/services/email';

import {
  checkRateLimit,
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

const MAX_EMAIL_LENGTH =
  254;

const MAX_CHALLENGE_TOKEN_LENGTH =
  512;

/**
 * This is a coarse abuse limit around email delivery.
 *
 * The Email OTP service separately enforces its own
 * per-challenge resend cooldown.
 */
const EMAIL_SEND_RATE_LIMIT_MAX_ATTEMPTS =
  8;

const EMAIL_SEND_RATE_LIMIT_WINDOW_MS =
  30 * 60 * 1000;

const EMAIL_SEND_RATE_LIMIT_BLOCK_MS =
  15 * 60 * 1000;

/* ============================================================
   TYPES
   ============================================================ */

type SendEmailCodeBody = {
  email?: unknown;

  challengeToken?: unknown;
};

/* ============================================================
   NORMALIZATION
   ============================================================ */

function normalizeEmail(
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
    .toLowerCase();
}

function normalizeChallengeToken(
  value:
    unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value.trim();
}

function isValidEmail(
  value:
    string
) {
  return (
    value.length >
      0 &&
    value.length <=
      MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      value
    )
  );
}

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
    200,
  headers:
    Record<
      string,
      string
    > = {}
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

        ...headers,
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
    string,
  extra:
    Record<
      string,
      unknown
    > = {},
  headers:
    Record<
      string,
      string
    > = {}
) {
  return jsonResponse(
    {
      success:
        false,

      code,

      error,

      ...extra,
    },
    status,
    headers
  );
}

function challengeExpiredResponse() {
  return errorResponse(
    400,
    'LOGIN_CHALLENGE_EXPIRED',
    'This login challenge has expired. Please sign in again.'
  );
}

/* ============================================================
   REQUEST BODY
   ============================================================ */

async function readBody(
  request:
    NextRequest
): Promise<
  SendEmailCodeBody | null
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
      SendEmailCodeBody;
  } catch {
    return null;
  }
}

/* ============================================================
   HASH

   Never place the raw challenge token in rate-limit storage.
   ============================================================ */

function hashValue(
  value:
    string
) {
  return crypto
    .createHash(
      'sha256'
    )
    .update(
      value,
      'utf8'
    )
    .digest(
      'hex'
    );
}

/* ============================================================
   RATE LIMIT
   ============================================================ */

function getSendRateLimitIdentifier(
  request:
    NextRequest,
  challengeToken:
    string
): string {
  const ip =
    getClientIp(
      request
    ) ||
    'unknown-ip';

  const challengeHash =
    hashValue(
      challengeToken
    );

  return `login-2fa-email-send:${challengeHash}:${ip}`;
}

/* ============================================================
   DISPLAY NAME
   ============================================================ */

function getDisplayName(
  user: {
    firstName?: string | null;

    fullName?: string | null;
  }
): string {
  const firstName =
    user.firstName
      ?.trim();

  if (
    firstName
  ) {
    return firstName;
  }

  const fullName =
    user.fullName
      ?.trim();

  if (
    fullName
  ) {
    return fullName;
  }

  return 'there';
}

/* ============================================================
   AUDIT

   Audit failure must never break the login challenge itself.
   ============================================================ */

async function safeRecordAuthEvent(
  input:
    Parameters<
      typeof recordAuthEvent
    >[0]
) {
  try {
    await recordAuthEvent(
      input
    );
  } catch (
    error
  ) {
    console.error(
      '[Auth] Failed to record Email 2FA login-code event:',
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
    /* --------------------------------------------------------
       RESEND COOLDOWN
       -------------------------------------------------------- */

    case 'EMAIL_CODE_COOLDOWN': {
      const retryAfterSeconds =
        error
          .retryAfterSeconds ??
        60;

      return errorResponse(
        429,
        'EMAIL_CODE_COOLDOWN',
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

    /* --------------------------------------------------------
       EMAIL METHOD CHANGED SINCE PASSWORD LOGIN
       -------------------------------------------------------- */

    case 'EMAIL_TWO_FACTOR_NOT_ENABLED':
      return errorResponse(
        409,
        'EMAIL_TWO_FACTOR_NOT_AVAILABLE',
        'Email verification is no longer available for this login. Choose another verification method.'
      );

    /* --------------------------------------------------------
       VERIFIED EMAIL STATE CHANGED
       -------------------------------------------------------- */

    case 'EMAIL_NOT_VERIFIED':
    case 'INVALID_EMAIL_ADDRESS':
      return errorResponse(
        409,
        'EMAIL_TWO_FACTOR_NOT_AVAILABLE',
        'Email verification is no longer available for this login. Choose another verification method.'
      );

    /* --------------------------------------------------------
       ACCOUNT STATE CHANGED
       -------------------------------------------------------- */

    case 'ACCOUNT_NOT_AVAILABLE':
      return challengeExpiredResponse();

    /* --------------------------------------------------------
       INTERNAL CONTEXT PROBLEM
       -------------------------------------------------------- */

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
   POST
   /api/auth/login/2fa/email/send

   FLOW

   Password already succeeded
        ↓
   Login challenge exists
        ↓
   Validate challenge
        ↓
   Bind challenge to account
        ↓
   Confirm Email is still an enabled login method
        ↓
   Rate-limit delivery
        ↓
   Issue login_2fa OTP bound directly to challengeToken
        ↓
   Send email
        ↓
   Return safe delivery metadata

   IMPORTANT:

   NO authenticated session is created here.
   ============================================================ */

export async function POST(
  request:
    NextRequest
) {
  let email =
    '';

  let challengeToken =
    '';

  try {
    /* ========================================================
       1. REQUEST
       ======================================================== */

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

    /* ========================================================
       2. NORMALIZE
       ======================================================== */

    email =
      normalizeEmail(
        body.email
      );

    challengeToken =
      normalizeChallengeToken(
        body.challengeToken
      );

    /* ========================================================
       3. VALIDATE
       ======================================================== */

    if (
      !isValidEmail(
        email
      )
    ) {
      return errorResponse(
        400,
        'INVALID_EMAIL',
        'Enter a valid email address.'
      );
    }

    if (
      !challengeToken ||
      challengeToken.length >
        MAX_CHALLENGE_TOKEN_LENGTH
    ) {
      return challengeExpiredResponse();
    }

    /* ========================================================
       4. VALIDATE PASSWORD-AUTHENTICATED LOGIN CHALLENGE

       This proves the request originated from a successful
       first-factor login flow.

       We do NOT allow callers to supply a user ID.
       ======================================================== */

    const challenge =
      await getValidLoginChallenge({
        email,

        challengeToken,
      });

    if (
      !challenge
    ) {
      return challengeExpiredResponse();
    }

    /* ========================================================
       5. BIND CHALLENGE TO CURRENT ACCOUNT

       Never trust email alone to identify which account should
       receive the OTP.
       ======================================================== */

    const user =
      await findUserForLogin(
        email
      );

    if (
      !user ||
      user.id !==
        challenge.user_id
    ) {
      return challengeExpiredResponse();
    }

    /* ========================================================
       6. RECHECK CURRENT 2FA METHODS

       Security settings may have changed after the password
       was accepted.

       Email must STILL be enabled now.
       ======================================================== */

    const verification =
      await getLoginTwoFactorMethods(
        challenge.user_id
      );

    if (
      !verification.required ||
      !verification.methods.includes(
        'email'
      )
    ) {
      await safeRecordAuthEvent({
        request,

        userId:
          challenge.user_id,

        eventType:
          'EMAIL_TWO_FACTOR_LOGIN_SEND_BLOCKED',

        entityType:
          'user',

        entityId:
          challenge.user_id,

        metadata: {
          reason:
            'email_method_not_available',

          availableMethods:
            verification.methods,
        },
      });

      return errorResponse(
        409,
        'EMAIL_TWO_FACTOR_NOT_AVAILABLE',
        'Email verification is not available for this login. Choose another verification method.'
      );
    }

    /* ========================================================
       7. COARSE DELIVERY RATE LIMIT

       This is separate from the 60-second same-context resend
       cooldown already enforced by issueEmailTwoFactorCode().

       We reuse the existing supported "login" limiter action,
       while the identifier isolates email-code sends from
       password and verification attempts.
       ======================================================== */

    const rateLimitKey =
      getSendRateLimitIdentifier(
        request,
        challengeToken
      );

    const rateLimit =
      await checkRateLimit({
        identifier:
          rateLimitKey,

        action:
          'login',

        maxAttempts:
          EMAIL_SEND_RATE_LIMIT_MAX_ATTEMPTS,

        windowMs:
          EMAIL_SEND_RATE_LIMIT_WINDOW_MS,

        blockMs:
          EMAIL_SEND_RATE_LIMIT_BLOCK_MS,
      });

    if (
      !rateLimit.allowed
    ) {
      await safeRecordAuthEvent({
        request,

        userId:
          challenge.user_id,

        eventType:
          'EMAIL_TWO_FACTOR_LOGIN_SEND_RATE_LIMITED',

        entityType:
          'user',

        entityId:
          challenge.user_id,

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
        'EMAIL_TWO_FACTOR_SEND_RATE_LIMITED',
        'Too many email-code requests. Wait before requesting another code.',
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
          : {}
      );
    }

    /* ========================================================
       8. ISSUE OTP

       CRITICAL:

       The login challenge token itself is the security context.

       The Email OTP service hashes that context before database
       storage and its OTP HMAC also includes:

         user
         + purpose
         + context
         + code

       Therefore a code issued for one login challenge cannot
       satisfy another login challenge.

       No raw challenge token is stored in the OTP table.
       ======================================================== */

    let issued;

    try {
      issued =
        await issueEmailTwoFactorCode({
          userId:
            challenge.user_id,

          purpose:
            'login_2fa',

          context:
            challengeToken,

          /*
           * The helper rechecks this against the account's
           * CURRENT email inside its transaction.
           *
           * This closes an email-change race.
           */
          email:
            user.email,
        });
    } catch (
      error
    ) {
      if (
        error instanceof
          EmailTwoFactorError
      ) {
        await safeRecordAuthEvent({
          request,

          userId:
            challenge.user_id,

          eventType:
            'EMAIL_TWO_FACTOR_LOGIN_SEND_BLOCKED',

          entityType:
            'user',

          entityId:
            challenge.user_id,

          metadata: {
            reason:
              error.code,
          },
        });

        return emailOtpErrorResponse(
          error
        );
      }

      throw error;
    }

    /* ========================================================
       9. SEND EMAIL

       Plaintext OTP exists only between:
         issueEmailTwoFactorCode()
           ↓
         sendSecurityCodeEmail()

       It is never logged or returned to the browser.
       ======================================================== */

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
              'login_2fa',

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
          'Email delivery was not completed.'
        );
      }
    } catch (
      error
    ) {
      /*
       * If delivery fails, invalidate the exact issued code.
       *
       * A code the user never received must not remain valid.
       */
      await invalidateIssuedEmailTwoFactorCode({
        userId:
          challenge.user_id,

        codeId:
          issued.codeId,
      }).catch(
        (
          invalidationError
        ) => {
          console.error(
            '[Auth] Failed to invalidate undelivered login Email 2FA code:',
            invalidationError
          );
        }
      );

      console.error(
        '[Auth] Failed to deliver login Email 2FA code:',
        error
      );

      await safeRecordAuthEvent({
        request,

        userId:
          challenge.user_id,

        eventType:
          'EMAIL_TWO_FACTOR_LOGIN_DELIVERY_FAILED',

        entityType:
          'user',

        entityId:
          challenge.user_id,

        metadata: {
          maskedEmail:
            issued
              .maskedEmail,
        },
      });

      return errorResponse(
        503,
        'EMAIL_TWO_FACTOR_DELIVERY_FAILED',
        'SaMi could not send the login verification code. Try again.'
      );
    }

    /* ========================================================
       10. AUDIT SUCCESS

       NEVER record:
       - plaintext OTP
       - code hash
       - raw challenge token
       - OTP database ID
       ======================================================== */

    await safeRecordAuthEvent({
      request,

      userId:
        challenge.user_id,

      eventType:
        'EMAIL_TWO_FACTOR_LOGIN_CODE_SENT',

      entityType:
        'user',

      entityId:
        challenge.user_id,

      metadata: {
        maskedEmail:
          issued
            .maskedEmail,

        expiresAt:
          issued
            .expiresAt,

        resendCooldownSeconds:
          issued
            .resendCooldownSeconds,
      },
    });

    /* ========================================================
       11. SAFE RESPONSE

       The browser only needs display/timing metadata.

       DO NOT RETURN:
       - issued.code
       - issued.codeId
       - challenge database ID
       ======================================================== */

    return jsonResponse({
      success:
        true,

      code:
        'EMAIL_TWO_FACTOR_CODE_SENT',

      message:
        'SaMi sent a login verification code to your email.',

      emailVerification: {
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

      /*
       * These top-level values make the login client simpler
       * while preserving the grouped object above.
       */
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
    });
  } catch (
    error
  ) {
    /* ========================================================
       12. EXPECTED OTP SERVICE ERROR
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
       13. UNKNOWN ERROR
       ======================================================== */

    console.error(
      '[Auth] Failed to send Email 2FA login code:',
      error
    );

    await safeRecordAuthEvent({
      request,

      eventType:
        'EMAIL_TWO_FACTOR_LOGIN_SEND_ERROR',

      metadata: {
        email,

        /*
         * Never include challengeToken here.
         */
        reason:
          'internal_error',
      },
    });

    return errorResponse(
      500,
      'EMAIL_TWO_FACTOR_SEND_ERROR',
      'SaMi could not send the login verification code. Try again.'
    );
  }
}