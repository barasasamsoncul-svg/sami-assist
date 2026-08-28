import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { queryControl } from '@/lib/db/control';
import { sendVerificationEmail } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase();

    const userResult = await queryControl(
      `SELECT id, email_verified_at FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'No account found' }, { status: 404 });
    }

    if (userResult.rows[0].email_verified_at) {
      return NextResponse.json({ message: 'Email already verified' });
    }

    await queryControl(
      `UPDATE user_authenticators SET revoked_at = NOW() 
       WHERE user_id = $1 AND type = 'email_verification' AND verified_at IS NULL`,
      [userResult.rows[0].id]
    );

    const token = crypto.randomBytes(32).toString('hex');

    await queryControl(
      `INSERT INTO user_authenticators (user_id, type, secret_encrypted, label)
       VALUES ($1, 'email_verification', $2, 'Email Verification')`,
      [userResult.rows[0].id, token]
    );

    const appUrl = request.nextUrl.origin;
    await sendVerificationEmail(normalizedEmail, token, appUrl);

    return NextResponse.json({ success: true, message: 'Verification email sent' });

  } catch (error) {
    return NextResponse.json({ error: 'Failed to resend' }, { status: 500 });
  }
}