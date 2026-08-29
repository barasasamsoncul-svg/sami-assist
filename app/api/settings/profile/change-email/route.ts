import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSession } from '@/lib/auth/session';
import { queryControl, withControlTransaction } from '@/lib/db/control';
import { sendEmailChangeCode } from '@/lib/services/email';

const EMAIL_CHANGE_RATE_LIMIT = 3;
const EMAIL_CHANGE_RATE_WINDOW_MINUTES = 15;
const EMAIL_CHANGE_CODE_EXPIRY_MINUTES = 10;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    // 1. AUTHENTICATION
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. PARSE REQUEST
    let body: { newEmail?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const newEmail = typeof body.newEmail === 'string' ? body.newEmail.trim() : '';

    // 3. VALIDATE
    if (!newEmail) {
      return NextResponse.json({ success: false, error: 'New email is required' }, { status: 400 });
    }
    if (newEmail.length > 255) {
      return NextResponse.json({ success: false, error: 'Email too long' }, { status: 400 });
    }
    if (!emailRegex.test(newEmail)) {
      return NextResponse.json({ success: false, error: 'Invalid email address' }, { status: 400 });
    }

    const normalizedEmail = newEmail.toLowerCase();

    // 4. CHECK NOT SAME
    const currentUserResult = await queryControl(
      `SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    if (currentUserResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }
    if (currentUserResult.rows[0].email.toLowerCase() === normalizedEmail) {
      return NextResponse.json({ success: false, error: 'This is already your email' }, { status: 400 });
    }

    // 5. RATE LIMIT
    const rateLimitResult = await queryControl(
      `SELECT COUNT(*) as attempt_count
       FROM audit_logs
       WHERE user_id = $1
         AND action = 'email_change_requested'
         AND created_at > NOW() - INTERVAL '${EMAIL_CHANGE_RATE_WINDOW_MINUTES} minutes'`,
      [userId]
    );
    if (parseInt(rateLimitResult.rows[0].attempt_count) >= EMAIL_CHANGE_RATE_LIMIT) {
      return NextResponse.json({ success: false, error: 'Too many requests. Try again in 15 minutes.' }, { status: 429 });
    }

    // 6. TRANSACTION
    const result = await withControlTransaction(async (client) => {
      // Check uniqueness
      const existing = await client.query(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL AND id != $2`,
        [normalizedEmail, userId]
      );
      if (existing.rows.length > 0) {
        throw new Error('EMAIL_ALREADY_IN_USE');
      }

      // Invalidate previous codes
      await client.query(
        `UPDATE user_authenticators SET revoked_at = NOW()
         WHERE user_id = $1 AND type = 'email_change' AND verified_at IS NULL AND revoked_at IS NULL`,
        [userId]
      );

      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();

      // Hash code
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');

      // Set expiry
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + EMAIL_CHANGE_CODE_EXPIRY_MINUTES);

      // Store
      await client.query(
        `INSERT INTO user_authenticators (user_id, type, secret_encrypted, label, expires_at, created_at)
         VALUES ($1, 'email_change', $2, $3, $4, NOW())`,
        [userId, codeHash, normalizedEmail, expiresAt]
      );

      // Audit
      const emailDomain = normalizedEmail.split('@')[1] || 'unknown';
      await client.query(
        `INSERT INTO audit_logs (user_id, actor_type, action, resource_type, resource_id, module, result, metadata)
         VALUES ($1, 'human', 'email_change_requested', 'user', $1, 'identity', 'success', $2)`,
        [userId, JSON.stringify({ requested_domain: emailDomain })]
      );

      return { code };
    });

    // 7. SEND EMAIL
    const emailResult = await sendEmailChangeCode(normalizedEmail, result.code);
    if (!emailResult.success) {
      return NextResponse.json({ success: false, error: 'Failed to send email' }, { status: 500 });
    }

    // 8. SUCCESS
    return NextResponse.json({
      success: true,
      message: `Verification code sent to ${normalizedEmail}`,
      expiresInMinutes: EMAIL_CHANGE_CODE_EXPIRY_MINUTES,
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'EMAIL_ALREADY_IN_USE') {
      return NextResponse.json({ success: false, error: 'Email already in use' }, { status: 409 });
    }
    console.error('Change email error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process request' }, { status: 500 });
  }
}