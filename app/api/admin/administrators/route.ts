import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  requireAdminRole,
} from '@/lib/auth/admin-session';

import {
  provisionPlatformAdmin,
} from '@/lib/auth/admin-provisioning';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   TYPES
   ============================================================ */

type CreateAdministratorBody = {
  firstName?:
    unknown;

  lastName?:
    unknown;

  email?:
    unknown;

  role?:
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
   ORIGIN / CSRF PROTECTION

   The administrator session cookie uses SameSite=Strict, but
   privileged state-changing routes should still reject requests
   originating from an unexpected website.

   We allow:
   - the request's own origin
   - APP_URL origin, when configured

   Same-origin browser requests therefore work locally and in
   production without hardcoding localhost or a future domain.
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
       * Environment validation should eventually happen during
       * application startup/deployment validation.
       *
       * Do not crash this request merely because APP_URL is
       * malformed when request.nextUrl.origin is still usable.
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

  /*
   * Explicit cross-site browser requests are never accepted.
   */
  if (
    secFetchSite ===
      'cross-site'
  ) {
    return false;
  }

  /*
   * Browsers normally send Origin for fetch POST requests.
   *
   * When supplied, it must exactly match one of our known
   * application origins.
   */
  if (
    origin
  ) {
    const allowedOrigins =
      getAllowedOrigins(
        request
      );

    try {
      const normalizedOrigin =
        new URL(
          origin
        ).origin;

      return allowedOrigins.has(
        normalizedOrigin
      );
    } catch {
      return false;
    }
  }

  /*
   * Requests without Origin can occur in some same-origin or
   * non-browser contexts.
   *
   * If Sec-Fetch-Site explicitly says same-origin, allow it.
   *
   * We do not allow "same-site" for this privileged admin write
   * because another subdomain should not automatically inherit
   * authority to provision SaMi Platform Administrators.
   */
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

  /*
   * Fall back to allowing requests where browser fetch metadata
   * is unavailable. Authentication + authorization still apply.
   *
   * This preserves compatibility with development/testing tools
   * while Origin-bearing cross-site browser requests remain
   * blocked.
   */
  return true;
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
      code?:
        unknown;

      message?:
        unknown;

      cause?:
        unknown;
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

      /*
       * PostgreSQL connection exception class.
       */
      '08000',
      '08001',
      '08003',
      '08004',
      '08006',
      '08007',
      '08P01',

      /*
       * PostgreSQL server shutdown / unavailable.
       */
      '57P01',
      '57P02',
      '57P03',
    ]);

  if (
    transientCodes.has(
      code
    )
  ) {
    return true;
  }

  return (
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
    ) ||
    message.includes(
      'cannot connect'
    )
  );
}

/* ============================================================
   SAFE AUDIT

   Audit persistence failure must not replace the primary API
   result.
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
      '[Admin Administrators API] Audit event failed:',
      error instanceof
        Error
        ? error.message
        : 'Unknown audit error'
    );
  }
}

/* ============================================================
   POST /api/admin/administrators

   Provision a Platform Administrator.

   CATEGORY 1 SECURITY RULE:
   Only super_admin may provision another platform identity.

   Category 8 will later introduce the complete fine-grained
   roles/permissions administration model.
   ============================================================ */

export async function POST(
  request:
    NextRequest
) {
  let actorAdminId:
    string | null =
    null;

  let actorSessionId:
    string | null =
    null;

  try {
    /* ========================================================
       1. CSRF / ORIGIN BOUNDARY
       ======================================================== */

    if (
      !isTrustedMutationRequest(
        request
      )
    ) {
      await safeRecordAudit({
        request,

        eventType:
          'admin.identity.provision_denied',

        action:
          'provision_platform_admin',

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
       2. AUTHENTICATION + AUTHORIZATION

       Never accept actorAdminId / actorRole from the browser.
       ======================================================== */

    const session =
      await requireAdminRole([
        'super_admin',
      ]);

    actorAdminId =
      session.adminId;

    actorSessionId =
      session.sessionId;

    /*
     * requireAdminSession() already resolves only an active
     * platform_admin session, but these checks deliberately make
     * this privileged route fail closed if session semantics are
     * later changed.
     */
    if (
      session.status !==
        'active' ||
      !session.emailVerified
    ) {
      await safeRecordAudit({
        request,

        adminId:
          session.adminId,

        sessionId:
          session.sessionId,

        eventType:
          'admin.identity.provision_denied',

        action:
          'provision_platform_admin',

        targetType:
          'platform_admin',

        successful:
          false,

        failureReason:
          'actor_security_state_invalid',

        metadata: {
          actorRole:
            session.role,

          actorStatus:
            session.status,

          actorEmailVerified:
            session.emailVerified,
        },
      });

      return jsonResponse(
        {
          success:
            false,

          code:
            'ADMIN_SECURITY_REQUIREMENTS_NOT_MET',

          error:
            'Your administrator account cannot perform this action.',
        },
        403
      );
    }

    /* ========================================================
       3. CONTENT TYPE

       Prevent ambiguous form/body parsing on this JSON API.
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
       4. BODY
       ======================================================== */

    let body:
      CreateAdministratorBody;

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
          CreateAdministratorBody;
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
       5. PROVISION

       The identity-domain service independently revalidates the
       actor against platform_admins. The route-level role check
       alone is intentionally not the final authority.
       ======================================================== */

    const result =
      await provisionPlatformAdmin({
        request,

        actorAdminId:
          session.adminId,

        actorRole:
          session.role,

        firstName:
          body.firstName,

        lastName:
          body.lastName,

        email:
          body.email,

        role:
          body.role,
      });

    /* ========================================================
       6. CONTROLLED FAILURES
       ======================================================== */

    if (
      !result.success
    ) {
      switch (
        result.code
      ) {
        case 'FORBIDDEN':
          return jsonResponse(
            {
              success:
                false,

              code:
                result.code,

              error:
                result.message,
            },
            403
          );

        case 'INVALID_FIRST_NAME':
        case 'INVALID_LAST_NAME':
        case 'INVALID_EMAIL':
        case 'INVALID_ROLE':
          return jsonResponse(
            {
              success:
                false,

              code:
                result.code,

              error:
                result.message,
            },
            400
          );

        case 'ADMIN_ALREADY_EXISTS':
          return jsonResponse(
            {
              success:
                false,

              code:
                result.code,

              error:
                result.message,
            },
            409
          );

        case 'PROVISIONING_FAILED':
          return jsonResponse(
            {
              success:
                false,

              code:
                result.code,

              error:
                result.message,
            },
            500
          );
      }
    }

    /* ========================================================
       7. SUCCESS

       Important architecture change:

       Verification-email failure is NOT identity-provisioning
       failure.

       The provisioning service now returns one of:

       ADMIN_PROVISIONED
       ADMIN_PROVISIONED_VERIFICATION_PENDING

       In both cases the administrator identity exists.

       Therefore the caller must never blindly re-submit creation.
       ======================================================== */

    const verificationPending =
      result.code ===
      'ADMIN_PROVISIONED_VERIFICATION_PENDING';

    return jsonResponse(
      {
        success:
          true,

        code:
          result.code,

        message:
          result.message,

        admin:
          result.admin,

        verification: {
          sent:
            result.verificationSent,

          pending:
            verificationPending,

          cooldown:
            result.verificationCooldown,

          retryAfterSeconds:
            result.retryAfterSeconds,
        },
      },
      201
    );
  } catch (
    error
  ) {
    /* ========================================================
       8. AUTHENTICATION FAILURE
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
       9. AUTHORIZATION FAILURE
       ======================================================== */

    if (
      error instanceof
        Error &&
      error.message ===
        'ADMIN_FORBIDDEN'
    ) {
      if (
        actorAdminId
      ) {
        await safeRecordAudit({
          request,

          adminId:
            actorAdminId,

          sessionId:
            actorSessionId,

          eventType:
            'admin.identity.provision_denied',

          action:
            'provision_platform_admin',

          targetType:
            'platform_admin',

          successful:
            false,

          failureReason:
            'insufficient_privileges',
        });
      }

      return jsonResponse(
        {
          success:
            false,

          code:
            'ADMIN_FORBIDDEN',

          error:
            'You do not have permission to provision Platform Administrators.',
        },
        403
      );
    }

    /* ========================================================
       10. TEMPORARY INFRASTRUCTURE FAILURE

       Never expose raw Neon/PostgreSQL details.
       ======================================================== */

    if (
      isDatabaseAvailabilityError(
        error
      )
    ) {
      console.error(
        '[Admin Administrators API] Database temporarily unavailable:',
        error instanceof
          Error
          ? error.message
          : 'Unknown database availability error'
      );

      if (
        actorAdminId
      ) {
        await safeRecordAudit({
          request,

          adminId:
            actorAdminId,

          sessionId:
            actorSessionId,

          eventType:
            'admin.identity.provision_failed',

          action:
            'provision_platform_admin',

          targetType:
            'platform_admin',

          successful:
            false,

          failureReason:
            'database_temporarily_unavailable',

          metadata: {
            infrastructure:
              'control_database',
          },
        });
      }

      return jsonResponse(
        {
          success:
            false,

          code:
            'SERVICE_TEMPORARILY_UNAVAILABLE',

          error:
            'SaMi is temporarily unable to complete this request. Try again shortly.',
        },
        503
      );
    }

    /* ========================================================
       11. UNKNOWN INTERNAL ERROR
       ======================================================== */

    console.error(
      '[Admin Administrators API] Unexpected error:',
      error instanceof
        Error
        ? error.message
        : 'Unknown administrator provisioning error'
    );

    if (
      actorAdminId
    ) {
      await safeRecordAudit({
        request,

        adminId:
          actorAdminId,

        sessionId:
          actorSessionId,

        eventType:
          'admin.identity.provision_failed',

        action:
          'provision_platform_admin',

        targetType:
          'platform_admin',

        successful:
          false,

        failureReason:
          'internal_error',
      });
    }

    return jsonResponse(
      {
        success:
          false,

        code:
          'ADMIN_PROVISIONING_ERROR',

        error:
          'SaMi could not complete administrator provisioning.',
      },
      500
    );
  }
}