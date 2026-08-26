import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { queryControl, getControlPool } from '@/lib/db/control';
import { sendTwoFactorCode } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find user (include email_verified and two_factor_enabled)
    const userResult = await queryControl(
      `SELECT id, email, password_hash, full_name, status, email_verified, two_factor_enabled 
       FROM users 
       WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const user = userResult.rows[0];

    // Check if user is active
    if (user.status !== 'active') {
      return NextResponse.json(
        { error: 'Account is not active. Please contact support.' },
        { status: 403 }
      );
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check if email is verified
    if (!user.email_verified) {
      return NextResponse.json(
        { error: 'Please verify your email before logging in. Check your inbox for the verification link.' },
        { status: 403 }
      );
    }

    // Check if 2FA is enabled
    if (user.two_factor_enabled) {
      const twoFactorCode = Math.floor(100000 + Math.random() * 900000).toString();
      const codeExpires = new Date();
      codeExpires.setMinutes(codeExpires.getMinutes() + 10);

      await queryControl(
        `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, `2fa_${twoFactorCode}`, codeExpires]
      );

      await sendTwoFactorCode(user.email, twoFactorCode);

      return NextResponse.json({
        success: true,
        requires2FA: true,
        userId: user.id,
        message: 'Verification code sent to your email',
      });
    }

    // No 2FA - proceed with session creation
    const businessesResult = await queryControl(
      `SELECT 
        b.id,
        b.name,
        b.slug,
        b.logo_url,
        bu.role,
        bu.permissions
       FROM businesses b
       INNER JOIN business_users bu ON bu.business_id = b.id
       WHERE bu.user_id = $1 
         AND bu.status = 'active'
         AND b.status = 'active'
       ORDER BY b.created_at ASC`,
      [user.id]
    );

    const businesses = businessesResult.rows;

    if (businesses.length === 0) {
      return NextResponse.json(
        { error: 'No business found for this user' },
        { status: 403 }
      );
    }

    // Create session
    const sessionToken = crypto.randomBytes(48).toString('hex');
    const sessionExpiry = new Date();
    sessionExpiry.setDate(sessionExpiry.getDate() + 30);

    const userAgent = request.headers.get('user-agent') || '';
    const device = userAgent.includes('Mobile') ? 'mobile' : userAgent.includes('Tablet') ? 'tablet' : 'desktop';
    const browser = userAgent.includes('Chrome') ? 'Chrome' : userAgent.includes('Firefox') ? 'Firefox' : userAgent.includes('Safari') ? 'Safari' : userAgent.includes('Edge') ? 'Edge' : 'Unknown';
    const os = userAgent.includes('Windows') ? 'Windows' : userAgent.includes('Mac') ? 'macOS' : userAgent.includes('Linux') ? 'Linux' : userAgent.includes('Android') ? 'Android' : userAgent.includes('iOS') ? 'iOS' : 'Unknown';

    const client = await getControlPool().connect();

    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE sessions SET is_current = false WHERE user_id = $1`,
        [user.id]
      );

      await client.query(
        `INSERT INTO sessions (user_id, token, expires_at, is_current, ip, device, browser, os)
         VALUES ($1, $2, $3, true, $4, $5, $6, $7)`,
        [
          user.id,
          sessionToken,
          sessionExpiry,
          request.headers.get('x-forwarded-for') || 'unknown',
          device,
          browser,
          os,
        ]
      );

      await client.query(
        `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
        [user.id]
      );

      await client.query('COMMIT');

      const response = NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
        },
        businesses: businesses,
        defaultBusinessId: businesses[0].id,
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
      await client.query('ROLLBACK');
      console.error('Session creation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json(
        { error: `Session creation failed: ${errorMessage}` },
        { status: 500 }
      );
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Login error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Login failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}