import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  requireAdminSession,
  revokeAllAdminSessions,
} from '@/lib/auth/admin-session';

import {
  verifyPlatformAdminEmailChange,
  EmailChangeError,
} from '@/lib/account/email-change';

import {
  checkRateLimit,
  resetRateLimit,
} from '@/lib/auth/rate-limit';

import {
  getAdminRequestIp,
} from '@/lib/auth/admin-session';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   CONSTANTS
   ============================================================ */

const CODE_LENGTH = 6;

const MAX_REQUEST_BODY_BYTES =
  8 * 1024;

const VERIFY_RATE_LIMIT_MAX_ATTEMPTS =
  8;

const VERIFY_RATE_LIMIT_WINDOW_MS =
  15 * 60 * 1000;

const VERIFY_RATE_LIMIT_BLOCK_MS =
  15 * 60 * 1000;

/* ============================================================
   TYPES
   ============================================================ */

type VerifyEmailChangeBody = {
  code?: unknown;
};

/* ============================================================
   RESPONSE
   ============================================================ */

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  extraHeaders?: Record<string, string>
) {
  return NextResponse.json(
    body,
    {
      status,

      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate, private',

        Pragma:
          'no-cache',

        Expires:
          '0',

        'Referrer-Policy':
          'no-referrer',

        'X-Content-Type-Options':
          'nosniff',

        ...extraHeaders,
      },
    }
  );
}

function errorResponse(
  status: number,
  code: string,
  error: string,
  extra?: Record<string, unknown>,
  headers?: Record<string, string>
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
   ORIGIN / CSRF PROTECTION
   ============================================================ */

function getAllowedOrigins(
  request: NextRequest
): Set<string> {
  const origins =
    new Set<string>();

  try {
    origins.add(
      request.nextUrl.origin
    );
  } catch {
    // Ignore malformed request origin.
  }

  const appUrl =
    process.env.APP_URL?.trim();

  if (appUrl) {
    try {
      origins.add(
        new URL(appUrl).origin
      );
    } catch {
      /*
       * APP_URL validation belongs to deployment/infrastructure.
       * Never expose configuration details here.
       */
    }
  }

  return origins;
}

function isTrustedBrowserRequest(
  request: NextRequest
): boolean {
  const origin =
    request.headers.get(
      'origin'
    );

  const secFetchSite =
    request.headers.get(
      'sec-fetch-site'
    );

  if (
    secFetchSite ===
    'cross-site'
  ) {
    return false;
  }

  if (origin) {
    try {
      return getAllowedOrigins(
        request
      ).has(
        new URL(origin).origin
      );
    } catch {
      return false;
    }
  }

  if (secFetchSite) {
    return (
      secFetchSite ===
        'same-origin' ||
      secFetchSite ===
        'none'
    );
  }

  return true;
}

/* ============================================================
   REQUEST SIZE
   ============================================================ */

function hasOversizedBody(
  request: NextRequest
): boolean {
  const raw =
    request.headers.get(
      'content-length'
    );

  if (!raw) {
    return false;
  }

  const length =
    Number(raw);

  return (
    Number.isFinite(length) &&
    length >
      MAX_REQUEST_BODY_BYTES
  );
}

/* ============================================================
   CODE
   ============================================================ */

function normalizeCode(
  value: string
): string {
  return value.trim();
}

function isValidCode(
  value: string
): boolean {
  return new RegExp(
    `^\\d{${CODE_LENGTH}}$`
  ).test(value);
}

/* ============================================================
   RATE LIMIT
   ============================================================ */

function rateLimitIdentifier(
  request: NextRequest,
  adminId: string
): string {
  const ip =
    getAdminRequestIp(
      request
    ) ||
    'unknown-ip';

  return [
    'admin-email-change-verify',
    adminId,
    ip,
  ].join(':');
}

/* ============================================================
   EMAIL CHANGE ERROR
   ============================================================ */

function getEmailChangeErrorStatus(
  error: EmailChangeError
): number {
  switch (error.code) {
    case 'INVALID_EMAIL_CHANGE_CODE':
      return 400;

    case 'EMAIL_CHANGE_EXPIRED':
      return 400;

    case 'EMAIL_UNAVAILABLE':
      return 409;

    case 'INVALID_NEW_EMAIL':
      return 400;

    case 'EMAIL_UNCHANGED':
      return 409;

    case 'EMAIL_CHANGE_COOLDOWN':
      return 429;

    case 'IDENTITY_NOT_FOUND':
      return 404;

    case 'IDENTITY_UNAVAILABLE':
      return 403;

    default:
      return 400;
  }
}

/* ============================================================
   INFRASTRUCTURE
   ============================================================ */

function isTransientInfrastructureError(
  error: unknown
): boolean {
  if (
    !error ||
    typeof error !== 'object'
  ) {
    return false;
  }

  const candidate =
    error as {
      code?: unknown;
      message?: unknown;
    };

  const code =
    typeof candidate.code ===
    'string'
      ? candidate.code
      : '';

  const message =
    typeof candidate.message ===
    'string'
      ? candidate.message
          .toLowerCase()
      : '';

  const transientCodes =
    new Set([
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'EHOSTUNREACH',
      'ENETUNREACH',

      '08000',
      '08001',
      '08003',
      '08004',
      '08006',
      '08007',
      '08P01',

      '57P01',
      '57P02',
      '57P03',
    ]);

  return (
    transientCodes.has(code) ||
    message.includes(
      'connection terminated'
    ) ||
    message.includes(
      'connection refused'
    ) ||
    message.includes(
      'connection reset'
    ) ||
    message.includes(
      'timed out'
    ) ||
    message.includes(
      'timeout'
    ) ||
    message.includes(
      'server closed the connection'
    ) ||
    message.includes(
      'database is unavailable'
    )
  );
}

/* ============================================================
   SAFE AUDIT
   ============================================================ */

async function safeAudit(
  input: Parameters<
    typeof recordAdminAuditEvent
  >[0]
) {
  try {
    await recordAdminAuditEvent(
      input
    );
  } catch (error) {
    /*
     * A completed identity operation must not be rolled back or
     * reported as failed merely because audit persistence failed.
     */
    console.error(
      '[Admin Email Change Verify] Audit recording failed:',
      error
    );
  }
}

/* ============================================================
   POST
   /api/admin/account/email-change/verify

   Security flow:

   authenticated administrator
           ↓
   same-origin request
           ↓
   strict six-digit code
           ↓
   verification rate limit
           ↓
   shared atomic email-change engine
           ↓
   primary admin identity changes
           ↓
   new email becomes verified
           ↓
   challenge becomes consumed
           ↓
   ALL admin sessions revoked
           ↓
   fresh authentication required

   The browser never supplies adminId.
   ============================================================ */

export async function POST(
  request: NextRequest
) {
  /* ==========================================================
     1. ORIGIN
     ========================================================== */

  if (
    !isTrustedBrowserRequest(
      request
    )
  ) {
    return errorResponse(
      403,
      'UNTRUSTED_REQUEST',
      'This administrator request could not be verified.'
    );
  }

  /* ==========================================================
     2. REQUEST SIZE
     ========================================================== */

  if (
    hasOversizedBody(
      request
    )
  ) {
    return errorResponse(
      413,
      'REQUEST_TOO_LARGE',
      'The request is too large.'
    );
  }

  /* ==========================================================
     3. CONTENT TYPE
     ========================================================== */

  const contentType =
    request.headers.get(
      'content-type'
    ) || '';

  if (
    !contentType
      .toLowerCase()
      .startsWith(
        'application/json'
      )
  ) {
    return errorResponse(
      415,
      'UNSUPPORTED_CONTENT_TYPE',
      'This endpoint requires a JSON request.'
    );
  }

  /* ==========================================================
     4. SESSION
     ========================================================== */

  let session;

  try {
    session =
      await requireAdminSession();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        'ADMIN_UNAUTHENTICATED'
    ) {
      return errorResponse(
        401,
        'ADMIN_UNAUTHENTICATED',
        'Your administrator session has expired. Sign in again.'
      );
    }

    console.error(
      '[Admin Email Change Verify] Session lookup failed:',
      error
    );

    if (
      isTransientInfrastructureError(
        error
      )
    ) {
      return errorResponse(
        503,
        'SERVICE_TEMPORARILY_UNAVAILABLE',
        'SaMi administrator services are temporarily unavailable.',
        {
          retryable: true,
        },
        {
          'Retry-After':
            '30',
        }
      );
    }

    return errorResponse(
      500,
      'ADMIN_SESSION_ERROR',
      'SaMi could not verify your administrator session.'
    );
  }

  /* ==========================================================
     5. BODY
     ========================================================== */

  let body:
    VerifyEmailChangeBody;

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
        VerifyEmailChangeBody;
  } catch {
    return errorResponse(
      400,
      'INVALID_REQUEST',
      'Invalid request body.'
    );
  }

  /* ==========================================================
     6. CODE
     ========================================================== */

  if (
    typeof body.code !==
    'string'
  ) {
    return errorResponse(
      400,
      'INVALID_EMAIL_CHANGE_CODE',
      'Enter the complete 6-digit verification code.',
      {
        field:
          'code',
      }
    );
  }

  const code =
    normalizeCode(
      body.code
    );

  if (
    !isValidCode(
      code
    )
  ) {
    return errorResponse(
      400,
      'INVALID_EMAIL_CHANGE_CODE',
      'Enter the complete 6-digit verification code.',
      {
        field:
          'code',
      }
    );
  }

  /* ==========================================================
     7. RATE LIMIT
     ========================================================== */

  const rateLimitKey =
    rateLimitIdentifier(
      request,
      session.adminId
    );

  let rateLimit;

  try {
    rateLimit =
      await checkRateLimit({
        identifier:
          rateLimitKey,

        action:
          'admin-email-change-verify',

        maxAttempts:
          VERIFY_RATE_LIMIT_MAX_ATTEMPTS,

        windowMs:
          VERIFY_RATE_LIMIT_WINDOW_MS,

        blockMs:
          VERIFY_RATE_LIMIT_BLOCK_MS,
      });
  } catch (error) {
    console.error(
      '[Admin Email Change Verify] Rate-limit lookup failed:',
      error
    );

    return errorResponse(
      isTransientInfrastructureError(
        error
      )
        ? 503
        : 500,

      isTransientInfrastructureError(
        error
      )
        ? 'SERVICE_TEMPORARILY_UNAVAILABLE'
        : 'ADMIN_EMAIL_CHANGE_VERIFY_ERROR',

      isTransientInfrastructureError(
        error
      )
        ? 'SaMi administrator services are temporarily unavailable.'
        : 'SaMi could not verify the administrator email change.',

      isTransientInfrastructureError(
        error
      )
        ? {
            retryable: true,
          }
        : undefined,

      isTransientInfrastructureError(
        error
      )
        ? {
            'Retry-After':
              '30',
          }
        : undefined
    );
  }

  if (
    !rateLimit.allowed
  ) {
    await safeAudit({
      request,

      adminId:
        session.adminId,

      sessionId:
        session.sessionId,

      eventType:
        'ADMIN_EMAIL_CHANGE_VERIFICATION_RATE_LIMITED',

      action:
        'platform_admin.email_change.verify',

      targetType:
        'platform_admin',

      targetId:
        session.adminId,

      successful:
        false,

      failureReason:
        'RATE_LIMITED',

      metadata: {
        retryAfterSeconds:
          rateLimit
            .retryAfterSeconds,
      },
    });

    const retryAfterSeconds =
      Math.max(
        1,
        Number(
          rateLimit
            .retryAfterSeconds ||
            60
        )
      );

    return errorResponse(
      429,
      'ADMIN_EMAIL_CHANGE_VERIFICATION_RATE_LIMITED',
      'Too many verification attempts. Please wait before trying again.',
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

  /* ==========================================================
     8. VERIFY AND CHANGE IDENTITY
     ========================================================== */

  const previousEmail =
    session.email;

  let account;

  try {
    account =
      await verifyPlatformAdminEmailChange(
        session.adminId,
        code
      );
  } catch (error) {
    if (
      error instanceof
      EmailChangeError
    ) {
      await safeAudit({
        request,

        adminId:
          session.adminId,

        sessionId:
          session.sessionId,

        eventType:
          'ADMIN_EMAIL_CHANGE_VERIFICATION_FAILED',

        action:
          'platform_admin.email_change.verify',

        targetType:
          'platform_admin',

        targetId:
          session.adminId,

        successful:
          false,

        failureReason:
          error.code,

        metadata: {},
      });

      const status =
        getEmailChangeErrorStatus(
          error
        );

      return errorResponse(
        status,
        error.code,
        error.message,
        {
          field:
            error.code ===
              'INVALID_EMAIL_CHANGE_CODE'
              ? 'code'
              : undefined,

          retryAfterSeconds:
            error.retryAfterSeconds,
        },
        status === 429 &&
        error.retryAfterSeconds
          ? {
              'Retry-After':
                String(
                  Math.max(
                    1,
                    error
                      .retryAfterSeconds
                  )
                ),
            }
          : undefined
      );
    }

    console.error(
      '[Admin Email Change Verify] Verification failed:',
      error
    );

    await safeAudit({
      request,

      adminId:
        session.adminId,

      sessionId:
        session.sessionId,

      eventType:
        'ADMIN_EMAIL_CHANGE_VERIFICATION_ERROR',

      action:
        'platform_admin.email_change.verify',

      targetType:
        'platform_admin',

      targetId:
        session.adminId,

      successful:
        false,

      failureReason:
        'INTERNAL_ERROR',

      metadata: {},
    });

    if (
      isTransientInfrastructureError(
        error
      )
    ) {
      return errorResponse(
        503,
        'SERVICE_TEMPORARILY_UNAVAILABLE',
        'SaMi administrator services are temporarily unavailable.',
        {
          retryable: true,
        },
        {
          'Retry-After':
            '30',
        }
      );
    }

    return errorResponse(
      500,
      'ADMIN_EMAIL_CHANGE_VERIFY_ERROR',
      'SaMi could not verify the administrator email change.'
    );
  }

  /* ==========================================================
     9. EMAIL IS NOW CHANGED

     From this point onward the identity transition has already
     committed.

     Cleanup failures MUST NOT make the API claim that the email
     change itself failed.
     ========================================================== */

  /* ==========================================================
     10. RESET VERIFICATION RATE LIMIT
     ========================================================== */

  try {
    await resetRateLimit(
      rateLimitKey,
      'admin-email-change-verify'
    );
  } catch (error) {
    console.error(
      '[Admin Email Change Verify] Failed to reset rate limit after successful verification:',
      error
    );
  }

  /* ==========================================================
     11. REVOKE ALL ADMINISTRATOR SESSIONS

     Primary email is an administrator authentication identity.

     After changing it, every existing admin session is invalidated,
     including the session that performed the change.

     The administrator must authenticate again using the NEW email.
     ========================================================== */

  let revokedSessions:
    number | null =
    null;

  try {
    revokedSessions =
      await revokeAllAdminSessions(
        session.adminId,
        session.adminId,
        'primary_email_changed'
      );
  } catch (error) {
    /*
     * IMPORTANT:
     *
     * The email has already changed.
     *
     * Do not tell the browser the email change failed.
     *
     * But this is a security-significant cleanup failure and must
     * be surfaced internally.
     */
    console.error(
      '[Admin Email Change Verify] CRITICAL: email changed but session revocation failed:',
      error
    );

    await safeAudit({
      request,

      adminId:
        session.adminId,

      sessionId:
        session.sessionId,

      eventType:
        'ADMIN_EMAIL_CHANGED_SESSION_REVOCATION_FAILED',

      action:
        'platform_admin.email_change.session_cleanup',

      targetType:
        'platform_admin',

      targetId:
        session.adminId,

      successful:
        false,

      failureReason:
        'SESSION_REVOCATION_FAILED',

      metadata: {
        previousEmail,
        newEmail:
          account.email,
      },
    });
  }

  /* ==========================================================
     12. AUDIT SUCCESS
     ========================================================== */

  await safeAudit({
    request,

    adminId:
      session.adminId,

    sessionId:
      session.sessionId,

    eventType:
      'ADMIN_EMAIL_CHANGED',

    action:
      'platform_admin.email_change.verify',

    targetType:
      'platform_admin',

    targetId:
      session.adminId,

    successful:
      true,

    metadata: {
      previousEmail,

      newEmail:
        account.email,

      emailVerified:
        account.emailVerified,

      sessionsRevoked:
        revokedSessions,
    },
  });

  /* ==========================================================
     13. RESPONSE

     The current session is no longer trusted after a privileged
     identity change.

     UI should show SaMiOverlay and redirect to admin login.
     ========================================================== */

  return jsonResponse({
    success:
      true,

    code:
      'ADMIN_EMAIL_CHANGED',

    message:
      'Your administrator email has been updated. Sign in again using your new email address.',

    account,

    sessionInvalidated:
      true,

    next:
      '/admin/login?reason=email_changed',
  });
}