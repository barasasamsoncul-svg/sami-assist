import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { queryControl } from '@/lib/db/control';
import { hashPassword } from '@/lib/auth/password';
import { revokeAllSessions } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ResetPasswordBody = {
  token?: unknown;
  password?: unknown;
};

function normalizeToken(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function normalizePassword(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value;
}

function hashToken(token: string): string {
  return crypto
    .createHash('sha256')
    .update(token, 'utf8')
    .digest('hex');
}

function jsonError(
  status: number,
  code: string,
  message: string
) {
  return NextResponse.json(
    {
      success: false,
      code,
      message,
    },
    { status }
  );
}

async function recordPasswordResetCompleted(
  userId: string
): Promise<void> {
  try {
    await queryControl(
      `
        INSERT INTO audit_logs (
          tenant_id,
          user_id,
          event_type,
          entity_type,
          entity_id,
          metadata,
          created_at
        )
        VALUES (
          NULL,
          $1,
          'PASSWORD_RESET_COMPLETED',
          'auth',
          $1,
          '{}'::jsonb,
          NOW()
        )
      `,
      [userId]
    );
  } catch (error) {
    console.error(
      '[Auth] Failed to record password reset completion:',
      error
    );
  }
}

export async function POST(request: NextRequest) {
  let body: ResetPasswordBody;

  try {
    body = await request.json();
  } catch {
    return jsonError(
      400,
      'INVALID_JSON',
      'Invalid request body.'
    );
  }

  const token = normalizeToken(body.token);

  const password =
    normalizePassword(body.password);

  if (!token || token.length < 40) {
    return jsonError(
      400,
      'INVALID_TOKEN',
      'The reset link is invalid.'
    );
  }

  if (password.length < 8) {
    return jsonError(
      400,
      'WEAK_PASSWORD',
      'Password must be at least 8 characters.'
    );
  }

  try {
    const tokenHash = hashToken(token);

    const newPasswordHash =
      await hashPassword(password);

    const result = await queryControl(
      `
        WITH used_token AS (
          UPDATE password_reset_tokens prt
          SET used_at = NOW()
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
            status = CASE
              WHEN LOWER(u.status) = 'locked'
              THEN 'active'
              ELSE u.status
            END,
            updated_at = NOW()
          FROM used_token ut
          WHERE u.id = ut.user_id
          RETURNING
            u.id,
            u.email,
            u.status
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

    if (result.rows.length === 0) {
      return jsonError(
        400,
        'INVALID_OR_EXPIRED_TOKEN',
        'This reset link is invalid or has expired.'
      );
    }

    const user = result.rows[0];

    await queryControl(
      `
        UPDATE password_reset_tokens
        SET deleted_at = NOW()
        WHERE user_id = $1
          AND used_at IS NULL
          AND deleted_at IS NULL
      `,
      [user.id]
    );

    await revokeAllSessions(user.id);

    await recordPasswordResetCompleted(user.id);

    return NextResponse.json(
      {
        success: true,
        message:
          'Password reset successfully. Please sign in with your new password.',
        next: '/login?reason=password_reset',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      '[Auth] Reset password failed:',
      error
    );

    return jsonError(
      500,
      'RESET_PASSWORD_FAILED',
      'Something went wrong while resetting your password.'
    );
  }
}