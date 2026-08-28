import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { queryControl } from '@/lib/db/control';
import { createSession } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase();

    // Find user
    const userResult = await queryControl(
      `SELECT id, email, password_hash, full_name, status, email_verified_at
       FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const user = userResult.rows[0];

    // Check account status
    if (user.status === 'pending') {
      return NextResponse.json({ error: 'Please verify your email first' }, { status: 403 });
    }

    if (user.status === 'suspended') {
      return NextResponse.json({ error: 'Account suspended. Contact support.' }, { status: 403 });
    }

    if (user.status === 'deactivated') {
      return NextResponse.json({ error: 'Account deactivated. Contact support to reactivate.' }, { status: 403 });
    }

    if (user.status !== 'active') {
      return NextResponse.json({ error: 'Account not active' }, { status: 403 });
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Check 2FA
    const twoFactorResult = await queryControl(
      `SELECT id FROM user_authenticators 
       WHERE user_id = $1 AND type = 'totp' AND verified_at IS NOT NULL AND revoked_at IS NULL`,
      [user.id]
    );

    if (twoFactorResult.rows.length > 0) {
      return NextResponse.json({
        success: true,
        requires2FA: true,
        userId: user.id,
      });
    }

    // Create session
    const { sessionToken } = await createSession(user.id, request);

    // Update last login
    await queryControl(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

    // Log
    await queryControl(
      `INSERT INTO audit_logs (user_id, actor_type, action, resource_type, module, result, metadata)
       VALUES ($1, 'human', 'login', 'session', 'auth', 'success', $2)`,
      [user.id, JSON.stringify({ method: 'password' })]
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
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}