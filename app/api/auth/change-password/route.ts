import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  requireSession,
} from '@/lib/auth/session';

import {
  hashPassword,
  verifyPassword,
} from '@/lib/auth/password';

import {
  checkRateLimit,
  resetRateLimit,
} from '@/lib/auth/rate-limit';

import {
  getClientIp,
  recordAuthEvent,
} from '@/lib/auth/auth-events';

import {
  queryControl,
} from '@/lib/db/control';

import {
  notifyCriticalSecurityEvent,
} from '@/lib/security/notifications';

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
    typeof recordAuthEvent
  >[0]
) {
  try {
    await recordAuthEvent(input);
  } catch (auditError) {
    console.error(
      '[Auth] Password audit failed:',
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
      await requireSession();
  } catch {
    return error(
      401,
      'UNAUTHENTICATED',
      'Your session has expired. Sign in again.'
    );
  }

  const ip =
    getClientIp(request) ||
    'unknown-ip';

  const rateLimitIdentifier =
    `password-change:${session.user.id}:${ip}`;

  let rateLimit;

  try {
    rateLimit =
      await checkRateLimit({
        identifier:
          rateLimitIdentifier,
        action:
          'password-change',
        maxAttempts:
          RATE_LIMIT_MAX_ATTEMPTS,
        windowMs:
          RATE_LIMIT_WINDOW_MS,
        blockMs:
          RATE_LIMIT_BLOCK_MS,
      });
  } catch (rateLimitError) {
    console.error(
      '[Auth] Password rate limiter failed:',
      rateLimitError
    );

    return error(
      503,
      'SECURITY_SERVICE_UNAVAILABLE',
      'SaMi security services are temporarily unavailable.'
    );
  }

  if (!rateLimit.allowed) {
    const retryAfter =
      rateLimit.retryAfterSeconds ||
      60;

    await safeAudit({
      request,
      userId:
        session.user.id,
      eventType:
        'PASSWORD_CHANGE_RATE_LIMITED',
      metadata: {
        retryAfterSeconds:
          retryAfter,
      },
    });

    return error(
      429,
      'PASSWORD_CHANGE_RATE_LIMITED',
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
      'CURRENT_PASSWORD_INCORRECT',
      'Current password is incorrect.',
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
      'PASSWORDS_DO_NOT_MATCH',
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
            status
          FROM users
          WHERE id = $1
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [session.user.id]
      );

    const user =
      result.rows[0];

    if (
      !user ||
      user.status !==
        'active'
    ) {
      return error(
        403,
        'ACCOUNT_UNAVAILABLE',
        'This account is not currently available.'
      );
    }

    if (!user.password_hash) {
      return error(
        400,
        'PASSWORD_NOT_SET',
        'This account does not currently have a password.'
      );
    }

    const validCurrent =
      await verifyPassword(
        currentPassword,
        user.password_hash
      );

    if (!validCurrent) {
      await safeAudit({
        request,
        userId: user.id,
        eventType:
          'PASSWORD_CHANGE_FAILED',
        metadata: {
          reason:
            'invalid_current_password',
        },
      });

      return error(
        400,
        'CURRENT_PASSWORD_INCORRECT',
        'Current password is incorrect.',
        'currentPassword'
      );
    }

    const reused =
      await verifyPassword(
        validation.password,
        user.password_hash
      );

    if (reused) {
      return error(
        400,
        'PASSWORD_REUSED',
        'Your new password must be different from your current password.',
        'newPassword'
      );
    }

    const newHash =
      await hashPassword(
        validation.password
      );

    const mutation =
      await queryControl(
        `
          WITH updated_user AS (
            UPDATE users
            SET
              password_hash = $2,
              password_changed_at = NOW(),
              updated_at = NOW()
            WHERE id = $1
              AND status = 'active'
              AND deleted_at IS NULL
              AND password_hash = $3
            RETURNING id
          ),

          revoked_sessions AS (
            UPDATE sessions
            SET
              revoked_at = NOW(),
              is_current = FALSE,
              updated_at = NOW()
            WHERE user_id = $1
              AND id <> $4
              AND revoked_at IS NULL
              AND deleted_at IS NULL
              AND EXISTS (
                SELECT 1
                FROM updated_user
              )
            RETURNING id
          )

          SELECT
            (
              SELECT COUNT(*)
              FROM updated_user
            )::int
              AS updated_count,

            (
              SELECT COUNT(*)
              FROM revoked_sessions
            )::int
              AS revoked_count
        `,
        [
          user.id,
          newHash,
          user.password_hash,
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
      return error(
        409,
        'PASSWORD_STATE_CHANGED',
        'Your password changed during this request. Refresh and try again.'
      );
    }

    try {
      await resetRateLimit(
        rateLimitIdentifier,
        'password-change'
      );
    } catch (resetError) {
      console.error(
        '[Auth] Password rate-limit reset failed:',
        resetError
      );
    }

    await safeAudit({
      request,
      userId: user.id,
      eventType:
        'PASSWORD_CHANGED',
      metadata: {
        otherSessionsRevoked:
          revokedCount,
      },
    });

    await notifyCriticalSecurityEvent({
      tenantId:
        session.currentTenantId,
      userId:
        user.id,
      eventKey:
        'security.password_changed',
      title:
        'Password changed',
      message:
        'Your SaMi password was changed. Other active sessions were revoked where applicable. If this was not you, secure your account immediately.',
      dedupeKey:
        `security:password-changed:${user.id}:${Date.now()}`,
      metadata: {
        otherSessionsRevoked:
          revokedCount,
      },
    });

    return json({
      success: true,
      code:
        'PASSWORD_CHANGED',
      message:
        'Your password has been changed successfully.',
      otherSessionsRevoked:
        revokedCount,
    });
  } catch (requestError) {
    console.error(
      '[Auth] Password change failed:',
      requestError
    );

    return error(
      500,
      'PASSWORD_CHANGE_FAILED',
      'SaMi could not change your password.'
    );
  }
}