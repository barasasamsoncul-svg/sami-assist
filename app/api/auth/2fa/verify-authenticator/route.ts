import { NextRequest, NextResponse } from 'next/server';
import { queryControl, getControlPool } from '@/lib/db/control';
import crypto from 'crypto';
import speakeasy from 'speakeasy';

export async function POST(request: NextRequest) {
  try {
    const { userId, code } = await request.json();

    if (!userId || !code) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Get user's 2FA secret
    const userResult = await queryControl(
      `SELECT two_factor_secret, email, full_name FROM users WHERE id = $1`,
      [userId]
    );

    if (!userResult.rows[0]?.two_factor_secret) {
      return NextResponse.json({ error: '2FA not set up' }, { status: 400 });
    }

    // Verify TOTP
    const isValid = speakeasy.totp.verify({
      secret: userResult.rows[0].two_factor_secret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    }

    // Create session
    const user = userResult.rows[0];
    const sessionToken = crypto.randomBytes(48).toString('hex');
    const sessionExpiry = new Date();
    sessionExpiry.setDate(sessionExpiry.getDate() + 30);

    const client = await getControlPool().connect();

    try {
      await client.query('BEGIN');

      await client.query(`UPDATE sessions SET is_current = false WHERE user_id = $1`, [userId]);

      const userAgent = request.headers.get('user-agent') || '';
      const device = userAgent.includes('Mobile') ? 'mobile' : 'desktop';
      const browser = userAgent.includes('Chrome') ? 'Chrome' : userAgent.includes('Firefox') ? 'Firefox' : 'Unknown';
      const os = userAgent.includes('Windows') ? 'Windows' : userAgent.includes('Mac') ? 'macOS' : 'Unknown';

      await client.query(
        `INSERT INTO sessions (user_id, token, expires_at, is_current, ip, device, browser, os)
         VALUES ($1, $2, $3, true, $4, $5, $6, $7)`,
        [userId, sessionToken, sessionExpiry, request.headers.get('x-forwarded-for') || 'unknown', device, browser, os]
      );

      await client.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [userId]);
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
    console.error('Verify authenticator error:', error);
    return NextResponse.json({ error: 'Failed to verify' }, { status: 500 });
  }
}