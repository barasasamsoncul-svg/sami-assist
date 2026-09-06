import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import { requireSession } from '@/lib/auth/session';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validatePassword(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters.';
  }

  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter.';
  }

  if (!/[a-z]/.test(password)) {
    return 'Password must include at least one lowercase letter.';
  }

  if (!/[0-9]/.test(password)) {
    return 'Password must include at least one number.';
  }

  return null;
}

function getClientIp(request: NextRequest): string | null {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null
  );
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();

    const body = await request.json().catch(() => ({}));

    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    const confirmPassword = String(body.confirmPassword || '');

    if (!currentPassword) {
      return NextResponse.json(
        {
          success: false,
          error: 'Current password is required.',
        },
        { status: 400 }
      );
    }

    const passwordError = validatePassword(newPassword);

    if (passwordError) {
      return NextResponse.json(
        {
          success: false,
          error: passwordError,
        },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        {
          success: false,
          error: 'New passwords do not match.',
        },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        {
          success: false,
          error:
            'New password must be different from your current password.',
        },
        { status: 400 }
      );
    }

    const userResult = await queryControl(
      `
        SELECT
          id,
          email,
          password_hash,
          status
        FROM users
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [session.user.id]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Account not found.',
        },
        { status: 404 }
      );
    }

    const user = userResult.rows[0];

    if (!user.password_hash) {
      return NextResponse.json(
        {
          success: false,
          error:
            'This account does not have a password yet. Use reset password to create one.',
        },
        { status: 400 }
      );
    }

    const passwordMatches = await verifyPassword(
      currentPassword,
      user.password_hash
    );

    if (!passwordMatches) {
      await queryControl(
        `
          INSERT INTO audit_logs (
            user_id,
            event_type,
            entity_type,
            entity_id,
            ip_address,
            user_agent,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          user.id,
          'PASSWORD_CHANGE_FAILED',
          'user',
          user.id,
          getClientIp(request),
          request.headers.get('user-agent') || null,
          JSON.stringify({
            reason: 'invalid_current_password',
          }),
        ]
      ).catch((error) => {
        console.error(
          '[Auth] Failed to write password change failure audit log:',
          error
        );
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Current password is incorrect.',
        },
        { status: 400 }
      );
    }

    const newPasswordHash = await hashPassword(newPassword);

    await queryControl(
      `
        UPDATE users
        SET
          password_hash = $2,
          updated_at = NOW()
        WHERE id = $1
      `,
      [user.id, newPasswordHash]
    );

    await queryControl(
      `
        UPDATE sessions
        SET
          revoked_at = NOW(),
          is_current = FALSE,
          updated_at = NOW()
        WHERE user_id = $1
          AND id <> $2
          AND revoked_at IS NULL
          AND deleted_at IS NULL
      `,
      [user.id, session.sessionId]
    ).catch((error) => {
      console.error(
        '[Auth] Failed to revoke other sessions after password change:',
        error
      );
    });

    await queryControl(
      `
        INSERT INTO audit_logs (
          user_id,
          event_type,
          entity_type,
          entity_id,
          ip_address,
          user_agent,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        user.id,
        'PASSWORD_CHANGED',
        'user',
        user.id,
        getClientIp(request),
        request.headers.get('user-agent') || null,
        JSON.stringify({
          revokedOtherSessions: true,
        }),
      ]
    ).catch((error) => {
      console.error(
        '[Auth] Failed to write password changed audit log:',
        error
      );
    });

    return NextResponse.json({
      success: true,
      message: 'Password changed successfully.',
    });
  } catch (error) {
    console.error('[Auth] Change password failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Could not change password.',
      },
      { status: 500 }
    );
  }
}