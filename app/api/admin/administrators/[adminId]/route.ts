import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  requireAdminRole,
} from '@/lib/auth/admin-session';

import {
  changePlatformAdminRole,
  changePlatformAdminStatus,
  unlockPlatformAdmin,
} from '@/lib/auth/admin-lifecycle';

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

type RouteContext = {
  params:
    Promise<{
      adminId:
        string;
    }>;
};

type MutationBody = {
  action?:
    unknown;

  role?:
    unknown;

  status?:
    unknown;
};

type MutationAction =
  | 'change_role'
  | 'change_status'
  | 'unlock';

/* ============================================================
   RESPONSE
   ============================================================ */

function jsonResponse(
  body:
    Record<string, unknown>,
  status =
    200,
  extraHeaders?: Record<
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
    // Ignore malformed request URL.
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
       * APP_URL deployment validation belongs to infrastructure
       * configuration.
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
   BODY SIZE
   ============================================================ */

function isOversizedRequest(
  request:
    NextRequest
): boolean {
  const raw =
    request.headers.get(
      'content-length'
    );

  if (
    !raw
  ) {
    return false;
  }

  const value =
    Number(
      raw
    );

  return (
    Number.isFinite(
      value
    ) &&
    value >
      8 * 1024
  );
}

/* ============================================================
   ACTION
   ============================================================ */

function normalizeAction(
  value:
    unknown
): MutationAction | null {
  if (
    typeof value !==
      'string'
  ) {
    return null;
  }

  const action =
    value
      .trim()
      .toLowerCase();

  switch (
    action
  ) {
    case 'change_role':
    case 'change_status':
    case 'unlock':
      return action;

    default:
      return null;
  }
}

/* ============================================================
   SAFE AUDIT
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
      '[Admin Administrator Mutation API] Audit event failed:',
      error instanceof
        Error
        ? error.message
        : 'Unknown audit error'
    );
  }
}

/* ============================================================
   INFRASTRUCTURE FAILURE
   ============================================================ */

function isInfrastructureError(
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
      'timeout'
    ) ||
    message.includes(
      'timed out'
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
   RESULT MAPPING
   ============================================================ */

function lifecycleFailureResponse(
  result:
    Extract<
      Awaited<
        ReturnType<
          typeof changePlatformAdminRole
        >
      >,
      {
        success:
          false;
      }
    >
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

    case 'INVALID_TARGET_ADMIN':
      return jsonResponse(
        {
          success:
            false,

          code:
            result.code,

          error:
            result.message,
        },
        404
      );

    case 'INVALID_ROLE':
    case 'INVALID_STATUS':
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

    case 'SELF_MODIFICATION_NOT_ALLOWED':
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

    case 'LAST_SUPER_ADMIN_PROTECTED':
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

    case 'ADMIN_STATE_CONFLICT':
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

    case 'ADMIN_NOT_LOCKED':
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

    case 'LIFECYCLE_UPDATE_FAILED':
      return jsonResponse(
        {
          success:
            false,

          code:
            result.code,

          error:
            'SaMi could not update this Platform Administrator.',
        },
        500
      );
  }
}

/* ============================================================
   PATCH /api/admin/administrators/[adminId]

   Supported actions:

   {
     "action": "change_role",
     "role": "security_admin"
   }

   {
     "action": "change_status",
     "status": "suspended"
   }

   {
     "action": "unlock"
   }
   ============================================================ */

export async function PATCH(
  request:
    NextRequest,
  context:
    RouteContext
) {
  let actorAdminId:
    string | null =
    null;

  let actorSessionId:
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
          'admin.identity.lifecycle_denied',

        action:
          'modify_platform_admin',

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
       2. AUTH + ROLE
       ======================================================== */

    const session =
      await requireAdminRole([
        'super_admin',
      ]);

    actorAdminId =
      session.adminId;

    actorSessionId =
      session.sessionId;

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
            'Your administrator account cannot perform this action.',
        },
        403
      );
    }

    /* ========================================================
       3. TARGET
       ======================================================== */

    const params =
      await context.params;

    const targetAdminId =
      typeof params.adminId ===
        'string'
        ? params.adminId.trim()
        : '';

    if (
      !targetAdminId
    ) {
      return jsonResponse(
        {
          success:
            false,

          code:
            'INVALID_TARGET_ADMIN',

          error:
            'The Platform Administrator could not be identified.',
        },
        400
      );
    }

    /* ========================================================
       4. CONTENT TYPE
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
       5. SIZE
       ======================================================== */

    if (
      isOversizedRequest(
        request
      )
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
       6. BODY
       ======================================================== */

    let body:
      MutationBody;

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
          MutationBody;
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

    const action =
      normalizeAction(
        body.action
      );

    if (
      !action
    ) {
      return jsonResponse(
        {
          success:
            false,

          code:
            'INVALID_ACTION',

          error:
            'Select a valid Platform Administrator action.',
        },
        400
      );
    }

    /* ========================================================
       7. EXECUTE DOMAIN MUTATION
       ======================================================== */

    let result:
      Awaited<
        ReturnType<
          typeof changePlatformAdminRole
        >
      >;

    switch (
      action
    ) {
      case 'change_role':
        result =
          await changePlatformAdminRole({
            request,

            actorAdminId:
              session.adminId,

            targetAdminId,

            role:
              body.role,
          });

        break;

      case 'change_status':
        result =
          await changePlatformAdminStatus({
            request,

            actorAdminId:
              session.adminId,

            targetAdminId,

            status:
              body.status,
          });

        break;

      case 'unlock':
        result =
          await unlockPlatformAdmin({
            request,

            actorAdminId:
              session.adminId,

            targetAdminId,
          });

        break;
    }

    /* ========================================================
       8. CONTROLLED FAILURE
       ======================================================== */

    if (
      !result.success
    ) {
      await safeRecordAudit({
        request,

        adminId:
          session.adminId,

        sessionId:
          session.sessionId,

        eventType:
          'admin.identity.lifecycle_denied',

        action,

        targetType:
          'platform_admin',

        targetId:
          targetAdminId,

        successful:
          false,

        failureReason:
          result.code,

        metadata: {
          requestedRole:
            action ===
              'change_role'
              ? body.role
              : undefined,

          requestedStatus:
            action ===
              'change_status'
              ? body.status
              : undefined,
        },
      });

      return lifecycleFailureResponse(
        result
      );
    }

    /* ========================================================
       9. SUCCESS
       ======================================================== */

    return jsonResponse({
      success:
        true,

      code:
        result.code,

      message:
        result.message,

      admin:
        result.admin,

      security: {
        sessionsRevoked:
          result.sessionsRevoked,

        challengesInvalidated:
          result.challengesInvalidated,
      },
    });
  } catch (
    error
  ) {
    /* ========================================================
       10. UNAUTHENTICATED
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
       11. FORBIDDEN
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
            'admin.identity.lifecycle_denied',

          action:
            'modify_platform_admin',

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
            'Only a Super Administrator can manage Platform Administrator lifecycle state.',
        },
        403
      );
    }

    /* ========================================================
       12. INFRASTRUCTURE
       ======================================================== */

    if (
      isInfrastructureError(
        error
      )
    ) {
      console.error(
        '[Admin Administrator Mutation API] Temporary infrastructure failure:',
        error instanceof
          Error
          ? error.message
          : 'Unknown infrastructure error'
      );

      return jsonResponse(
        {
          success:
            false,

          code:
            'SERVICE_TEMPORARILY_UNAVAILABLE',

          error:
            'SaMi is temporarily unable to update this Platform Administrator.',
        },
        503,
        {
          'Retry-After':
            '30',
        }
      );
    }

    /* ========================================================
       13. UNKNOWN
       ======================================================== */

    console.error(
      '[Admin Administrator Mutation API] Unexpected failure:',
      error instanceof
        Error
        ? error.message
        : 'Unknown mutation error'
    );

    return jsonResponse(
      {
        success:
          false,

        code:
          'ADMINISTRATOR_UPDATE_ERROR',

        error:
          'SaMi could not update this Platform Administrator.',
      },
      500
    );
  }
}