import crypto from 'crypto';

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
  AdminAccountNotFoundError,
  AdminAccountValidationError,
  getAdminPreferences,
  updateAdminPreferences,
  type AdminDateFormat,
  type AdminTheme,
  type AdminTimeFormat,
} from '@/lib/account/admin-account';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   TYPES
   ============================================================ */

type RequestBody = {
  theme?: unknown;
  locale?: unknown;
  timezone?: unknown;
  dateFormat?: unknown;
  timeFormat?: unknown;
  firstDayOfWeek?: unknown;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const MAX_BODY_BYTES =
  8 * 1024;

const ALLOWED_FIELDS =
  new Set([
    'theme',
    'locale',
    'timezone',
    'dateFormat',
    'timeFormat',
    'firstDayOfWeek',
  ]);

/* ============================================================
   RESPONSE
   ============================================================ */

function json(
  body:
    Record<string, unknown>,
  status = 200,
  extraHeaders?:
    Record<string, string>
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

        'Referrer-Policy':
          'no-referrer',

        ...extraHeaders,
      },
    }
  );
}

function failure(
  status: number,
  code: string,
  error: string,
  extra?:
    Record<string, unknown>,
  headers?:
    Record<string, string>
) {
  return json(
    {
      success: false,
      code,
      error,
      ...extra,
    },
    status,
    headers
  );
}

/* ============================================================
   HELPERS
   ============================================================ */

function isObject(
  value: unknown
): value is
  Record<string, unknown> {
  return (
    typeof value ===
      'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function requestId() {
  return crypto.randomUUID();
}

function isSameOrigin(
  request:
    NextRequest
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
    const requestUrl =
      new URL(
        request.url
      );

    const originUrl =
      new URL(
        origin
      );

    return (
      requestUrl.protocol ===
        originUrl.protocol &&
      requestUrl.host ===
        originUrl.host
    );
  } catch {
    return false;
  }
}

function transientFailure(
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

  const codes =
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
    codes.has(code) ||
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
    )
  );
}

/* ============================================================
   SESSION FAILURE
   ============================================================ */

function sessionFailure(
  error: unknown,
  id: string
) {
  if (
    error instanceof
      Error &&
    error.message ===
      'ADMIN_UNAUTHENTICATED'
  ) {
    return failure(
      401,
      'ADMIN_UNAUTHENTICATED',
      'Your administrator session has expired. Sign in again.'
    );
  }

  console.error(
    `[Admin Preferences ${id}] Session verification failed:`,
    error
  );

  if (
    transientFailure(
      error
    )
  ) {
    return failure(
      503,
      'SERVICE_TEMPORARILY_UNAVAILABLE',
      'SaMi administrator services are temporarily unavailable.',
      {
        retryable: true,
        requestId: id,
      },
      {
        'Retry-After':
          '30',
      }
    );
  }

  return failure(
    500,
    'ADMIN_SESSION_ERROR',
    'SaMi could not verify your administrator session.',
    {
      requestId: id,
    }
  );
}

/* ============================================================
   GET
   ============================================================ */

export async function GET() {
  const id =
    requestId();

  let session;

  try {
    session =
      await requireAdminSession();
  } catch (error) {
    return sessionFailure(
      error,
      id
    );
  }

  try {
    const preferences =
      await getAdminPreferences(
        session.adminId
      );

    return json({
      success: true,

      code:
        'ADMIN_PREFERENCES_LOADED',

      preferences,

      requestId: id,
    });
  } catch (error) {
    if (
      error instanceof
      AdminAccountNotFoundError
    ) {
      return failure(
        403,
        'ADMIN_ACCOUNT_UNAVAILABLE',
        'This administrator account is not currently available.'
      );
    }

    console.error(
      `[Admin Preferences ${id}] Load failed:`,
      error
    );

    if (
      transientFailure(
        error
      )
    ) {
      return failure(
        503,
        'SERVICE_TEMPORARILY_UNAVAILABLE',
        'SaMi administrator services are temporarily unavailable.',
        {
          retryable: true,
          requestId: id,
        },
        {
          'Retry-After':
            '30',
        }
      );
    }

    return failure(
      500,
      'ADMIN_PREFERENCES_ERROR',
      'SaMi could not load your administrator preferences.',
      {
        requestId: id,
      }
    );
  }
}

/* ============================================================
   PATCH
   ============================================================ */

export async function PATCH(
  request:
    NextRequest
) {
  const id =
    requestId();

  /* ==========================================================
     SAME ORIGIN
     ========================================================== */

  if (
    !isSameOrigin(
      request
    )
  ) {
    return failure(
      403,
      'CROSS_ORIGIN_REQUEST_REJECTED',
      'This request could not be accepted.'
    );
  }

  /* ==========================================================
     CONTENT TYPE
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
    return failure(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'This endpoint accepts JSON requests only.'
    );
  }

  /* ==========================================================
     DECLARED BODY SIZE
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
      return failure(
        413,
        'REQUEST_TOO_LARGE',
        'The preferences request is too large.'
      );
    }
  }

  /* ==========================================================
     SESSION
     ========================================================== */

  let session;

  try {
    session =
      await requireAdminSession();
  } catch (error) {
    return sessionFailure(
      error,
      id
    );
  }

  /* ==========================================================
     READ BODY
     ========================================================== */

  let rawBody:
    string;

  try {
    rawBody =
      await request.text();
  } catch {
    return failure(
      400,
      'INVALID_REQUEST_BODY',
      'The preferences request is invalid.'
    );
  }

  if (
    Buffer.byteLength(
      rawBody,
      'utf8'
    ) >
    MAX_BODY_BYTES
  ) {
    return failure(
      413,
      'REQUEST_TOO_LARGE',
      'The preferences request is too large.'
    );
  }

  let body:
    Record<string, unknown>;

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
      return failure(
        400,
        'INVALID_REQUEST_BODY',
        'The preferences request is invalid.'
      );
    }

    body =
      parsed;
  } catch {
    return failure(
      400,
      'INVALID_JSON',
      'The preferences request contains invalid JSON.'
    );
  }

  /* ==========================================================
     FIELD ALLOWLIST
     ========================================================== */

  const keys =
    Object.keys(
      body
    );

  if (
    keys.length ===
    0
  ) {
    return failure(
      400,
      'NO_PREFERENCE_CHANGES',
      'No preference changes were provided.'
    );
  }

  const unsupported =
    keys.filter(
      key =>
        !ALLOWED_FIELDS.has(
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
        'admin.preferences.update.rejected',

      action:
        'update_own_preferences',

      targetType:
        'platform_admin',

      targetId:
        session.adminId,

      successful:
        false,

      failureReason:
        'unsupported_fields',

      requestId:
        id,

      metadata: {
        unsupportedFields:
          unsupported.slice(
            0,
            10
          ),
      },
    });

    return failure(
      400,
      'UNSUPPORTED_PREFERENCE_FIELDS',
      'The preferences request contains unsupported fields.'
    );
  }

  /* ==========================================================
     BASIC TYPES

     Domain service performs authoritative value validation.
     ========================================================== */

  if (
    body.theme !==
      undefined &&
    typeof body.theme !==
      'string'
  ) {
    return failure(
      400,
      'INVALID_THEME',
      'Choose a valid appearance.',
      {
        field:
          'theme',
      }
    );
  }

  if (
    body.locale !==
      undefined &&
    typeof body.locale !==
      'string'
  ) {
    return failure(
      400,
      'INVALID_LOCALE',
      'Choose a valid language or locale.',
      {
        field:
          'locale',
      }
    );
  }

  if (
    body.timezone !==
      undefined &&
    typeof body.timezone !==
      'string'
  ) {
    return failure(
      400,
      'INVALID_TIMEZONE',
      'Choose a valid timezone.',
      {
        field:
          'timezone',
      }
    );
  }

  if (
    body.dateFormat !==
      undefined &&
    typeof body.dateFormat !==
      'string'
  ) {
    return failure(
      400,
      'INVALID_DATE_FORMAT',
      'Choose a valid date format.',
      {
        field:
          'dateFormat',
      }
    );
  }

  if (
    body.timeFormat !==
      undefined &&
    typeof body.timeFormat !==
      'string'
  ) {
    return failure(
      400,
      'INVALID_TIME_FORMAT',
      'Choose a valid time format.',
      {
        field:
          'timeFormat',
      }
    );
  }

  if (
    body.firstDayOfWeek !==
      undefined &&
    (
      typeof body.firstDayOfWeek !==
        'number' ||
      !Number.isInteger(
        body.firstDayOfWeek
      )
    )
  ) {
    return failure(
      400,
      'INVALID_FIRST_DAY_OF_WEEK',
      'Choose a valid first day of the week.',
      {
        field:
          'firstDayOfWeek',
      }
    );
  }

  /* ==========================================================
     UPDATE
     ========================================================== */

  try {
    const preferences =
      await updateAdminPreferences(
        session.adminId,
        {
          theme:
            body.theme as
              | AdminTheme
              | undefined,

          locale:
            body.locale as
              | string
              | undefined,

          timezone:
            body.timezone as
              | string
              | undefined,

          dateFormat:
            body.dateFormat as
              | AdminDateFormat
              | undefined,

          timeFormat:
            body.timeFormat as
              | AdminTimeFormat
              | undefined,

          firstDayOfWeek:
            body.firstDayOfWeek as
              | number
              | undefined,
        }
      );

    await recordAdminAuditEvent({
      request,

      adminId:
        session.adminId,

      sessionId:
        session.sessionId,

      eventType:
        'admin.preferences.updated',

      action:
        'update_own_preferences',

      targetType:
        'platform_admin',

      targetId:
        session.adminId,

      successful:
        true,

      requestId:
        id,

      metadata: {
        changedFields:
          Object.keys(
            body
          ),
      },
    });

    return json({
      success: true,

      code:
        'ADMIN_PREFERENCES_UPDATED',

      message:
        'Your administrator preferences have been updated.',

      preferences,

      requestId:
        id,
    });
  } catch (error) {
    if (
      error instanceof
      AdminAccountValidationError
    ) {
      return failure(
        400,
        error.code,
        error.message,
        {
          field:
            error.field,
        }
      );
    }

    if (
      error instanceof
      AdminAccountNotFoundError
    ) {
      return failure(
        403,
        'ADMIN_ACCOUNT_UNAVAILABLE',
        'This administrator account is not currently available.'
      );
    }

    console.error(
      `[Admin Preferences ${id}] Update failed:`,
      error
    );

    await recordAdminAuditEvent({
      request,

      adminId:
        session.adminId,

      sessionId:
        session.sessionId,

      eventType:
        'admin.preferences.update.failed',

      action:
        'update_own_preferences',

      targetType:
        'platform_admin',

      targetId:
        session.adminId,

      successful:
        false,

      failureReason:
        transientFailure(
          error
        )
          ? 'service_unavailable'
          : 'internal_error',

      requestId:
        id,
    });

    if (
      transientFailure(
        error
      )
    ) {
      return failure(
        503,
        'SERVICE_TEMPORARILY_UNAVAILABLE',
        'SaMi administrator services are temporarily unavailable. Your preferences were not changed.',
        {
          retryable: true,
          requestId: id,
        },
        {
          'Retry-After':
            '30',
        }
      );
    }

    return failure(
      500,
      'ADMIN_PREFERENCES_UPDATE_ERROR',
      'SaMi could not update your administrator preferences.',
      {
        requestId:
          id,
      }
    );
  }
}