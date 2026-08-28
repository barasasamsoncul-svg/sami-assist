import { NextRequest, NextResponse } from 'next/server';
import speakeasy from 'speakeasy';
import { queryControl } from '@/lib/db/control';
import { createSession } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json({ error: 'Email and code required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase();

    const userResult = await queryControl(
      `SELECT id, email, full_name, status, email_verified_at
       FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'No account found' }, { status: 404 });
    }

    const user = userResult.rows[0];

    if (user.status !== 'active') {
      return NextResponse.json({ error: 'Account not active' }, { status: 403 });
    }

    if (!user.email_verified_at) {
      return NextResponse.json({ error: 'Verify email first' }, { status: 403 });
    }

    const totpResult = await queryControl(
      `SELECT secret_encrypted FROM user_authenticators 
       WHERE user_id = $1 AND type = 'totp' AND verified_at IS NOT NULL AND revoked_at IS NULL`,
      [user.id]
    );

    if (totpResult.rows.length === 0) {
      return NextResponse.json({ error: 'Authenticator not set up. Use password login.' }, { status: 400 });
    }

    const isValid = speakeasy.totp.verify({
      secret: totpResult.rows[0].secret_encrypted,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid authenticator code' }, { status: 400 });
    }

    await queryControl(
      `UPDATE user_authenticators SET last_used_at = NOW() 
       WHERE user_id = $1 AND type = 'totp' AND verified_at IS NOT NULL AND revoked_at IS NULL`,
      [user.id]
    );

    const { sessionToken } = await createSession(user.id, request);

    await queryControl(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

    await queryControl(
      `INSERT INTO audit_logs (user_id, actor_type, action, resource_type, module, result, metadata)
       VALUES ($1, 'human', 'login', 'session', 'auth', 'success', $2)`,
      [user.id, JSON.stringify({ method: 'authenticator' })]
    );

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
    console.error('Authenticator login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}