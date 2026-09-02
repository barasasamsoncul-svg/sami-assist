import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import crypto from 'crypto';
import { sendVerificationEmail } from '@/lib/services/email';

export const runtime = 'nodejs';

const CODE_EXPIRY_MINUTES = 15;
const RESEND_COOLDOWN_SECONDS = 60;

export async function POST(request: NextRequest) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request body',
        },
        { status: 400 }
      );
    }

    const email =
      typeof (body as { email?: unknown })?.email === 'string'
        ? (body as { email: string }).email.trim().toLowerCase()
        : '';

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email required',
        },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please enter a valid email address',
        },
        { status: 400 }
      );
    }

    const userResult = await queryControl(
      `
        SELECT id, first_name, email_verified_at, status
        FROM users
        WHERE email = $1 AND deleted_at IS NULL
        LIMIT 1
      `,
      [email]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unable to send a verification code. Please check your email address.',
        },
        { status: 404 }
      );
    }

    const user = userResult.rows[0];

    if (user.email_verified_at) {
      return NextResponse.json(
        {
          success: false,
          alreadyVerified: true,
          error: 'This email address is already verified.',
        },
        { status: 409 }
      );
    }

    // Check cooldown
    const recentCodeResult = await queryControl(
      `
        SELECT id, created_at
        FROM email_verifications
        WHERE email = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [email]
    );

    if (recentCodeResult.rows.length > 0) {
      const recentCode = recentCodeResult.rows[0];
      const createdAt = new Date(recentCode.created_at);
      const secondsSinceLastCode = Math.floor((Date.now() - createdAt.getTime()) / 1000);

      if (secondsSinceLastCode < RESEND_COOLDOWN_SECONDS) {
        const retryAfter = Math.max(1, RESEND_COOLDOWN_SECONDS - secondsSinceLastCode);

        return NextResponse.json(
          {
            success: false,
            error: `Please wait ${retryAfter} seconds before requesting another code.`,
            retryAfter,
          },
          {
            status: 429,
            headers: {
              'Retry-After': retryAfter.toString(),
            },
          }
        );
      }
    }

    // Invalidate old codes
    await queryControl(
      `
        UPDATE email_verifications
        SET deleted_at = NOW()
        WHERE email = $1 AND deleted_at IS NULL
      `,
      [email]
    );

    // Generate new code
    const code = crypto.randomInt(100000, 1000000).toString();
    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

    const verificationResult = await queryControl(
      `
        INSERT INTO email_verifications (email, code_hash, expires_at, created_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id
      `,
      [email, hashedCode, expiresAt]
    );

    const verificationId = verificationResult.rows[0]?.id;

    // Send email
    try {
      await sendVerificationEmail(email, code, user.first_name || 'there');
    } catch (emailError) {
      console.error('Verification email send error:', emailError);

      if (verificationId) {
        await queryControl(
          `
            UPDATE email_verifications
            SET deleted_at = NOW()
            WHERE id = $1 AND deleted_at IS NULL
          `,
          [verificationId]
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: 'We could not send the verification email. Please try again.',
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Verification code sent successfully.',
        expiresIn: CODE_EXPIRY_MINUTES * 60,
        cooldown: RESEND_COOLDOWN_SECONDS,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Resend verification error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send verification code. Please try again.',
      },
      { status: 500 }
    );
  }
}