import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { queryControl } from '@/lib/db/control';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeCode(value: unknown): string {
  return String(value || '').replace(/\D/g, '').slice(0, 6);
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const email = normalizeEmail(body.email);
    const code = normalizeCode(body.code);

    if (!isValidEmail(email)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Enter a valid email address.',
        },
        { status: 400 }
      );
    }

    if (code.length !== 6) {
      return NextResponse.json(
        {
          success: false,
          error: 'Enter the 6-digit verification code.',
        },
        { status: 400 }
      );
    }

    const codeHash = hashCode(code);

    const verificationResult = await queryControl(
      `
        SELECT
          id,
          email,
          expires_at,
          used_at
        FROM email_verifications
        WHERE LOWER(email) = LOWER($1)
          AND code_hash = $2
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [email, codeHash]
    );

    if (verificationResult.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid verification code.',
        },
        { status: 400 }
      );
    }

    const verification = verificationResult.rows[0];

    if (verification.used_at) {
      return NextResponse.json(
        {
          success: false,
          error: 'This verification code has already been used.',
        },
        { status: 400 }
      );
    }

    if (new Date(verification.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        {
          success: false,
          error: 'This verification code has expired.',
        },
        { status: 400 }
      );
    }

    const userResult = await queryControl(
      `
        SELECT
          id,
          email,
          status
        FROM users
        WHERE LOWER(email) = LOWER($1)
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [email]
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

    await queryControl(
      `
        UPDATE email_verifications
        SET used_at = NOW()
        WHERE id = $1
      `,
      [verification.id]
    );

    if (String(user.status).toLowerCase() !== 'active') {
      await queryControl(
        `
          UPDATE users
          SET
            status = 'active',
            updated_at = NOW()
          WHERE id = $1
        `,
        [user.id]
      );
    }

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
        'EMAIL_VERIFIED',
        'user',
        user.id,
        request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip') ||
          null,
        request.headers.get('user-agent') || null,
        JSON.stringify({ email }),
      ]
    ).catch((error) => {
      console.error('[Auth] Failed to write email verification audit log:', error);
    });

    return NextResponse.json({
      success: true,
      message: 'Email verified successfully.',
      next: '/login?verified=1',
    });
  } catch (error) {
    console.error('[Auth] Email verification failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Could not verify email. Please try again.',
      },
      { status: 500 }
    );
  }
}