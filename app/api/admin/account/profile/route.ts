import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  requireAdminSession,
} from '@/lib/auth/admin-session';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

import {
  queryControl,
} from '@/lib/db/control';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   TYPES
   ============================================================ */

type ProfilePatchBody = {
  firstName?: unknown;
  lastName?: unknown;
};

type AdminProfileRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  status: string;
  email_verified: boolean;
  email_verified_at: Date | null;
  updated_at: Date;
};

/* ============================================================
   LIMITS
   ============================================================ */

const MAX_BODY_BYTES =
  4 * 1024;

const MIN_NAME_LENGTH =
  1;

const MAX_NAME_LENGTH =
  80;

/* ============================================================
   RESPONSE
   ============================================================ */

function jsonResponse(
  body: Record<
    string,
    unknown
  >,
  status = 200,
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
   OBJECT
   ============================================================ */

function isObject(
  value: unknown
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      'object' &&
    value !== null &&
    !Array.isArray(
      value
    )
  );
}

/* ============================================================
   REQUEST ID
   ============================================================ */

function createRequestId() {
  return crypto.randomUUID();
}

/* ============================================================
   SAME-ORIGIN PROTECTION

   Authentication uses cookies.

   For mutation requests we additionally reject cross-origin
   browser requests.

   Sec-Fetch-Site is checked when available and Origin is
   validated when supplied.
   ============================================================ */

function isSameOriginRequest(
  request: NextRequest
) {
  const fetchSite =
    request.headers.get(
      'sec-fetch-site'
    );

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
    request.headers.get(
      'origin'
    );

  if (!origin) {
    return true;
  }

  try {
    const originUrl =
      new URL(origin);

    const requestUrl =
      new URL(
        request.url
      );

    return (
      originUrl.protocol ===
        requestUrl.protocol &&
      originUrl.host ===
        requestUrl.host
    );
  } catch {
    return false;
  }
}

/* ============================================================
   INFRASTRUCTURE FAILURE
   ============================================================ */

function isTransientInfrastructureError(
  error: unknown
) {
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
      'server closed the connection'
    ) ||
    message.includes(
      'database is unavailable'
    )
  );
}

/* ============================================================
   NAME NORMALIZATION
   ============================================================ */

function normalizeName(
  value: string
) {
  return value
    .normalize('NFKC')
    .replace(
      /\s+/g,
      ' '
    )
    .trim();
}

function validateName(
  value: unknown,
  field:
    | 'firstName'
    | 'lastName'
):
  | {
      valid: true;
      value: string;
    }
  | {
      valid: false;
      code: string;
      error: string;
    } {
  if (
    typeof value !==
    'string'
  ) {
    return {
      valid: false,

      code:
        field ===
        'firstName'
          ? 'INVALID_FIRST_NAME'
          : 'INVALID_LAST_NAME',

      error:
        field ===
        'firstName'
          ? 'First name must be text.'
          : 'Last name must be text.',
    };
  }

  const normalized =
    normalizeName(
      value
    );

  if (
    normalized.length <
      MIN_NAME_LENGTH ||
    normalized.length >
      MAX_NAME_LENGTH
  ) {
    return {
      valid: false,

      code:
        field ===
        'firstName'
          ? 'INVALID_FIRST_NAME'
          : 'INVALID_LAST_NAME',

      error:
        field ===
        'firstName'
          ? `First name must be between ${MIN_NAME_LENGTH} and ${MAX_NAME_LENGTH} characters.`
          : `Last name must be between ${MIN_NAME_LENGTH} and ${MAX_NAME_LENGTH} characters.`,
    };
  }

  /*
   * Names may contain Unicode letters/marks,
   * spaces, apostrophes and hyphens.
   *
   * This supports names from many languages
   * without accepting control characters,
   * markup or arbitrary punctuation.
   */
  if (
    !/^[\p{L}\p{M}][\p{L}\p{M}\s'’\-]*$/u.test(
      normalized
    )
  ) {
    return {
      valid: false,

      code:
        field ===
        'firstName'
          ? 'INVALID_FIRST_NAME'
          : 'INVALID_LAST_NAME',

      error:
        field ===
        'firstName'
          ? 'First name contains unsupported characters.'
          : 'Last name contains unsupported characters.',
    };
  }

  return {
    valid: true,
    value: normalized,
  };
}

/* ============================================================
   SAFE ACCOUNT
   ============================================================ */

function safeAccount(
  row: AdminProfileRow
) {
  const firstName =
    row.first_name;

  const lastName =
    row.last_name;

  return {
    id:
      row.id,

    firstName,

    lastName,

    fullName:
      `${firstName} ${lastName}`
        .trim(),

    email:
      row.email,

    role:
      row.role,

    status:
      row.status,

    emailVerified:
      row.email_verified,

    emailVerifiedAt:
      row.email_verified_at
        ? row.email_verified_at.toISOString()
        : null,

    updatedAt:
      row.updated_at.toISOString(),
  };
}

/* ============================================================
   PATCH
   /api/admin/account/profile

   Platform Administrator personal profile update.

   Security properties:
   - authenticated admin session
   - identity comes only from session
   - same-origin mutation protection
   - strict body size
   - strict supported-field allowlist
   - Unicode-safe name validation
   - account-state enforcement
   - deleted accounts excluded
   - parameterized SQL
   - updated_by attribution
   - no role/status/email mutation
   - audit event
   - generic infrastructure errors
   - no sensitive fields returned
   ============================================================ */

export async function PATCH(
  request: NextRequest
) {
  const requestId =
    createRequestId();

  /* ==========================================================
     1. ORIGIN / CSRF BOUNDARY
     ========================================================== */

  if (
    !isSameOriginRequest(
      request
    )
  ) {
    return errorResponse(
      403,
      'CROSS_ORIGIN_REQUEST_REJECTED',
      'This request could not be accepted.'
    );
  }

  /* ==========================================================
     2. CONTENT TYPE
     ========================================================== */

  const contentType =
    request.headers.get(
      'content-type'
    ) || '';

  if (
    !contentType
      .toLowerCase()
      .includes(
        'application/json'
      )
  ) {
    return errorResponse(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'This endpoint accepts JSON requests only.'
    );
  }

  /* ==========================================================
     3. BODY SIZE
     ========================================================== */

  const contentLength =
    request.headers.get(
      'content-length'
    );

  if (contentLength) {
    const size =
      Number(
        contentLength
      );

    if (
      Number.isFinite(
        size
      ) &&
      size >
        MAX_BODY_BYTES
    ) {
      return errorResponse(
        413,
        'REQUEST_TOO_LARGE',
        'The profile update request is too large.'
      );
    }
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
      error instanceof
        Error &&
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
      `[Admin Profile ${requestId}] Session verification failed:`,
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
          retryable:
            true,
          requestId,
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
      'SaMi could not verify your administrator session.',
      {
        requestId,
      }
    );
  }

  /* ==========================================================
     5. READ BODY WITH HARD APPLICATION LIMIT
     ========================================================== */

  let rawBody:
    string;

  try {
    rawBody =
      await request.text();
  } catch {
    return errorResponse(
      400,
      'INVALID_REQUEST_BODY',
      'The profile update request is invalid.'
    );
  }

  if (
    Buffer.byteLength(
      rawBody,
      'utf8'
    ) >
    MAX_BODY_BYTES
  ) {
    return errorResponse(
      413,
      'REQUEST_TOO_LARGE',
      'The profile update request is too large.'
    );
  }

  let body:
    Record<
      string,
      unknown
    >;

  try {
    const parsed:
      unknown =
      JSON.parse(
        rawBody
      );

    if (
      !isObject(
        parsed
      )
    ) {
      return errorResponse(
        400,
        'INVALID_REQUEST_BODY',
        'The profile update request is invalid.'
      );
    }

    body =
      parsed;
  } catch {
    return errorResponse(
      400,
      'INVALID_JSON',
      'The profile update request contains invalid JSON.'
    );
  }

  /* ==========================================================
     6. STRICT FIELD ALLOWLIST

     Never allow this endpoint to mutate:
     - email
     - role
     - status
     - password
     - 2FA
     - permissions
     - verification state
     - created_by
     ========================================================== */

  const allowedFields =
    new Set([
      'firstName',
      'lastName',
    ]);

  const suppliedFields =
    Object.keys(
      body
    );

  const unsupported =
    suppliedFields.filter(
      key =>
        !allowedFields.has(
          key
        )
    );

  if (
    unsupported.length >
    0
  ) {
    await recordAdminAuditEvent({
      request,

      adminId:
        session.adminId,

      sessionId:
        session.sessionId,

      eventType:
        'admin.profile.update.rejected',

      action:
        'update_own_profile',

      targetType:
        'platform_admin',

      targetId:
        session.adminId,

      successful:
        false,

      failureReason:
        'unsupported_fields',

      requestId,

      metadata: {
        unsupportedFields:
          unsupported.slice(
            0,
            10
          ),
      },
    });

    return errorResponse(
      400,
      'UNSUPPORTED_PROFILE_FIELDS',
      'The profile update contains unsupported fields.'
    );
  }

  if (
    !Object.prototype.hasOwnProperty.call(
      body,
      'firstName'
    ) &&
    !Object.prototype.hasOwnProperty.call(
      body,
      'lastName'
    )
  ) {
    return errorResponse(
      400,
      'NO_PROFILE_CHANGES',
      'No profile changes were provided.'
    );
  }

  /* ==========================================================
     7. VALIDATE
     ========================================================== */

  const firstNameResult =
    validateName(
      body.firstName,
      'firstName'
    );

  if (
    !firstNameResult.valid
  ) {
    return errorResponse(
      400,
      firstNameResult.code,
      firstNameResult.error,
      {
        field:
          'firstName',
      }
    );
  }

  const lastNameResult =
    validateName(
      body.lastName,
      'lastName'
    );

  if (
    !lastNameResult.valid
  ) {
    return errorResponse(
      400,
      lastNameResult.code,
      lastNameResult.error,
      {
        field:
          'lastName',
      }
    );
  }

  const firstName =
    firstNameResult.value;

  const lastName =
    lastNameResult.value;

  /* ==========================================================
     8. UPDATE AUTHORITATIVE IDENTITY

     Important:
     admin id comes ONLY from the authenticated session.

     WHERE also re-checks:
     - active status
     - deleted_at
     ========================================================== */

  try {
    const result =
      await queryControl(
        `
          UPDATE platform_admins
          SET
            first_name = $1,
            last_name = $2,
            updated_by = $3,
            updated_at = NOW()
          WHERE
            id = $3
            AND status = 'active'
            AND deleted_at IS NULL
          RETURNING
            id,
            first_name,
            last_name,
            email,
            role,
            status,
            email_verified,
            email_verified_at,
            updated_at
        `,
        [
          firstName,
          lastName,
          session.adminId,
        ]
      );

    if (
      result.rowCount !==
        1 ||
      !result.rows[0]
    ) {
      await recordAdminAuditEvent({
        request,

        adminId:
          session.adminId,

        sessionId:
          session.sessionId,

        eventType:
          'admin.profile.update.failed',

        action:
          'update_own_profile',

        targetType:
          'platform_admin',

        targetId:
          session.adminId,

        successful:
          false,

        failureReason:
          'account_unavailable',

        requestId,
      });

      return errorResponse(
        403,
        'ADMIN_ACCOUNT_UNAVAILABLE',
        'This administrator account is not currently available.'
      );
    }

    const account =
      safeAccount(
        result
          .rows[0] as
          AdminProfileRow
      );

    /* ========================================================
       9. AUDIT

       Audit failure is intentionally non-fatal.

       The profile write has already succeeded. Returning an
       artificial failure here could cause the browser/user to
       retry a successful mutation and create misleading state.

       The logger itself records its own internal failure.
       ======================================================== */

    await recordAdminAuditEvent({
      request,

      adminId:
        session.adminId,

      sessionId:
        session.sessionId,

      eventType:
        'admin.profile.updated',

      action:
        'update_own_profile',

      targetType:
        'platform_admin',

      targetId:
        session.adminId,

      successful:
        true,

      requestId,

      metadata: {
        changedFields: [
          'first_name',
          'last_name',
        ],
      },
    });

    /* ========================================================
       10. SUCCESS
       ======================================================== */

    return jsonResponse({
      success: true,

      code:
        'ADMIN_PROFILE_UPDATED',

      message:
        'Your administrator profile has been updated.',

      account,

      requestId,
    });
  } catch (error) {
    console.error(
      `[Admin Profile ${requestId}] Update failed:`,
      error
    );

    await recordAdminAuditEvent({
      request,

      adminId:
        session.adminId,

      sessionId:
        session.sessionId,

      eventType:
        'admin.profile.update.failed',

      action:
        'update_own_profile',

      targetType:
        'platform_admin',

      targetId:
        session.adminId,

      successful:
        false,

      failureReason:
        isTransientInfrastructureError(
          error
        )
          ? 'service_unavailable'
          : 'internal_error',

      requestId,
    });

    if (
      isTransientInfrastructureError(
        error
      )
    ) {
      return errorResponse(
        503,
        'SERVICE_TEMPORARILY_UNAVAILABLE',
        'SaMi administrator services are temporarily unavailable. Your profile was not changed.',
        {
          retryable:
            true,
          requestId,
        },
        {
          'Retry-After':
            '30',
        }
      );
    }

    return errorResponse(
      500,
      'ADMIN_PROFILE_UPDATE_ERROR',
      'SaMi could not update your administrator profile.',
      {
        requestId,
      }
    );
  }
}