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
  EmailTwoFactorError,
  hashEmailTwoFactorContext,
  invalidateIssuedEmailTwoFactorCode,
  issueEmailTwoFactorCode,
} from '@/lib/auth/email-two-factor';

import {
  getTwoFactorMethodStatus,
} from '@/lib/auth/two-factor-methods';

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

const MAX_SETUP_TOKEN_LENGTH =
  512;

const RESEND_RATE_LIMIT_MAX_ATTEMPTS =
  8;

const RESEND_RATE_LIMIT_WINDOW_MS =
  30 * 60 * 1000;

const RESEND_RATE_LIMIT_BLOCK_MS =
  15 * 60 * 1000;

/* ============================================================
   TYPES
   ============================================================ */

type ResendBody = {
  setupToken?: unknown;
};

type UserRow = {
  id: string;

  email: string;

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
  ResendBody | null
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
      ResendBody;
  } catch {
    return null;
  }
}

/* ============================================================
   SETUP TOKEN
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

function isValidSetupToken(
  value: string
) {
  return (
    value.length >
      0 &&
    value.length <=
      MAX_SETUP_TOKEN_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(
      value
    )
  );
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

   MUST MATCH setup/route.ts and confirm/route.ts.
   ============================================================ */

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
   RATE LIMIT
   ============================================================ */

function getRateLimitIdentifier(
  request:
    NextRequest,
  userId:
    string
) {
  const ip =
    getClientIp(
      request
    ) ||
    'unknown-ip';

  return `email-2fa-resend:${userId}:${ip}`;
}

/* ============================================================
   USER
   ============================================================ */

async function getUser(
  userId: string
): Promise<
  UserRow | null
> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          email,
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
    UserRow
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
   EXISTING SETUP PROOF
   ============================================================ */

/**
 * A resend must NEVER create an Email 2FA setup from nothing.
 *
 * setup/route.ts performs:
 *
 *   current password
 *       +
 *   existing 2FA step-up when required
 *
 * before creating the first email_2fa_setup OTP.
 *
 * Therefore this endpoint requires proof that this exact:
 *
 *   user
 *   + current session
 *   + setupToken
 *
 * already has a setup-code record.
 */
async function setupContextExists(
  userId: string,
  context: string
): Promise<boolean> {
  const contextHash =
    hashEmailTwoFactorContext(
      context
    );

  const result =
    await queryControl(
      `
        SELECT
          id

        FROM user_email_security_codes

        WHERE user_id = $1
          AND purpose = 'email_2fa_setup'
          AND context_hash = $2

        ORDER BY
          created_at DESC

        LIMIT 1
      `,
      [
        userId,
        contextHash,
      ]
    );

  return (
    result.rows.length >
    0
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
    console.error(
      '[Security] Failed to record Email 2FA resend event:',
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

    case 'EMAIL_NOT_VERIFIED':
      return errorResponse(
        409,
        error.code,
        error.message
      );

    case 'EMAIL_TWO_FACTOR_NOT_ENABLED':
      return errorResponse(
        409,
        error.code,
        error.message
      );

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
   POST
   /api/account/security/email-two-factor/resend

   FLOW

   Session
      ↓
   Same-origin check
      ↓
   Validate setup token
      ↓
   Rebuild session-bound setup context
      ↓
   Require an existing setup record for that exact context
      ↓
   Check method/account state
      ↓
   Coarse resend rate limit
      ↓
   Email OTP service enforces 60-second context cooldown
      ↓
   Old current OTP invalidated
      ↓
   New OTP issued
      ↓
   Send email
      ↓
   Return safe metadata only
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
      '[Security] Email 2FA resend session lookup failed:',
      error
    );

    return errorResponse(
      500,
      'EMAIL_TWO_FACTOR_RESEND_ERROR',
      'SaMi could not resend the verification code.'
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

  if (
    !isValidSetupToken(
      setupToken
    )
  ) {
    return errorResponse(
      400,
      'INVALID_EMAIL_TWO_FACTOR_SETUP',
      'The email verification setup is invalid. Start again.'
    );
  }

  /* ==========================================================
     4. BUILD SESSION-BOUND CONTEXT
     ========================================================== */

  const context =
    buildSetupContext(
      session.sessionId,
      setupToken
    );

  /* ==========================================================
     5. REQUIRE EXISTING SETUP CONTEXT

     CRITICAL:

     issueEmailTwoFactorCode() is intentionally a low-level
     issuance service.

     Without this check, an arbitrary setupToken could create a
     brand-new Email 2FA setup without going through the initial
     password / existing-2FA reauthentication.
     ========================================================== */

  let validSetupContext:
    boolean;

  try {
    validSetupContext =
      await setupContextExists(
        userId,
        context
      );
  } catch (error) {
    console.error(
      '[Security] Failed to validate Email 2FA setup context:',
      error
    );

    return errorResponse(
      500,
      'EMAIL_TWO_FACTOR_RESEND_ERROR',
      'SaMi could not validate this email verification setup.'
    );
  }

  if (
    !validSetupContext
  ) {
    await safeRecordAuthEvent({
      request,

      userId,

      eventType:
        'EMAIL_TWO_FACTOR_RESEND_BLOCKED',

      entityType:
        'user',

      entityId:
        userId,

      metadata: {
        reason:
          'unknown_setup_context',
      },
    });

    return errorResponse(
      410,
      'EMAIL_TWO_FACTOR_SETUP_UNAVAILABLE',
      'This email verification setup is no longer available. Start again.'
    );
  }

  /* ==========================================================
     6. CURRENT SECURITY STATUS
     ========================================================== */

  let methodStatus;

  try {
    methodStatus =
      await getTwoFactorMethodStatus(
        userId
      );
  } catch (error) {
    console.error(
      '[Security] Failed to load Email 2FA method status:',
      error
    );

    return errorResponse(
      500,
      'EMAIL_TWO_FACTOR_RESEND_ERROR',
      'SaMi could not resend the verification code.'
    );
  }

  if (
    methodStatus.email
      .enabled
  ) {
    return errorResponse(
      409,
      'EMAIL_TWO_FACTOR_ALREADY_ENABLED',
      'Email login verification is already enabled.'
    );
  }

  if (
    !methodStatus.email
      .verified
  ) {
    return errorResponse(
      409,
      'EMAIL_NOT_VERIFIED',
      'Verify your SaMi email address before enabling email login verification.'
    );
  }

  /* ==========================================================
     7. USER
     ========================================================== */

  const user =
    await getUser(
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

  /* ==========================================================
     8. COARSE RESEND RATE LIMIT

     This is separate from the OTP service's 60-second
     same-context cooldown.

     Do NOT reset this rate limit after successful resends.
     Otherwise repeated successful sends would defeat this
     longer-window abuse control.
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
        'email-2fa-resend',

      maxAttempts:
        RESEND_RATE_LIMIT_MAX_ATTEMPTS,

      windowMs:
        RESEND_RATE_LIMIT_WINDOW_MS,

      blockMs:
        RESEND_RATE_LIMIT_BLOCK_MS,
    });

  if (
    !rateLimit.allowed
  ) {
    await safeRecordAuthEvent({
      request,

      userId,

      eventType:
        'EMAIL_TWO_FACTOR_RESEND_RATE_LIMITED',

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
      'EMAIL_TWO_FACTOR_RESEND_RATE_LIMITED',
      'Too many verification-code requests. Wait before trying again.',
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
       9. ISSUE REPLACEMENT CODE

       issueEmailTwoFactorCode() will:

       - enforce the per-context cooldown
       - invalidate the previous current OTP
       - create a fresh six-digit OTP
       - store only its HMAC
       - preserve the same setup context
       ======================================================== */

    const issued =
      await issueEmailTwoFactorCode({
        userId,

        purpose:
          'email_2fa_setup',

        context,

        email:
          user.email,
      });

    /* ========================================================
       10. DELIVER
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
      /*
       * A code that was not successfully delivered must not
       * remain usable.
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
            '[Security] Failed to invalidate undelivered Email 2FA resend code:',
            invalidationError
          );
        }
      );

      console.error(
        '[Security] Email 2FA resend delivery failed:',
        error
      );

      await safeRecordAuthEvent({
        request,

        userId,

        eventType:
          'EMAIL_TWO_FACTOR_RESEND_DELIVERY_FAILED',

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
        'EMAIL_TWO_FACTOR_DELIVERY_FAILED',
        'SaMi could not send the verification code. Try again.'
      );
    }

    /* ========================================================
       11. AUDIT
       ======================================================== */

    await safeRecordAuthEvent({
      request,

      userId,

      eventType:
        'EMAIL_TWO_FACTOR_CODE_RESENT',

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

    /* ========================================================
       12. SAFE RESPONSE

       NEVER RETURN:
       - OTP
       - codeId
       - context
       - contextHash
       ======================================================== */

    return jsonResponse({
      success: true,

      code:
        'EMAIL_TWO_FACTOR_CODE_RESENT',

      message:
        'SaMi sent a new verification code to your email.',

      setup: {
        setupToken,

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
    });
  } catch (error) {
    /* ========================================================
       13. EXPECTED EMAIL OTP ERROR
       ======================================================== */

    if (
      error instanceof
        EmailTwoFactorError
    ) {
      await safeRecordAuthEvent({
        request,

        userId,

        eventType:
          'EMAIL_TWO_FACTOR_RESEND_BLOCKED',

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
       14. UNKNOWN ERROR
       ======================================================== */

    console.error(
      '[Security] Failed to resend Email 2FA code:',
      error
    );

    await safeRecordAuthEvent({
      request,

      userId,

      eventType:
        'EMAIL_TWO_FACTOR_RESEND_ERROR',

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
      'EMAIL_TWO_FACTOR_RESEND_ERROR',
      'SaMi could not resend the verification code. Try again.'
    );
  }
}