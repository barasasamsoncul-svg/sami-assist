
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

import { queryControl } from '@/lib/db/control';

export const runtime = 'nodejs';

// ============================================================
// CONSTANTS
// ============================================================

const MAX_PASSWORD_LENGTH = 128;
const MIN_PASSWORD_LENGTH = 8;

// ============================================================
// HELPERS
// ============================================================

function hashResetToken(token: string): string {
  return crypto
    .createHash('sha256')
    .update(token, 'utf8')
    .digest('hex');
}

// ============================================================
// POST /api/auth/reset-password
// ============================================================

/**
 * Password reset flow:
 *
 * Reset page
 *     ↓
 * Token + new password
 *     ↓
 * Hash token
 *     ↓
 * Atomically consume valid token
 *     ↓
 * Update password hash
 *     ↓
 * Revoke ALL existing sessions
 *     ↓
 * Return success
 *
 * The raw reset token is never stored in the database.
 */

export async function POST(
  request: NextRequest
) {
  try {
    // ========================================================
    // 1. PARSE REQUEST
    // ========================================================

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          code: 'INVALID_REQUEST',
          error: 'Invalid request body.',
        },
        {
          status: 400,
        }
      );
    }

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        {
          success: false,
          code: 'INVALID_REQUEST',
          error: 'Invalid request body.',
        },
        {
          status: 400,
        }
      );
    }

    const data = body as {
      token?: unknown;
      password?: unknown;
      confirmPassword?: unknown;
    };

    // ========================================================
    // 2. VALIDATE INPUT
    // ========================================================

    const token =
      typeof data.token === 'string'
        ? data.token.trim()
        : '';

    const password =
      typeof data.password === 'string'
        ? data.password
        : '';

    const confirmPassword =
      typeof data.confirmPassword === 'string'
        ? data.confirmPassword
        : '';

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          code: 'INVALID_RESET_TOKEN',
          error:
            'This password reset link is invalid or has expired.',
        },
        {
          status: 400,
        }
      );
    }

    if (!password) {
      return NextResponse.json(
        {
          success: false,
          code: 'PASSWORD_REQUIRED',
          error: 'New password is required.',
        },
        {
          status: 400,
        }
      );
    }

    if (
      password.length <
      MIN_PASSWORD_LENGTH
    ) {
      return NextResponse.json(
        {
          success: false,
          code: 'WEAK_PASSWORD',
          error:
            'Password must be at least 8 characters.',
        },
        {
          status: 400,
        }
      );
    }

    if (
      password.length >
      MAX_PASSWORD_LENGTH
    ) {
      return NextResponse.json(
        {
          success: false,
          code: 'INVALID_PASSWORD',
          error:
            'Password is too long.',
        },
        {
          status: 400,
        }
      );
    }

    if (
      confirmPassword &&
      password !== confirmPassword
    ) {
      return NextResponse.json(
        {
          success: false,
          code: 'PASSWORD_MISMATCH',
          error:
            'Passwords do not match.',
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // 3. HASH TOKEN
    // ========================================================

    const tokenHash =
      hashResetToken(token);

    // ========================================================
    // 4. HASH NEW PASSWORD
    // ========================================================

    const passwordHash =
      await bcrypt.hash(
        password,
        12
      );

    // ========================================================
    // 5. ATOMICALLY CONSUME RESET TOKEN
    // ========================================================

    /**
     * PostgreSQL UPDATE ... RETURNING ensures the token can
     * only be consumed once.
     */

    const resetResult =
      await queryControl(
        `
          UPDATE password_resets
          SET
            used_at = NOW()
          WHERE id = (
            SELECT id
            FROM password_resets
            WHERE token_hash = $1
              AND expires_at > NOW()
              AND used_at IS NULL
              AND deleted_at IS NULL
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          )
          RETURNING
            id,
            user_id
        `,
        [tokenHash]
      );

    if (
      resetResult.rows.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          code: 'INVALID_RESET_TOKEN',
          error:
            'This password reset link is invalid or has expired.',
        },
        {
          status: 400,
        }
      );
    }

    const reset =
      resetResult.rows[0];

    // ========================================================
    // 6. UPDATE PASSWORD
    // ========================================================

    const userResult =
      await queryControl(
        `
          UPDATE users
          SET
            password_hash = $1,
            updated_at = NOW()
          WHERE id = $2
            AND deleted_at IS NULL
          RETURNING
            id,
            email,
            first_name
        `,
        [
          passwordHash,
          reset.user_id,
        ]
      );

    if (
      userResult.rows.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          code: 'PASSWORD_RESET_FAILED',
          error:
            'Unable to reset your password. Please try again.',
        },
        {
          status: 409,
        }
      );
    }

    // ========================================================
    // 7. INVALIDATE OTHER RESET TOKENS
    // ========================================================

    await queryControl(
      `
        UPDATE password_resets
        SET
          deleted_at = NOW()
        WHERE user_id = $1
          AND used_at IS NULL
          AND deleted_at IS NULL
      `,
      [reset.user_id]
    );

    // ========================================================
    // 8. REVOKE ALL SESSIONS
    // ========================================================

    /**
     * Password recovery is a security-sensitive event.
     *
     * Any previously authenticated browser/device must be
     * forced to authenticate again with the new password.
     */

    await queryControl(
      `
        UPDATE sessions
        SET
          is_current = false,
          revoked_at = NOW()
        WHERE user_id = $1
          AND revoked_at IS NULL
      `,
      [reset.user_id]
    );

    // ========================================================
    // 9. SUCCESS
    // ========================================================

    return NextResponse.json(
      {
        success: true,
        passwordReset: true,
        message:
          'Your password has been reset successfully. Please sign in with your new password.',
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      '[SaMi] Reset-password error:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        code: 'PASSWORD_RESET_FAILED',
        error:
          'Unable to reset your password right now. Please try again.',
      },
      {
        status: 500,
      }
    );
  }
}