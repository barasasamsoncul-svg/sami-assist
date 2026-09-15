import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  requireAdminSession,
} from '@/lib/auth/admin-session';

import {
  cancelPlatformAdminEmailChange,
  getPendingPlatformAdminEmailChange,
  EmailChangeError,
} from '@/lib/account/email-change';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

   GET is read-only and does not require this check.

   DELETE mutates privileged administrator state and therefore
   must be same-origin.
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
       * Deployment configuration problems are not exposed to
       * the browser.
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
    transientCodes.has(
      code
    ) ||
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
   DOMAIN ERROR
   ============================================================ */

function getEmailChangeErrorStatus(
  error: EmailChangeError
): number {
  switch (error.code) {
    case 'IDENTITY_NOT_FOUND':
      return 404;

    case 'IDENTITY_UNAVAILABLE':
      return 403;

    case 'INVALID_NEW_EMAIL':
      return 400;

    case 'EMAIL_UNCHANGED':
      return 409;

    case 'EMAIL_UNAVAILABLE':
      return 409;

    case 'EMAIL_CHANGE_COOLDOWN':
      return 429;

    case 'INVALID_EMAIL_CHANGE_CODE':
      return 400;

    case 'EMAIL_CHANGE_EXPIRED':
      return 400;

    default:
      return 400;
  }
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
    console.error(
      '[Admin Email Change] Audit recording failed:',
      error
    );
  }
}

/* ============================================================
   GET
   /api/admin/account/email-change

   Returns only the CURRENT administrator's pending email-change
   state.

   Never returns:
   - raw verification code
   - code hash
   - request ID
   - another administrator's data
   ============================================================ */

export async function GET() {
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
      '[Admin Email Change] Pending-state session lookup failed:',
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

  try {
    const pending =
      await getPendingPlatformAdminEmailChange(
        session.adminId
      );

    return jsonResponse({
      success: true,

      code:
        'ADMIN_EMAIL_CHANGE_STATUS_LOADED',

      pending,
    });
  } catch (error) {
    if (
      error instanceof
      EmailChangeError
    ) {
      return errorResponse(
        getEmailChangeErrorStatus(
          error
        ),
        error.code,
        error.message,
        {
          retryAfterSeconds:
            error.retryAfterSeconds,
        }
      );
    }

    console.error(
      '[Admin Email Change] Failed to load pending email change:',
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
      'ADMIN_EMAIL_CHANGE_STATUS_ERROR',
      'SaMi could not load your administrator email-change status.'
    );
  }
}

/* ============================================================
   DELETE
   /api/admin/account/email-change

   Cancels the CURRENT administrator's pending primary-email
   change.

   This is deliberately idempotent.

   Calling DELETE when no pending request exists still returns
   success because the desired state is already true:

       no pending email change
   ============================================================ */

export async function DELETE(
  request: NextRequest
) {
  /* ==========================================================
     1. ORIGIN / CSRF
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
     2. SESSION
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
      '[Admin Email Change] Cancellation session lookup failed:',
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
     3. READ PENDING STATE FOR AUDIT

     This does not control authorization. It is used only so the
     audit event can safely identify which destination was
     cancelled without exposing a verification secret.
     ========================================================== */

  let previousPending:
    Awaited<
      ReturnType<
        typeof getPendingPlatformAdminEmailChange
      >
    > =
    null;

  try {
    previousPending =
      await getPendingPlatformAdminEmailChange(
        session.adminId
      );
  } catch (error) {
    if (
      error instanceof
      EmailChangeError
    ) {
      return errorResponse(
        getEmailChangeErrorStatus(
          error
        ),
        error.code,
        error.message
      );
    }

    console.error(
      '[Admin Email Change] Failed to resolve pending state before cancellation:',
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
      'ADMIN_EMAIL_CHANGE_CANCEL_ERROR',
      'SaMi could not cancel the administrator email change.'
    );
  }

  /* ==========================================================
     4. CANCEL
     ========================================================== */

  try {
    await cancelPlatformAdminEmailChange(
      session.adminId
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
          'ADMIN_EMAIL_CHANGE_CANCELLATION_FAILED',

        action:
          'platform_admin.email_change.cancel',

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

      return errorResponse(
        getEmailChangeErrorStatus(
          error
        ),
        error.code,
        error.message,
        {
          retryAfterSeconds:
            error.retryAfterSeconds,
        }
      );
    }

    console.error(
      '[Admin Email Change] Cancellation failed:',
      error
    );

    await safeAudit({
      request,

      adminId:
        session.adminId,

      sessionId:
        session.sessionId,

      eventType:
        'ADMIN_EMAIL_CHANGE_CANCELLATION_ERROR',

      action:
        'platform_admin.email_change.cancel',

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
      'ADMIN_EMAIL_CHANGE_CANCEL_ERROR',
      'SaMi could not cancel the administrator email change.'
    );
  }

  /* ==========================================================
     5. AUDIT SUCCESS

     No code/hash/request secret is recorded.
     ========================================================== */

  await safeAudit({
    request,

    adminId:
      session.adminId,

    sessionId:
      session.sessionId,

    eventType:
      'ADMIN_EMAIL_CHANGE_CANCELLED',

    action:
      'platform_admin.email_change.cancel',

    targetType:
      'platform_admin',

    targetId:
      session.adminId,

    successful:
      true,

    metadata: {
      hadPendingRequest:
        Boolean(
          previousPending
        ),

      cancelledEmail:
        previousPending
          ?.email ||
        null,
    },
  });

  /* ==========================================================
     6. SUCCESS

     Idempotent:
     no pending request is also a successful final state.
     ========================================================== */

  return jsonResponse({
    success: true,

    code:
      'ADMIN_EMAIL_CHANGE_CANCELLED',

    message:
      previousPending
        ? 'Your pending administrator email change has been cancelled.'
        : 'There is no pending administrator email change.',

    pending:
      null,
  });
}