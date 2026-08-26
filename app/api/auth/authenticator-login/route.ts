import { NextRequest, NextResponse } from 'next/server';
import { queryControl, getControlPool } from '@/lib/db/control';
import crypto from 'crypto';
import speakeasy from 'speakeasy';

export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json({ error: 'Email and code required' }, { status: 400 });
    }

    // Find user
    const userResult = await queryControl(
      `SELECT id, email, full_name, two_factor_secret, two_factor_enabled, status, email_verified
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'No account found' }, { status: 404 });
    }

    const user = userResult.rows[0];

    if (user.status !== 'active') {
      return NextResponse.json({ error: 'Account not active' }, { status: 403 });
    }

    if (!user.two_factor_enabled || !user.two_factor_secret) {
      return NextResponse.json({ error: 'Authenticator not set up. Please use password login.' }, { status: 400 });
    }

    // Verify TOTP
    const isValid = speakeasy.totp.verify({
      secret: user.two_factor_secret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid authenticator code' }, { status: 400 });
    }

    // Create session
    const sessionToken = crypto.randomBytes(48).toString('hex');
    const sessionExpiry = new Date();
    sessionExpiry.setDate(sessionExpiry.getDate() + 30);

    const client = await getControlPool().connect();

    try {
      await client.query('BEGIN');
      await client.query(`UPDATE sessions SET is_current = false WHERE user_id = $1`, [user.id]);

      const userAgent = request.headers.get('user-agent') || '';
      const device = userAgent.includes('Mobile') ? 'mobile' : 'desktop';
      const browser = userAgent.includes('Chrome') ? 'Chrome' : 'Unknown';
      const os = userAgent.includes('Windows') ? 'Windows' : 'Unknown';

      await client.query(
        `INSERT INTO sessions (user_id, token, expires_at, is_current, ip, device, browser, os)
         VALUES ($1, $2, $3, true, $4, $5, $6, $7)`,
        [user.id, sessionToken, sessionExpiry, request.headers.get('x-forwarded-for') || 'unknown', device, browser, os]
      );

      await client.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);
      await client.query('COMMIT');

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
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Authenticator login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}