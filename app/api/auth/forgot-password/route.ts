import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { queryControl } from '@/lib/db/control';
import { sendPasswordResetEmail } from '@/lib/services/password-reset-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESET_TOKEN_BYTES = 48;
const RESET_TOKEN_EXPIRY_MINUTES = 30;

type ForgotPasswordBody = {
  email?: unknown;
};

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
}

function generateResetToken(): string {
  return crypto
    .randomBytes(RESET_TOKEN_BYTES)
    .toString('base64url');
}

function hashToken(token: string): string {
  return crypto
    .createHash('sha256')
    .update(token, 'utf8')
    .digest('hex');
}

function getAppBaseUrl(request: NextRequest): string {
  const forwardedHost = request.headers
    .get('x-forwarded-host')
    ?.split(',')[0]
    ?.trim();

  const forwardedProto = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim();

  if (forwardedHost) {
    return `${forwardedProto || 'https'}://${forwardedHost}`;
  }

  const host = request.headers.get('host')?.trim();

  if (host) {
    const protocol =
      request.nextUrl.protocol?.replace(':', '') ||
      (host.includes('localhost') ? 'http' : 'https');

    return `${protocol}://${host}`;
  }

  return request.nextUrl.origin;
}

function successResponse() {
  return NextResponse.json(
    {
      success: true,
      message:
        'If the email exists, a password reset link has been sent.',
    },
    { status: 200 }
  );
}

function errorResponse(
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

async function recordPasswordResetRequested(
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
          'PASSWORD_RESET_REQUESTED',
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
      '[Auth] Failed to record password reset request:',
      error
    );
  }
}

export async function POST(request: NextRequest) {
  let body: ForgotPasswordBody;

  try {
    body = await request.json();
  } catch {
    return errorResponse(
      400,
      'INVALID_JSON',
      'Invalid request body.'
    );
  }

  const email = normalizeEmail(body.email);

  if (!email || !email.includes('@')) {
    return errorResponse(
      400,
      'INVALID_EMAIL',
      'Please enter a valid email address.'
    );
  }

  try {
    const userResult = await queryControl(
      `
        SELECT
          id,
          email,
          first_name,
          status
        FROM users
        WHERE LOWER(email) = LOWER($1)
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [email]
    );

    /*
      Security:
      Do not reveal whether the email exists.
      This prevents attackers from checking registered emails.
    */
    if (userResult.rows.length === 0) {
      return successResponse();
    }

    const user = userResult.rows[0];

    const userStatus = String(
      user.status || ''
    ).toLowerCase();

    const allowedStatuses = [
      'active',
      'locked',
      'pending_verification',
    ];

    if (!allowedStatuses.includes(userStatus)) {
      return successResponse();
    }

    const rawToken = generateResetToken();

    const tokenHash = hashToken(rawToken);

    const expiresAt = new Date(
      Date.now() +
        RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000
    );

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

    await queryControl(
      `
        INSERT INTO password_reset_tokens (
          user_id,
          token_hash,
          expires_at,
          created_at
        )
        VALUES (
          $1,
          $2,
          $3,
          NOW()
        )
      `,
      [user.id, tokenHash, expiresAt]
    );

    const resetUrl =
      `${getAppBaseUrl(request)}/reset-password` +
      `?token=${encodeURIComponent(rawToken)}` +
      `&email=${encodeURIComponent(user.email)}`;

    const emailResult =
      await sendPasswordResetEmail({
        email: user.email,
        firstName: user.first_name || '',
        resetUrl,
      });

    if (!emailResult.success) {
      console.error(
        '[Auth] Failed to send password reset email:',
        emailResult.error
      );
    }

    await recordPasswordResetRequested(user.id);

    return successResponse();
  } catch (error) {
    console.error(
      '[Auth] Forgot password failed:',
      error
    );

    return errorResponse(
      500,
      'FORGOT_PASSWORD_FAILED',
      'Something went wrong. Please try again.'
    );
  }
}