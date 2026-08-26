import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';
import speakeasy from 'speakeasy';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { code } = await request.json();

    if (!code) {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    const userResult = await queryControl(
      `SELECT two_factor_secret FROM users WHERE id = $1`,
      [session.user.id]
    );
    const secret = userResult.rows[0]?.two_factor_secret;

    if (!secret) {
      return NextResponse.json({ error: '2FA not setup. Please setup first.' }, { status: 400 });
    }

    // Verify code
    const isValid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid code. Please try again.' }, { status: 400 });
    }

    await queryControl(
      `UPDATE users SET two_factor_enabled = true, updated_at = NOW() WHERE id = $1`,
      [session.user.id]
    );

    await queryControl(
      `INSERT INTO audit_logs (user_id, action, resource_type, details)
       VALUES ($1, '2fa_enabled', 'user', $2)`,
      [session.user.id, JSON.stringify({ enabled: true })]
    );

    return NextResponse.json({ success: true, message: 'Two-factor authentication enabled' });

  } catch (error) {
    console.error('2FA verify error:', error);
    return NextResponse.json({ error: 'Failed to verify code' }, { status: 500 });
  }
}