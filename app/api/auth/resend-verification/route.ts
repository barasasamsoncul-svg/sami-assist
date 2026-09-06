import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { queryControl } from '@/lib/db/control';
import { sendVerificationEmail } from '@/lib/services/email-verification-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CODE_EXPIRY_MINUTES = 10;

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashCode(code: string): string {
  return crypto
    .createHash('sha256')
    .update(code)
    .digest('hex');
}

function createVerificationCode(): string {
  return String(crypto.randomInt(100000, 999999));
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
    const protocol = host.includes('localhost')
      ? 'http'
      : 'https';

    return `${protocol}://${host}`;
  }

  return request.nextUrl.origin;
}

function successResponse() {
  return NextResponse.json({
    success: true,
    message:
      'If this email needs verification, a new code has been sent.',
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const email = normalizeEmail(body.email);

    if (!isValidEmail(email)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Enter a valid email address.',
        },
        { status: 400 }
      );
    }

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

    if (userResult.rows.length === 0) {
      return successResponse();
    }

    const user = userResult.rows[0];

    if (String(user.status).toLowerCase() === 'active') {
      return successResponse();
    }

    if (
      String(user.status).toLowerCase() !==
      'pending_verification'
    ) {
      return successResponse();
    }

    const code = createVerificationCode();
    const codeHash = hashCode(code);

    const expiresAt = new Date(
      Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000
    );

    await queryControl(
      `
        UPDATE email_verifications
        SET deleted_at = NOW()
        WHERE LOWER(email) = LOWER($1)
          AND used_at IS NULL
          AND deleted_at IS NULL
      `,
      [email]
    );

    await queryControl(
      `
        INSERT INTO email_verifications (
          email,
          code_hash,
          expires_at
        )
        VALUES ($1, $2, $3)
      `,
      [email, codeHash, expiresAt]
    );

    const verifyUrl = `${getAppBaseUrl(
      request
    )}/verify-email?email=${encodeURIComponent(email)}`;

    await sendVerificationEmail({
      email,
      firstName: user.first_name || null,
      code,
      verifyUrl,
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
        'EMAIL_VERIFICATION_RESENT',
        'user',
        user.id,
        request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip') ||
          null,
        request.headers.get('user-agent') || null,
        JSON.stringify({
          email,
        }),
      ]
    ).catch((error) => {
      console.error(
        '[Auth] Failed to write resend verification audit log:',
        error
      );
    });

    return successResponse();
  } catch (error) {
    console.error(
      '[Auth] Resend verification failed:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          'Could not resend verification code. Please try again.',
      },
      { status: 500 }
    );
  }
}