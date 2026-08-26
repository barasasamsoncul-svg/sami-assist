import { NextRequest, NextResponse } from 'next/server';
import { queryControl, getControlPool } from '@/lib/db/control';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { userId, code } = await request.json();

    if (!userId || !code) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Verify code
    const result = await queryControl(
      `SELECT id FROM auth_sessions 
       WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()`,
      [userId, `2fa_${code}`]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
    }

    // Delete used code
    await queryControl(
      `DELETE FROM auth_sessions WHERE token_hash = $1`,
      [`2fa_${code}`]
    );

    // Get user info
    const userResult = await queryControl(
      `SELECT id, email, full_name FROM users WHERE id = $1`,
      [userId]
    );
    const user = userResult.rows[0];

    // Get businesses
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
      [userId]
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

    // Get device info
    const userAgent = request.headers.get('user-agent') || '';
    const device = userAgent.includes('Mobile') ? 'mobile' : userAgent.includes('Tablet') ? 'tablet' : 'desktop';
    const browser = userAgent.includes('Chrome') ? 'Chrome' : userAgent.includes('Firefox') ? 'Firefox' : userAgent.includes('Safari') ? 'Safari' : userAgent.includes('Edge') ? 'Edge' : 'Unknown';
    const os = userAgent.includes('Windows') ? 'Windows' : userAgent.includes('Mac') ? 'macOS' : userAgent.includes('Linux') ? 'Linux' : userAgent.includes('Android') ? 'Android' : userAgent.includes('iOS') ? 'iOS' : 'Unknown';

    const client = await getControlPool().connect();

    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE sessions SET is_current = false WHERE user_id = $1`,
        [userId]
      );

      await client.query(
        `INSERT INTO sessions (user_id, token, expires_at, is_current, ip, device, browser, os)
         VALUES ($1, $2, $3, true, $4, $5, $6, $7)`,
        [
          userId,
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
        [userId]
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
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('2FA login verify error:', error);
    return NextResponse.json({ error: 'Failed to verify code' }, { status: 500 });
  }
}