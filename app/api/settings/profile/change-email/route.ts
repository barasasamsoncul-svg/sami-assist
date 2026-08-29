import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSession } from '@/lib/auth/session';
import { queryControl, withControlTransaction } from '@/lib/db/control';
import { sendVerificationEmail } from '@/lib/services/email';

const EMAIL_CHANGE_RATE_LIMIT = 3;
const EMAIL_CHANGE_RATE_WINDOW_MINUTES = 15;
const EMAIL_CHANGE_TOKEN_EXPIRY_MINUTES = 15;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    // ---------------------------------------------------------
    // 1. AUTHENTICATION
    // ---------------------------------------------------------
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // ---------------------------------------------------------
    // 2. PARSE REQUEST
    // ---------------------------------------------------------
    let body: { newEmail?: string };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const newEmail =
      typeof body.newEmail === 'string' ? body.newEmail.trim() : '';

    // ---------------------------------------------------------
    // 3. VALIDATE INPUT
    // ---------------------------------------------------------
    if (!newEmail) {
      return NextResponse.json(
        { success: false, error: 'New email is required' },
        { status: 400 }
      );
    }

    if (newEmail.length > 255) {
      return NextResponse.json(
        { success: false, error: 'Email address is too long' },
        { status: 400 }
      );
    }

    if (!emailRegex.test(newEmail)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email address' },
        { status: 400 }
      );
    }

    const normalizedEmail = newEmail.toLowerCase();

    // ---------------------------------------------------------
    // 4. CHECK NOT SAME AS CURRENT EMAIL
    // ---------------------------------------------------------
    const currentUserResult = await queryControl(
      `SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (currentUserResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'User account not found' },
        { status: 404 }
      );
    }

    const currentEmail = currentUserResult.rows[0].email;

    if (currentEmail.toLowerCase() === normalizedEmail) {
      return NextResponse.json(
        { success: false, error: 'This is already your current email' },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // 5. RATE LIMITING
    // ---------------------------------------------------------
    const rateLimitResult = await queryControl(
      `SELECT COUNT(*) as attempt_count
       FROM audit_logs
       WHERE user_id = $1
         AND action = 'email_change_requested'
         AND module = 'identity'
         AND created_at > NOW() - INTERVAL '${EMAIL_CHANGE_RATE_WINDOW_MINUTES} minutes'`,
      [userId]
    );

    const attemptCount = parseInt(rateLimitResult.rows[0].attempt_count);

    if (attemptCount >= EMAIL_CHANGE_RATE_LIMIT) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many email change requests. Please wait ${EMAIL_CHANGE_RATE_WINDOW_MINUTES} minutes.`,
        },
        { status: 429 }
      );
    }

    // ---------------------------------------------------------
    // 6. TRANSACTION:
    //    - Check uniqueness
    //    - Invalidate previous requests
    //    - Create new token
    //    - Audit log
    // ---------------------------------------------------------
    const result = await withControlTransaction(async (client) => {
      // 6a. Check email uniqueness
      const existingEmailResult = await client.query(
        `SELECT id FROM users 
         WHERE LOWER(email) = LOWER($1) 
           AND deleted_at IS NULL
           AND id != $2`,
        [normalizedEmail, userId]
      );

      if (existingEmailResult.rows.length > 0) {
        throw new Error('EMAIL_ALREADY_IN_USE');
      }

      // 6b. Invalidate previous pending email-change requests
      await client.query(
        `UPDATE user_authenticators
         SET revoked_at = NOW()
         WHERE user_id = $1
           AND type = 'email_change'
           AND verified_at IS NULL
           AND revoked_at IS NULL`,
        [userId]
      );

      // 6c. Generate token (plaintext sent to user)
      const token = crypto.randomBytes(32).toString('hex');

      // 6d. Hash token (stored in database)
      const tokenHash = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

      // 6e. Set expiry (15 minutes)
      const expiresAt = new Date();
      expiresAt.setMinutes(
        expiresAt.getMinutes() + EMAIL_CHANGE_TOKEN_EXPIRY_MINUTES
      );

      // 6f. Store token
      await client.query(
        `INSERT INTO user_authenticators (
           user_id,
           type,
           secret_encrypted,
           label,
           expires_at,
           created_at
         ) VALUES (
           $1,
           'email_change',
           $2,
           $3,
           $4,
           NOW()
         )`,
        [userId, tokenHash, normalizedEmail, expiresAt]
      );

      // 6g. Audit log (without full PII - only domain)
      const emailDomain = normalizedEmail.split('@')[1] || 'unknown';

      await client.query(
        `INSERT INTO audit_logs (
           user_id,
           actor_type,
           action,
           resource_type,
           resource_id,
           module,
           result,
           metadata
         ) VALUES (
           $1,
           'human',
           'email_change_requested',
           'user',
           $1,
           'identity',
           'success',
           $2
         )`,
        [
          userId,
          JSON.stringify({
            requested_domain: emailDomain,
            token_expires_at: expiresAt.toISOString(),
          }),
        ]
      );

      return { token, expiresAt };
    });

    // ---------------------------------------------------------
    // 7. SEND VERIFICATION EMAIL
    // ---------------------------------------------------------
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    const emailResult = await sendVerificationEmail(
      normalizedEmail,
      result.token,
      appUrl
    );

    if (!emailResult.success) {
      console.error('Failed to send email change verification:', emailResult.error);

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to send verification email. Please try again.',
        },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------
    // 8. SUCCESS
    // ---------------------------------------------------------
    return NextResponse.json(
      {
        success: true,
        message: 'Verification email sent. Check your inbox.',
        expiresInMinutes: EMAIL_CHANGE_TOKEN_EXPIRY_MINUTES,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'EMAIL_ALREADY_IN_USE') {
      return NextResponse.json(
        { success: false, error: 'Email address is already in use' },
        { status: 409 }
      );
    }

    console.error('Change email request error:', error);

    return NextResponse.json(
      { success: false, error: 'Failed to process email change request' },
      { status: 500 }
    );
  }
}