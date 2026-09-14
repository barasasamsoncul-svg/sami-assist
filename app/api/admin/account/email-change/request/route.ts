import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  requireAdminSession,
} from '@/lib/auth/admin-session';

import {
  requestPlatformAdminEmailChange,
  cancelPlatformAdminEmailChangeRequest,
  getPlatformAdminEmailAccount,
  EmailChangeError,
} from '@/lib/account/email-change';

import {
  sendEmailChangeVerificationEmail,
} from '@/lib/services/email';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   CONSTANTS
   ============================================================ */

const EMAIL_CHANGE_EXPIRY_MINUTES =
  15;

const EMAIL_CHANGE_RESEND_SECONDS =
  60;

const MAX_BODY_BYTES =
  8 * 1024;

/* ============================================================
   TYPES
   ============================================================ */

type RequestBody = {
  email?:
    unknown;
};

/* ============================================================
   RESPONSE
   ============================================================ */

function jsonResponse(
  body:
    Record<string, unknown>,
  status =
    200,
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

        'X-Content-Type-Options':
          'nosniff',

        ...extraHeaders,
      },
    }
  );
}

/* ============================================================
   ORIGIN / CSRF
   ============================================================ */

function getAllowedOrigins(
  request:
    NextRequest
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
    process.env.APP_URL
      ?.trim();

  if (
    appUrl
  ) {
    try {
      origins.add(
        new URL(
          appUrl
        ).origin
      );
    } catch {
      /*
       * APP_URL validation belongs to deployment validation.
       */
    }
  }

  return origins;
}

function isTrustedMutationRequest(
  request:
    NextRequest
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

  if (
    origin
  ) {
    try {
      return getAllowedOrigins(
        request
      ).has(
        new URL(
          origin
        ).origin
      );
    } catch {
      return false;
    }
  }

  if (
    secFetchSite
  ) {
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
   AUDIT
   ============================================================ */

async function safeRecordAudit(
  input:
    Parameters<
      typeof recordAdminAuditEvent
    >[0]
) {
  try {
    await recordAdminAuditEvent(
      input
    );
  } catch (
    error
  ) {
    console.error(
      '[Admin Email Change] Audit event failed:',
      error instanceof
        Error
        ? error.message
        : 'Unknown audit error'
    );
  }
}

/* ============================================================
   DATABASE AVAILABILITY
   ============================================================ */

function isDatabaseAvailabilityError(
  error:
    unknown
): boolean {
  if (
    !error ||
    typeof error !==
      'object'
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
      'database is unavailable'
    ) ||
    message.includes(
      'server closed the connection'
    )
  );
}

/* ============================================================
   EMAIL CHANGE ERROR
   ============================================================ */

function getEmailChangeErrorStatus(
  error:
    EmailChangeError
): number {
  switch (
    error.code
  ) {
    case 'INVALID_NEW_EMAIL':
      return 400;

    case 'EMAIL_UNCHANGED':
      return 409;

    case 'EMAIL_UNAVAILABLE':
      return 409;

    case 'EMAIL_CHANGE_COOLDOWN':
      return 429;

    case 'IDENTITY_NOT_FOUND':
      return 404;

    case 'IDENTITY_UNAVAILABLE':
      return 409;

    default:
      return 400;
  }
}

/* ============================================================
   POST
   /api/admin/account/email-change/request
   ============================================================ */

export async function POST(
  request:
    NextRequest
) {
  let adminId:
    string | null =
    null;

  let sessionId:
    string | null =
    null;

  try {
    /* ========================================================
       1. ORIGIN
       ======================================================== */

    if (
      !isTrustedMutationRequest(
        request
      )
    ) {
      await safeRecordAudit({
        request,

        eventType:
          'admin.identity.email_change_denied',

        action:
          'request_admin_email_change',

        targetType:
          'platform_admin',

        successful:
          false,

        failureReason:
          'untrusted_origin',
      });

      return jsonResponse(
        {
          success:
            false,

          code:
            'UNTRUSTED_REQUEST',

          error:
            'This administrator request could not be verified.',
        },
        403
      );
    }

    /* ========================================================
       2. SESSION
       ======================================================== */

    const session =
      await requireAdminSession();

    adminId =
      session.adminId;

    sessionId =
      session.sessionId;

    /*
     * Email changes belong to the administrator's own identity.
     * This is deliberately not a "Super Admin changes somebody
     * else's email" endpoint.
     */
    if (
      session.status !==
        'active' ||
      !session.emailVerified
    ) {
      return jsonResponse(
        {
          success:
            false,

          code:
            'ADMIN_SECURITY_REQUIREMENTS_NOT_MET',

          error:
            'Your administrator account cannot change its email address.',
        },
        403
      );
    }

    /* ========================================================
       3. CONTENT TYPE
       ======================================================== */

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
      return jsonResponse(
        {
          success:
            false,

          code:
            'UNSUPPORTED_CONTENT_TYPE',

          error:
            'This endpoint requires a JSON request.',
        },
        415
      );
    }

    /* ========================================================
       4. BODY SIZE
       ======================================================== */

    const contentLength =
      Number(
        request.headers.get(
          'content-length'
        ) ||
          0
      );

    if (
      Number.isFinite(
        contentLength
      ) &&
      contentLength >
        MAX_BODY_BYTES
    ) {
      return jsonResponse(
        {
          success:
            false,

          code:
            'REQUEST_TOO_LARGE',

          error:
            'The request is too large.',
        },
        413
      );
    }

    /* ========================================================
       5. BODY
       ======================================================== */

    let body:
      RequestBody;

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
          RequestBody;
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

    if (
      typeof body.email !==
        'string'
    ) {
      return jsonResponse(
        {
          success:
            false,

          code:
            'INVALID_NEW_EMAIL',

          error:
            'Enter a valid email address.',

          field:
            'email',
        },
        400
      );
    }

    const requestedEmail =
      body.email
        .trim()
        .toLowerCase();

    /* ========================================================
       6. CURRENT ADMIN ACCOUNT
       ======================================================== */

    const account =
      await getPlatformAdminEmailAccount(
        session.adminId
      );

    /*
     * Fail closed if session state somehow diverged from the
     * current identity record.
     */
    if (
      account.status !==
        'active' ||
      !account.emailVerified
    ) {
      return jsonResponse(
        {
          success:
            false,

          code:
            'ADMIN_SECURITY_REQUIREMENTS_NOT_MET',

          error:
            'Your administrator account cannot change its email address.',
        },
        403
      );
    }

    /* ========================================================
       7. CREATE EMAIL CHANGE REQUEST
       ======================================================== */

    let changeRequest;

    try {
      changeRequest =
        await requestPlatformAdminEmailChange(
          session.adminId,
          requestedEmail
        );
    } catch (
      error
    ) {
      if (
        error instanceof
          EmailChangeError
      ) {
        await safeRecordAudit({
          request,

          adminId:
            session.adminId,

          sessionId:
            session.sessionId,

          eventType:
            'admin.identity.email_change_request_rejected',

          action:
            'request_admin_email_change',

          targetType:
            'platform_admin',

          targetId:
            session.adminId,

          successful:
            false,

          failureReason:
            error.code,

          metadata: {
            requestedEmail,
          },
        });

        return jsonResponse(
          {
            success:
              false,

            code:
              error.code,

            error:
              error.message,

            field:
              error.code ===
                'INVALID_NEW_EMAIL'
                ? 'email'
                : undefined,

            retryAfterSeconds:
              error.retryAfterSeconds,
          },
          getEmailChangeErrorStatus(
            error
          ),
          error.code ===
            'EMAIL_CHANGE_COOLDOWN' &&
          error.retryAfterSeconds
            ? {
                'Retry-After':
                  String(
                    error.retryAfterSeconds
                  ),
              }
            : undefined
        );
      }

      throw error;
    }

    /* ========================================================
       8. DELIVER VERIFICATION CODE

       Only this exact request is cancelled if delivery fails.
       We never broadly cancel a newer concurrent request.
       ======================================================== */

    try {
      const delivery =
        await sendEmailChangeVerificationEmail(
          changeRequest.email,
          changeRequest.code,

          account.firstName ||
            account.fullName ||
            'Platform Administrator',

          {
            expiresInMinutes:
              EMAIL_CHANGE_EXPIRY_MINUTES,

            audience:
              'platform_admin',
          }
        );

      if (
        !delivery.success
      ) {
        try {
          await cancelPlatformAdminEmailChangeRequest(
            session.adminId,
            changeRequest.requestId
          );
        } catch (
          cleanupError
        ) {
          console.error(
            '[Admin Email Change] Failed to invalidate undelivered request:',
            cleanupError instanceof
              Error
              ? cleanupError.message
              : 'Unknown cleanup error'
          );
        }

        await safeRecordAudit({
          request,

          adminId:
            session.adminId,

          sessionId:
            session.sessionId,

          eventType:
            'admin.identity.email_change_delivery_failed',

          action:
            'request_admin_email_change',

          targetType:
            'platform_admin',

          targetId:
            session.adminId,

          successful:
            false,

          failureReason:
            'delivery_unavailable',

          metadata: {
            requestedEmail:
              changeRequest.email,
          },
        });

        return jsonResponse(
          {
            success:
              false,

            code:
              'EMAIL_CHANGE_DELIVERY_UNAVAILABLE',

            error:
              'SaMi could not send the verification code. Please try again.',
          },
          503,
          {
            'Retry-After':
              '30',
          }
        );
      }
    } catch (
      error
    ) {
      /*
       * The email service threw after the request was created.
       * Invalidate exactly this request.
       */
      try {
        await cancelPlatformAdminEmailChangeRequest(
          session.adminId,
          changeRequest.requestId
        );
      } catch (
        cleanupError
      ) {
        console.error(
          '[Admin Email Change] Failed to invalidate request after email error:',
          cleanupError instanceof
            Error
            ? cleanupError.message
            : 'Unknown cleanup error'
        );
      }

      console.error(
        '[Admin Email Change] Verification email delivery failed:',
        error instanceof
          Error
          ? error.message
          : 'Unknown delivery error'
      );

      await safeRecordAudit({
        request,

        adminId:
          session.adminId,

        sessionId:
          session.sessionId,

        eventType:
          'admin.identity.email_change_delivery_failed',

        action:
          'request_admin_email_change',

        targetType:
          'platform_admin',

        targetId:
          session.adminId,

        successful:
          false,

        failureReason:
          'delivery_error',

        metadata: {
          requestedEmail:
            changeRequest.email,
        },
      });

      return jsonResponse(
        {
          success:
            false,

          code:
            'EMAIL_CHANGE_DELIVERY_ERROR',

          error:
            'SaMi could not send the verification code. Please try again.',
        },
        503,
        {
          'Retry-After':
            '30',
        }
      );
    }

    /* ========================================================
       9. SUCCESS AUDIT
       ======================================================== */

    await safeRecordAudit({
      request,

      adminId:
        session.adminId,

      sessionId:
        session.sessionId,

      eventType:
        'admin.identity.email_change_requested',

      action:
        'request_admin_email_change',

      targetType:
        'platform_admin',

      targetId:
        session.adminId,

      successful:
        true,

      metadata: {
        currentEmail:
          account.email,

        requestedEmail:
          changeRequest.email,

        expiresAt:
          changeRequest.expiresAt,
      },
    });

    /* ========================================================
       10. SAFE RESPONSE

       Never return:
       - code
       - code hash
       - requestId
       ======================================================== */

    return jsonResponse({
      success:
        true,

      code:
        'EMAIL_CHANGE_CODE_SENT',

      message:
        'A verification code has been sent to your new email address.',

      pending: {
        email:
          changeRequest.email,

        expiresAt:
          changeRequest.expiresAt,

        canResendInSeconds:
          EMAIL_CHANGE_RESEND_SECONDS,
      },
    });
  } catch (
    error
  ) {
    /* ========================================================
       SESSION
       ======================================================== */

    if (
      error instanceof
        Error &&
      error.message ===
        'ADMIN_UNAUTHENTICATED'
    ) {
      return jsonResponse(
        {
          success:
            false,

          code:
            'ADMIN_UNAUTHENTICATED',

          error:
            'Administrator authentication is required.',
        },
        401
      );
    }

    /* ========================================================
       CONTROLLED DOMAIN FAILURE
       ======================================================== */

    if (
      error instanceof
        EmailChangeError
    ) {
      return jsonResponse(
        {
          success:
            false,

          code:
            error.code,

          error:
            error.message,

          retryAfterSeconds:
            error.retryAfterSeconds,
        },
        getEmailChangeErrorStatus(
          error
        )
      );
    }

    /* ========================================================
       INFRASTRUCTURE
       ======================================================== */

    if (
      isDatabaseAvailabilityError(
        error
      )
    ) {
      console.error(
        '[Admin Email Change] Database temporarily unavailable:',
        error instanceof
          Error
          ? error.message
          : 'Unknown database availability error'
      );

      if (
        adminId
      ) {
        await safeRecordAudit({
          request,

          adminId,

          sessionId,

          eventType:
            'admin.identity.email_change_failed',

          action:
            'request_admin_email_change',

          targetType:
            'platform_admin',

          targetId:
            adminId,

          successful:
            false,

          failureReason:
            'service_unavailable',
        });
      }

      return jsonResponse(
        {
          success:
            false,

          code:
            'SERVICE_TEMPORARILY_UNAVAILABLE',

          error:
            'SaMi is temporarily unable to start the email change.',
        },
        503,
        {
          'Retry-After':
            '30',
        }
      );
    }

    /* ========================================================
       UNKNOWN
       ======================================================== */

    console.error(
      '[Admin Email Change] Request failed:',
      error instanceof
        Error
        ? error.message
        : 'Unknown email-change error'
    );

    return jsonResponse(
      {
        success:
          false,

        code:
          'EMAIL_CHANGE_REQUEST_ERROR',

        error:
          'SaMi could not start the email change.',
      },
      500
    );
  }
}