
import {
  NextRequest,
  NextResponse,
} from 'next/server';

import crypto from 'crypto';

import {
  queryControl,
} from '@/lib/db/control';

import {
  hashPassword,
} from '@/lib/auth/password';

import {
  clearSessionCookie,
} from '@/lib/auth/session';

import {
  recordAuthEvent,
} from '@/lib/auth/auth-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   CONSTANTS
   ============================================================ */

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

const MIN_RESET_TOKEN_LENGTH = 40;
const MAX_RESET_TOKEN_LENGTH = 512;

/* ============================================================
   TYPES
   ============================================================ */

type ResetPasswordBody = {
  token?: unknown;
  newPassword?: unknown;
  confirmPassword?: unknown;
};

type ResetUserRow = {
  id: string;
  email: string;
  status: string;
};

/* ============================================================
   NORMALIZATION
   ============================================================ */

function normalizeToken(
  value: unknown
): string {
  if (
    typeof value !== 'string'
  ) {
    return '';
  }

  return value.trim();
}

function normalizePassword(
  value: unknown
): string {
  if (
    typeof value !== 'string'
  ) {
    return '';
  }

  /*
   * Do not trim passwords.
   *
   * Spaces may intentionally be part of the password.
   */
  return value;
}

/* ============================================================
   TOKEN HASH
   ============================================================ */

function hashToken(
  token: string
): string {
  return crypto
    .createHash('sha256')
    .update(
      token,
      'utf8'
    )
    .digest('hex');
}

/* ============================================================
   RESPONSE HELPERS
   ============================================================ */

function jsonResponse(
  body: Record<
    string,
    unknown
  >,
  status = 200
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

function jsonError(
  status: number,
  code: string,
  error: string
) {
  return jsonResponse(
    {
      success: false,
      code,
      error,
    },
    status
  );
}

/* ============================================================
   AUDIT
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
    /*
     * Audit failure must not undo a successfully completed
     * password reset.
     */
    console.error(
      '[Auth] Failed to record password reset event:',
      error
    );
  }
}

/* ============================================================
   CLEAR LOCAL COOKIE
   ============================================================ */

async function safelyClearSessionCookie() {
  try {
    /*
     * Every server-side session has already been revoked by
     * the atomic password-reset query below.
     *
     * This removes a stale SaMi cookie from the browser that
     * performed the password reset.
     */
    await clearSessionCookie();
  } catch (error) {
    console.error(
      '[Auth] Failed to clear session cookie after password reset:',
      error
    );
  }
}

/* ============================================================
   POST /api/auth/reset-password
   ============================================================ */

export async function POST(
  request: NextRequest
) {
  /* ==========================================================
     1. PARSE REQUEST
     ========================================================== */

  let body:
    ResetPasswordBody;

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
      return jsonError(
        400,
        'INVALID_REQUEST',
        'Invalid request body.'
      );
    }

    body =
      parsed as ResetPasswordBody;
  } catch {
    return jsonError(
      400,
      'INVALID_REQUEST',
      'Invalid request body.'
    );
  }

  /* ==========================================================
     2. NORMALIZE
     ========================================================== */

  const token =
    normalizeToken(
      body.token
    );

  const newPassword =
    normalizePassword(
      body.newPassword
    );

  const confirmPassword =
    normalizePassword(
      body.confirmPassword
    );

  /* ==========================================================
     3. TOKEN VALIDATION
     ========================================================== */

  if (
    !token ||
    token.length <
      MIN_RESET_TOKEN_LENGTH ||
    token.length >
      MAX_RESET_TOKEN_LENGTH
  ) {
    return jsonError(
      400,
      'RESET_TOKEN_INVALID',
      'This reset link is invalid or has expired.'
    );
  }

  /* ==========================================================
     4. PASSWORD VALIDATION
     ========================================================== */

  if (!newPassword) {
    return jsonError(
      400,
      'PASSWORD_REQUIRED',
      'Enter your new password.'
    );
  }

  if (!confirmPassword) {
    return jsonError(
      400,
      'PASSWORDS_DO_NOT_MATCH',
      'Confirm your new password.'
    );
  }

  if (
    newPassword !==
    confirmPassword
  ) {
    return jsonError(
      400,
      'PASSWORDS_DO_NOT_MATCH',
      'New password and confirmation password must match.'
    );
  }

  if (
    newPassword.length <
      MIN_PASSWORD_LENGTH ||
    newPassword.length >
      MAX_PASSWORD_LENGTH ||
    !/[A-Z]/.test(newPassword) ||
    !/[a-z]/.test(newPassword) ||
    !/[0-9]/.test(newPassword)
  ) {
    return jsonError(
      400,
      'PASSWORD_WEAK',
      'Use at least 8 characters with uppercase, lowercase and a number.'
    );
  }

  try {
    /* ========================================================
       5. HASH VALUES
       ======================================================== */

    const tokenHash =
      hashToken(
        token
      );

    const newPasswordHash =
      await hashPassword(
        newPassword
      );

    /* ========================================================
       6. ATOMIC PASSWORD RESET

       One database statement performs all security-sensitive
       mutations:

       - consume the reset token
       - replace password
       - clear account login lock
       - reset failed login attempts
       - revoke every session
       - invalidate every other reset token

       If the reset token has already been consumed by another
       request, no user update occurs.
       ======================================================== */

    const result =
      await queryControl(
        `
          WITH consumed_token AS (
            UPDATE password_reset_tokens prt

            SET
              used_at = NOW()

            FROM users u

            WHERE prt.user_id = u.id
              AND prt.token_hash = $1
              AND prt.used_at IS NULL
              AND prt.deleted_at IS NULL
              AND prt.expires_at > NOW()
              AND u.deleted_at IS NULL
              AND LOWER(u.status) IN (
                'active',
                'locked',
                'pending_verification'
              )

            RETURNING
              prt.user_id
          ),

          updated_user AS (
            UPDATE users u

            SET
              password_hash = $2,

              failed_login_attempts = 0,

              locked_until = NULL,

              status =
                CASE
                  WHEN LOWER(u.status) = 'locked'
                  THEN 'active'
                  ELSE u.status
                END,

              updated_at = NOW()

            FROM consumed_token ct

            WHERE u.id = ct.user_id
              AND u.deleted_at IS NULL

            RETURNING
              u.id,
              u.email,
              u.status
          ),

          revoked_sessions AS (
            UPDATE sessions s

            SET
              is_current = FALSE,

              revoked_at =
                COALESCE(
                  s.revoked_at,
                  NOW()
                )

            WHERE s.user_id IN (
              SELECT id
              FROM updated_user
            )

              AND s.revoked_at IS NULL

            RETURNING
              s.id
          ),

          invalidated_tokens AS (
            UPDATE password_reset_tokens prt

            SET
              deleted_at = NOW()

            WHERE prt.user_id IN (
              SELECT id
              FROM updated_user
            )

              AND prt.used_at IS NULL
              AND prt.deleted_at IS NULL

            RETURNING
              prt.user_id
          )

          SELECT
            id,
            email,
            status

          FROM updated_user
        `,
        [
          tokenHash,
          newPasswordHash,
        ]
      );

    /* ========================================================
       7. INVALID / USED / EXPIRED TOKEN
       ======================================================== */

    if (
      result.rows.length ===
      0
    ) {
      return jsonError(
        400,
        'RESET_TOKEN_INVALID',
        'This reset link is invalid or has expired.'
      );
    }

    const user =
      result.rows[0] as ResetUserRow;

    /* ========================================================
       8. REMOVE CURRENT BROWSER SESSION COOKIE
       ======================================================== */

    await safelyClearSessionCookie();

    /* ========================================================
       9. AUDIT
       ======================================================== */

    await safeRecordAuthEvent({
      request,

      userId:
        user.id,

      eventType:
        'PASSWORD_RESET_COMPLETED',

      entityType:
        'user',

      entityId:
        user.id,

      metadata: {
        /*
         * Never log:
         * - password
         * - password hash
         * - reset token
         * - reset token hash
         */
        sessionsRevoked:
          true,
      },
    });

    /* ========================================================
       10. SUCCESS
       ======================================================== */

    return jsonResponse(
      {
        success: true,

        code:
          'PASSWORD_RESET_SUCCESS',

        message:
          'Password reset successfully. Please sign in with your new password.',

        next:
          '/login?reason=password_reset',
      },
      200
    );
  } catch (error) {
    console.error(
      '[Auth] Reset password failed:',
      error
    );

    return jsonError(
      500,
      'PASSWORD_RESET_ERROR',
      'Something went wrong while resetting your password.'
    );
  }
}