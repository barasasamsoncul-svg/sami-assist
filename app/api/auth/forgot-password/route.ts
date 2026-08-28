import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { queryControl } from '@/lib/db/control';
import { sendPasswordResetEmail } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase();

    const userResult = await queryControl(
      `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json({ success: true, message: 'If account exists, reset link sent' });
    }

    const userId = userResult.rows[0].id;

    await queryControl(
      `UPDATE user_authenticators SET revoked_at = NOW() 
       WHERE user_id = $1 AND type = 'password_reset' AND verified_at IS NULL`,
      [userId]
    );

    const token = crypto.randomBytes(32).toString('hex');

    await queryControl(
      `INSERT INTO user_authenticators (user_id, type, secret_encrypted, label)
       VALUES ($1, 'password_reset', $2, 'Password Reset')`,
      [userId, token]
    );

    const appUrl = request.nextUrl.origin;
    await sendPasswordResetEmail(normalizedEmail, token, appUrl);

    await queryControl(
      `INSERT INTO audit_logs (user_id, actor_type, action, resource_type, module, result)
       VALUES ($1, 'human', 'password_reset_requested', 'user', 'auth', 'success')`,
      [userId]
    );

    return NextResponse.json({ success: true, message: 'Reset link sent' });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}