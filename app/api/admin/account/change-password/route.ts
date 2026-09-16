import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  requireAdminSession,
} from '@/lib/auth/admin-session';

import {
  hashAdminPassword,
  verifyAdminPassword,
} from '@/lib/auth/admin-auth';

import {
  checkRateLimit,
  resetRateLimit,
} from '@/lib/auth/rate-limit';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

import {
  queryControl,
} from '@/lib/db/control';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 8 * 1024;
const MAX_PASSWORD_LENGTH = 128;

const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS =
  15 * 60 * 1000;
const RATE_LIMIT_BLOCK_MS =
  15 * 60 * 1000;

type Body = {
  currentPassword?: unknown;
  newPassword?: unknown;
  confirmPassword?: unknown;
};

function json(
  body: Record<string, unknown>,
  status = 200,
  extraHeaders?: Record<string, string>
) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control':
        'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options':
        'nosniff',
      'Referrer-Policy':
        'no-referrer',
      ...extraHeaders,
    },
  });
}

function error(
  status: number,
  code: string,
  message: string,
  field?: string,
  extra?: Record<string, unknown>,
  headers?: Record<string, string>
) {
  return json(
    {
      success: false,
      code,
      error: message,
      ...(field
        ? { field }
        : {}),
      ...(extra || {}),
    },
    status,
    headers
  );
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isSameOrigin(
  request: NextRequest
) {
  const site =
    request.headers.get(
      'sec-fetch-site'
    );

  if (
    site &&
    site !== 'same-origin' &&
    site !== 'same-site' &&
    site !== 'none'
  ) {
    return false;
  }

  const origin =
    request.headers.get('origin');

  if (!origin) {
    return true;
  }

  try {
    const source =
      new URL(origin);

    const target =
      new URL(request.url);

    return (
      source.protocol ===
        target.protocol &&
      source.host ===
        target.host
    );
  } catch {
    return false;
  }
}

function getIp(
  request: NextRequest
) {
  const forwarded =
    request.headers.get(
      'x-forwarded-for'
    );

  if (forwarded) {
    const first =
      forwarded
        .split(',')[0]
        ?.trim();

    if (first) {
      return first;
    }
  }

  return (
    request.headers.get(
      'x-real-ip'
    ) ||
    'unknown-ip'
  );
}

function validateNewPassword(
  value: unknown
):
  | {
      valid: true;
      password: string;
    }
  | {
      valid: false;
      message: string;
    } {
  if (
    typeof value !== 'string'
  ) {
    return {
      valid: false,
      message:
        'Enter a valid new password.',
    };
  }

  if (
    value.length < 8 ||
    value.length >
      MAX_PASSWORD_LENGTH
  ) {
    return {
      valid: false,
      message:
        'Password must contain between 8 and 128 characters.',
    };
  }

  if (!/[A-Z]/.test(value)) {
    return {
      valid: false,
      message:
        'Password must contain at least one uppercase letter.',
    };
  }

  if (!/[a-z]/.test(value)) {
    return {
      valid: false,
      message:
        'Password must contain at least one lowercase letter.',
    };
  }

  if (!/[0-9]/.test(value)) {
    return {
      valid: false,
      message:
        'Password must contain at least one number.',
    };
  }

  return {
    valid: true,
    password: value,
  };
}

async function safeAudit(
  input: Parameters<
    typeof recordAdminAuditEvent
  >[0]
) {
  try {
    await recordAdminAuditEvent(
      input
    );
  } catch (auditError) {
    console.error(
      '[Admin] Password audit failed:',
      auditError
    );
  }
}

export async function POST(
  request: NextRequest
) {
  if (!isSameOrigin(request)) {
    return error(
      403,
      'CROSS_ORIGIN_REQUEST_REJECTED',
      'This request could not be accepted.'
    );
  }

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
    return error(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'This endpoint accepts JSON requests only.'
    );
  }

  const contentLength =
    request.headers.get(
      'content-length'
    );

  if (
    contentLength &&
    Number(contentLength) >
      MAX_BODY_BYTES
  ) {
    return error(
      413,
      'REQUEST_TOO_LARGE',
      'The request is too large.'
    );
  }

  let session;

  try {
    session =
      await requireAdminSession();
  } catch {
    return error(
      401,
      'ADMIN_UNAUTHENTICATED',
      'Your administrator session has expired. Sign in again.'
    );
  }

  const rateLimitIdentifier =
    `admin-password-change:${session.adminId}:${getIp(
      request
    )}`;

  let rateLimit;

  try {
    rateLimit =
      await checkRateLimit({
        identifier:
          rateLimitIdentifier,
        action:
          'admin-password-change',
        maxAttempts:
          RATE_LIMIT_MAX_ATTEMPTS,
        windowMs:
          RATE_LIMIT_WINDOW_MS,
        blockMs:
          RATE_LIMIT_BLOCK_MS,
      });
  } catch (rateLimitError) {
    console.error(
      '[Admin] Password rate limiter failed:',
      rateLimitError
    );

    return error(
      503,
      'ADMIN_SECURITY_SERVICE_UNAVAILABLE',
      'SaMi administrator security services are temporarily unavailable.'
    );
  }

  if (!rateLimit.allowed) {
    const retryAfter =
      rateLimit.retryAfterSeconds ||
      60;

    await safeAudit({
      request,
      adminId:
        session.adminId,
      sessionId:
        session.sessionId,
      eventType:
        'admin.password.change.rate_limited',
      action:
        'change_own_password',
      targetType:
        'platform_admin',
      targetId:
        session.adminId,
      successful: false,
      failureReason:
        'rate_limited',
      metadata: {
        retryAfterSeconds:
          retryAfter,
      },
    });

    return error(
      429,
      'ADMIN_PASSWORD_CHANGE_RATE_LIMITED',
      'Too many password-change attempts. Please wait before trying again.',
      undefined,
      {
        retryAfterSeconds:
          retryAfter,
      },
      {
        'Retry-After':
          String(retryAfter),
      }
    );
  }

  let rawBody: string;

  try {
    rawBody =
      await request.text();
  } catch {
    return error(
      400,
      'INVALID_REQUEST_BODY',
      'The request body is invalid.'
    );
  }

  if (
    Buffer.byteLength(
      rawBody,
      'utf8'
    ) >
    MAX_BODY_BYTES
  ) {
    return error(
      413,
      'REQUEST_TOO_LARGE',
      'The request is too large.'
    );
  }

  let body: Body;

  try {
    const parsed =
      JSON.parse(
        rawBody
      ) as unknown;

    if (!isRecord(parsed)) {
      return error(
        400,
        'INVALID_REQUEST_BODY',
        'The request body is invalid.'
      );
    }

    body = parsed;
  } catch {
    return error(
      400,
      'INVALID_JSON',
      'The request contains invalid JSON.'
    );
  }

  const allowed =
    new Set([
      'currentPassword',
      'newPassword',
      'confirmPassword',
    ]);

  if (
    Object.keys(body).some(
      key =>
        !allowed.has(key)
    )
  ) {
    return error(
      400,
      'UNSUPPORTED_FIELDS',
      'The request contains unsupported fields.'
    );
  }

  const currentPassword =
    typeof body.currentPassword ===
    'string'
      ? body.currentPassword
      : '';

  if (!currentPassword) {
    return error(
      400,
      'CURRENT_PASSWORD_REQUIRED',
      'Enter your current password.',
      'currentPassword'
    );
  }

  if (
    currentPassword.length >
    MAX_PASSWORD_LENGTH
  ) {
    return error(
      400,
      'INVALID_CURRENT_PASSWORD',
      'The current password is incorrect.',
      'currentPassword'
    );
  }

  const validation =
    validateNewPassword(
      body.newPassword
    );

  if (!validation.valid) {
    return error(
      400,
      'INVALID_NEW_PASSWORD',
      validation.message,
      'newPassword'
    );
  }

  const confirmPassword =
    typeof body.confirmPassword ===
    'string'
      ? body.confirmPassword
      : '';

  if (
    confirmPassword !==
    validation.password
  ) {
    return error(
      400,
      'PASSWORD_CONFIRMATION_MISMATCH',
      'The password confirmation does not match.',
      'confirmPassword'
    );
  }

  try {
    const result =
      await queryControl(
        `
          SELECT
            id,
            password_hash,
            status,
            deleted_at
          FROM platform_admins
          WHERE id = $1
          LIMIT 1
        `,
        [session.adminId]
      );

    const admin =
      result.rows[0];

    if (
      !admin ||
      admin.deleted_at ||
      admin.status !==
        'active' ||
      !admin.password_hash
    ) {
      return error(
        403,
        'ADMIN_ACCOUNT_UNAVAILABLE',
        'This administrator account is not currently available.'
      );
    }

    const validCurrent =
      await verifyAdminPassword(
        currentPassword,
        admin.password_hash
      );

    if (!validCurrent) {
      await safeAudit({
        request,
        adminId:
          session.adminId,
        sessionId:
          session.sessionId,
        eventType:
          'admin.password.change.failed',
        action:
          'change_own_password',
        targetType:
          'platform_admin',
        targetId:
          session.adminId,
        successful: false,
        failureReason:
          'invalid_current_password',
      });

      return error(
        400,
        'INVALID_CURRENT_PASSWORD',
        'The current password is incorrect.',
        'currentPassword'
      );
    }

    const reused =
      await verifyAdminPassword(
        validation.password,
        admin.password_hash
      );

    if (reused) {
      return error(
        400,
        'PASSWORD_REUSE_NOT_ALLOWED',
        'Your new password must be different from your current password.',
        'newPassword'
      );
    }

    const newHash =
      await hashAdminPassword(
        validation.password
      );

    const mutation =
      await queryControl(
        `
          WITH updated_admin AS (
            UPDATE platform_admins
            SET
              password_hash = $2,
              password_changed_at = NOW(),
              updated_by = $1,
              updated_at = NOW()
            WHERE id = $1
              AND status = 'active'
              AND deleted_at IS NULL
              AND password_hash = $3
            RETURNING id
          ),

          revoked_sessions AS (
            UPDATE platform_admin_sessions
            SET
              revoked_at = NOW(),
              revoked_by = $1,
              revocation_reason =
                'password_changed'
            WHERE admin_id = $1
              AND id <> $4
              AND revoked_at IS NULL
              AND EXISTS (
                SELECT 1
                FROM updated_admin
              )
            RETURNING id
          )

          SELECT
            (
              SELECT COUNT(*)
              FROM updated_admin
            )::int
              AS updated_count,

            (
              SELECT COUNT(*)
              FROM revoked_sessions
            )::int
              AS revoked_count
        `,
        [
          session.adminId,
          newHash,
          admin.password_hash,
          session.sessionId,
        ]
      );

    const mutationRow =
      mutation.rows[0];

    const updatedCount =
      Number(
        mutationRow
          ?.updated_count ||
        0
      );

    const revokedCount =
      Number(
        mutationRow
          ?.revoked_count ||
        0
      );

    if (
      updatedCount !== 1
    ) {
      await safeAudit({
        request,
        adminId:
          session.adminId,
        sessionId:
          session.sessionId,
        eventType:
          'admin.password.change.failed',
        action:
          'change_own_password',
        targetType:
          'platform_admin',
        targetId:
          session.adminId,
        successful: false,
        failureReason:
          'password_state_changed',
      });

      return error(
        409,
        'PASSWORD_STATE_CHANGED',
        'Your password changed during this request. Refresh and try again.'
      );
    }

    try {
      await resetRateLimit(
        rateLimitIdentifier,
        'admin-password-change'
      );
    } catch (resetError) {
      console.error(
        '[Admin] Password rate-limit reset failed:',
        resetError
      );
    }

    await safeAudit({
      request,
      adminId:
        session.adminId,
      sessionId:
        session.sessionId,
      eventType:
        'admin.password.changed',
      action:
        'change_own_password',
      targetType:
        'platform_admin',
      targetId:
        session.adminId,
      successful: true,
      metadata: {
        otherSessionsRevoked:
          revokedCount,
      },
    });

    return json({
      success: true,
      code:
        'ADMIN_PASSWORD_CHANGED',
      message:
        'Your password has been changed successfully.',
      otherSessionsRevoked:
        revokedCount,
    });
  } catch (requestError) {
    console.error(
      '[Admin] Password change failed:',
      requestError
    );

    return error(
      500,
      'ADMIN_PASSWORD_CHANGE_FAILED',
      'SaMi could not change your password.'
    );
  }
}