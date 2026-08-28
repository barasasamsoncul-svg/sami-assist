import { NextRequest, NextResponse } from 'next/server';
import speakeasy from 'speakeasy';
import { queryControl } from '@/lib/db/control';
import { createSession } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    const { userId, code } = await request.json();

    if (!userId || !code) {
      return NextResponse.json({ error: 'User ID and code required' }, { status: 400 });
    }

    const totpResult = await queryControl(
      `SELECT secret_encrypted FROM user_authenticators 
       WHERE user_id = $1 AND type = 'totp' AND verified_at IS NOT NULL AND revoked_at IS NULL`,
      [userId]
    );

    if (totpResult.rows.length === 0) {
      return NextResponse.json({ error: '2FA not set up' }, { status: 400 });
    }

    const isValid = speakeasy.totp.verify({
      secret: totpResult.rows[0].secret_encrypted,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    }

    await queryControl(
      `UPDATE user_authenticators SET last_used_at = NOW() 
       WHERE user_id = $1 AND type = 'totp' AND verified_at IS NOT NULL AND revoked_at IS NULL`,
      [userId]
    );

    const userResult = await queryControl(
      `SELECT id, email, full_name FROM users WHERE id = $1`,
      [userId]
    );

    const user = userResult.rows[0];

    const { sessionToken } = await createSession(userId, request);

    await queryControl(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [userId]);

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, fullName: user.full_name },
    });

    response.cookies.set('sami_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    return response;

  } catch (error) {
    return NextResponse.json({ error: 'Failed to verify' }, { status: 500 });
  }
}