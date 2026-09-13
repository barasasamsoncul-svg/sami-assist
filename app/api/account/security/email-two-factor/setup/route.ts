import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getSession,
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
  getTwoFactorMethodStatus,
} from '@/lib/auth/two-factor-methods';

import {
  createEmailTwoFactorContextToken,
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

const RATE_LIMIT_MAX_ATTEMPTS =
  5;

const RATE_LIMIT_WINDOW_MS =
  10 * 60 * 1000;

const RATE_LIMIT_BLOCK_MS =
  15 * 60 * 1000;

const MAX_PASSWORD_LENGTH =
  128;

const MAX_TWO_FACTOR_CODE_LENGTH =
  64;

/* ============================================================
   TYPES
   ============================================================ */

type SetupBody = {
  currentPassword?: unknown;

  twoFactorCode?: unknown;
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

function json(
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
   REQUEST BODY
   ============================================================ */

async function readBody(
  request:
    NextRequest
): Promise<
  SetupBody | null
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

    return parsed as SetupBody;
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
   * Do not trim passwords.
   *
   * Leading/trailing spaces can legitimately be part
   * of a password.
   */
  return value;
}

function normalizeTwoFactorCode(
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

/**
 * Additional browser-side CSRF protection for this
 * security-sensitive mutation.
 *
 * Session cookies already use SameSite protections, but
 * sensitive security changes should also reject obviously
 * cross-site mutation requests.
 */
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

  /*
   * Some legitimate clients may not send Origin.
   *
   * If Sec-Fetch-Site has already shown that the request
   * is same-origin/same-site, or neither header exists,
   * session-cookie protections remain authoritative.
   */
  if (!origin) {
    return true;
  }

  const host =
    request.headers
      .get(
        'host'
      )
      ?.trim()
      .toLowerCase();

  if (!host) {
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

  return `email-2fa-setup:${userId}:${ip}`;
}

/* ============================================================
   SETUP CONTEXT
   ============================================================ */

/**
 * The browser receives only setupToken.
 *
 * The OTP itself is actually bound to:
 *
 *   email-2fa-setup:<current-session-id>:<setup-token>
 *
 * This means a setup token created in one SaMi session
 * cannot be confirmed from another session.
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
   SAFE AUDIT
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
     * Audit failure must not expose security secrets or
     * convert a completed security operation into an
     * inconsistent browser response.
     */
    console.error(
      '[Security] Failed to record Email 2FA setup event:',
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
        error.retryAfterSeconds ??
        60;

      return json(
        {
          success:
            false,

          code:
            error.code,

          error:
            error.message,

          retryAfterSeconds,
        },
        429,
        {
          'Retry-After':
            String(
              retryAfterSeconds
            ),
        }
      );
    }

    case 'EMAIL_NOT_VERIFIED':
      return json(
        {
          success:
            false,

          code:
            error.code,

          error:
            error.message,
        },
        409
      );

    case 'EMAIL_TWO_FACTOR_NOT_ENABLED':
      return json(
        {
          success:
            false,

          code:
            error.code,

          error:
            error.message,
        },
        409
      );

    case 'ACCOUNT_NOT_AVAILABLE':
      return json(
        {
          success:
            false,

          code:
            error.code,

          error:
            error.message,
        },
        403
      );

    case 'INVALID_EMAIL_ADDRESS':
      return json(
        {
          success:
            false,

          code:
            error.code,

          error:
            error.message,
        },
        409
      );

    case 'INVALID_EMAIL_CODE_CONTEXT':
    case 'INVALID_EMAIL_CODE_PURPOSE':
    default:
      return json(
        {
          success:
            false,

          code:
            error.code,

          error:
            error.message,
        },
        400
      );
  }
}

/* ============================================================
   POST
   /api/account/security/email-two-factor/setup

   FLOW

   Session
      ↓
   Same-origin security check
      ↓
   Rate limit
      ↓
   Current password
      ↓
   Existing authenticator/recovery step-up
      (only if authenticator is already enabled)
      ↓
   Create session-bound setup context
      ↓
   Generate + hash Email OTP
      ↓
   Send OTP to verified account email
      ↓
   Return ONLY safe setup metadata
   ============================================================ */

export async function POST(
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
    return json(
      {
        success:
          false,

        code:
          'UNTRUSTED_SECURITY_REQUEST',

        error:
          'SaMi could not verify the origin of this security request.',
      },
      403
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
      '[Security] Email 2FA setup session lookup failed:',
      error
    );

    return json(
      {
        success:
          false,

        code:
          'EMAIL_TWO_FACTOR_SETUP_ERROR',

        error:
          'SaMi could not start email verification.',
      },
      500
    );
  }

  if (
    !session
  ) {
    return json(
      {
        success:
          false,

        code:
          'UNAUTHENTICATED',

        error:
          'Your SaMi session has expired. Sign in again to continue.',
      },
      401
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
    return json(
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

  const currentPassword =
    normalizePassword(
      body.currentPassword
    );

  const existingTwoFactorCode =
    normalizeTwoFactorCode(
      body.twoFactorCode
    );

  /* ==========================================================
     4. BASIC VALIDATION
     ========================================================== */

  if (
    !currentPassword
  ) {
    return json(
      {
        success:
          false,

        code:
          'PASSWORD_REQUIRED',

        error:
          'Enter your current password to enable email verification.',
      },
      400
    );
  }

  if (
    currentPassword.length >
      MAX_PASSWORD_LENGTH
  ) {
    return json(
      {
        success:
          false,

        code:
          'INVALID_CURRENT_PASSWORD',

        error:
          'Your current password is incorrect.',
      },
      401
    );
  }

  if (
    existingTwoFactorCode.length >
      MAX_TWO_FACTOR_CODE_LENGTH
  ) {
    return json(
      {
        success:
          false,

        code:
          'INVALID_TWO_FACTOR_CODE',

        error:
          'The verification code is invalid.',
      },
      400
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
        'email-2fa-setup',

      maxAttempts:
        RATE_LIMIT_MAX_ATTEMPTS,

      windowMs:
        RATE_LIMIT_WINDOW_MS,

      blockMs:
        RATE_LIMIT_BLOCK_MS,
    });

  if (
    !rateLimit.allowed
  ) {
    await safeRecordAuthEvent({
      request,

      userId,

      eventType:
        'EMAIL_TWO_FACTOR_SETUP_RATE_LIMITED',

      entityType:
        'user',

      entityId:
        userId,

      metadata: {
        retryAfterSeconds:
          rateLimit.retryAfterSeconds,
      },
    });

    return json(
      {
        success:
          false,

        code:
          'EMAIL_TWO_FACTOR_SETUP_RATE_LIMITED',

        error:
          'Too many security attempts. Wait before trying again.',

        retryAfterSeconds:
          rateLimit.retryAfterSeconds ??
          undefined,
      },
      429,
      rateLimit
        .retryAfterSeconds
        ? {
            'Retry-After':
              String(
                rateLimit.retryAfterSeconds
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
      await safeRecordAuthEvent({
        request,

        userId,

        eventType:
          'EMAIL_TWO_FACTOR_SETUP_BLOCKED',

        entityType:
          'user',

        entityId:
          userId,

        metadata: {
          reason:
            'account_unavailable',
        },
      });

      return json(
        {
          success:
            false,

          code:
            'ACCOUNT_NOT_AVAILABLE',

          error:
            'This SaMi account is not available for security changes.',
        },
        403
      );
    }

    /* ========================================================
       7. PASSWORD REAUTH AVAILABILITY
       ======================================================== */

    if (
      !user.password_hash
    ) {
      /*
       * Important:
       *
       * Google-only accounts currently have no local password
       * to reauthenticate against.
       *
       * Do not silently weaken the security requirement.
       * Provider reauthentication will be handled explicitly
       * in the federated-security flow.
       */
      return json(
        {
          success:
            false,

          code:
            'PASSWORD_REAUTH_UNAVAILABLE',

          error:
            'Password reauthentication is not available for this account yet.',
        },
        409
      );
    }

    /* ========================================================
       8. VERIFY CURRENT PASSWORD
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
          'EMAIL_TWO_FACTOR_SETUP_REAUTH_FAILED',

        entityType:
          'user',

        entityId:
          userId,

        metadata: {
          reason:
            'invalid_password',
        },
      });

      return json(
        {
          success:
            false,

          code:
            'INVALID_CURRENT_PASSWORD',

          error:
            'Your current password is incorrect.',
        },
        401
      );
    }

    /* ========================================================
       9. CURRENT VERIFICATION METHODS
       ======================================================== */

    const methodStatus =
      await getTwoFactorMethodStatus(
        userId
      );

    if (
      methodStatus.email
        .enabled
    ) {
      return json(
        {
          success:
            false,

          code:
            'EMAIL_TWO_FACTOR_ALREADY_ENABLED',

          error:
            'Email login verification is already enabled.',
        },
        409
      );
    }

    if (
      !methodStatus.email
        .verified
    ) {
      return json(
        {
          success:
            false,

          code:
            'EMAIL_NOT_VERIFIED',

          error:
            'Verify your SaMi email address before enabling email login verification.',
        },
        409
      );
    }

    /* ========================================================
       10. EXISTING AUTHENTICATOR STEP-UP

       If authenticator protection already exists, password
       alone must not be enough to add another verification
       method.

       Recovery codes remain valid emergency step-up credentials.
       ======================================================== */

    if (
      methodStatus
        .authenticator
        .enabled
    ) {
      if (
        !existingTwoFactorCode
      ) {
        return json(
          {
            success:
              false,

            code:
              'TWO_FACTOR_CODE_REQUIRED',

            error:
              'Enter your current authenticator code or an unused recovery code.',
          },
          400
        );
      }

      const validExistingFactor =
        await verifyUserTwoFactorCode({
          userId,

          code:
            existingTwoFactorCode,
        });

      if (
        !validExistingFactor
      ) {
        await safeRecordAuthEvent({
          request,

          userId,

          eventType:
            'EMAIL_TWO_FACTOR_SETUP_REAUTH_FAILED',

          entityType:
            'user',

          entityId:
            userId,

          metadata: {
            reason:
              'invalid_existing_two_factor',
          },
        });

        return json(
          {
            success:
              false,

            code:
              'INVALID_TWO_FACTOR_CODE',

            error:
              'The authenticator or recovery code is invalid.',
          },
          401
        );
      }
    }

    /* ========================================================
       11. CREATE SESSION-BOUND SETUP CONTEXT
       ======================================================== */

    const setupToken =
      createEmailTwoFactorContextToken();

    const context =
      buildSetupContext(
        session.sessionId,
        setupToken
      );

    /* ========================================================
       12. ISSUE OTP
       ======================================================== */

    const issued =
      await issueEmailTwoFactorCode({
        userId,

        purpose:
          'email_2fa_setup',

        context,

        /*
         * Bind issuance to the current account email observed
         * by this route.
         *
         * The OTP service independently verifies it against the
         * current database email.
         */
        email:
          user.email,
      });

    /* ========================================================
       13. DELIVER OTP
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
              'email_2fa_setup',

            expiresInMinutes:
              Math.max(
                1,
                Math.ceil(
                  issued.expiresInSeconds /
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
      /*
       * The database code must not remain usable when delivery
       * failed.
       *
       * Invalidation targets the exact issued OTP record.
       */
      await invalidateIssuedEmailTwoFactorCode({
        userId,

        codeId:
          issued.codeId,
      }).catch(
        (
          invalidationError
        ) => {
          console.error(
            '[Security] Failed to invalidate undelivered Email 2FA code:',
            invalidationError
          );
        }
      );

      console.error(
        '[Security] Email 2FA setup delivery failed:',
        error
      );

      await safeRecordAuthEvent({
        request,

        userId,

        eventType:
          'EMAIL_TWO_FACTOR_SETUP_DELIVERY_FAILED',

        entityType:
          'user',

        entityId:
          userId,

        metadata: {
          maskedEmail:
            issued.maskedEmail,
        },
      });

      return json(
        {
          success:
            false,

          code:
            'EMAIL_TWO_FACTOR_DELIVERY_FAILED',

          error:
            'SaMi could not send the verification code. Try again.',
        },
        503
      );
    }

    /* ========================================================
       14. AUDIT
       ======================================================== */

    await safeRecordAuthEvent({
      request,

      userId,

      eventType:
        'EMAIL_TWO_FACTOR_SETUP_STARTED',

      entityType:
        'user',

      entityId:
        userId,

      metadata: {
        maskedEmail:
          issued.maskedEmail,

        expiresAt:
          issued.expiresAt,

        authenticatorStepUp:
          methodStatus
            .authenticator
            .enabled,
      },
    });

    /* ========================================================
       15. RESPONSE

       NEVER RETURN:
       - OTP
       - OTP hash
       - codeId
       - database context hash
       ======================================================== */

    return json(
      {
        success:
          true,

        code:
          'EMAIL_TWO_FACTOR_SETUP_STARTED',

        message:
          'SaMi sent a verification code to your email.',

        setup: {
          setupToken,

          maskedEmail:
            issued.maskedEmail,

          expiresAt:
            issued.expiresAt,

          expiresInSeconds:
            issued.expiresInSeconds,

          resendCooldownSeconds:
            issued.resendCooldownSeconds,
        },
      }
    );
  } catch (error) {
    /* ========================================================
       16. EXPECTED EMAIL OTP ERROR
       ======================================================== */

    if (
      error instanceof
        EmailTwoFactorError
    ) {
      await safeRecordAuthEvent({
        request,

        userId,

        eventType:
          'EMAIL_TWO_FACTOR_SETUP_BLOCKED',

        entityType:
          'user',

        entityId:
          userId,

        metadata: {
          reason:
            error.code,
        },
      });

      return emailOtpErrorResponse(
        error
      );
    }

    /* ========================================================
       17. UNKNOWN ERROR
       ======================================================== */

    console.error(
      '[Security] Failed to start Email 2FA setup:',
      error
    );

    await safeRecordAuthEvent({
      request,

      userId,

      eventType:
        'EMAIL_TWO_FACTOR_SETUP_ERROR',

      entityType:
        'user',

      entityId:
        userId,

      metadata: {
        reason:
          'internal_error',
      },
    });

    return json(
      {
        success:
          false,

        code:
          'EMAIL_TWO_FACTOR_SETUP_ERROR',

        error:
          'SaMi could not start email verification. Try again.',
      },
      500
    );
  }
}