import { NextRequest, NextResponse } from 'next/server';
import speakeasy from 'speakeasy';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { code } = await request.json();

    if (!code) {
      return NextResponse.json({ error: 'Code required' }, { status: 400 });
    }

    const totpResult = await queryControl(
      `SELECT id, secret_encrypted FROM user_authenticators 
       WHERE user_id = $1 AND type = 'totp' AND verified_at IS NULL AND revoked_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [session.user.id]
    );

    if (totpResult.rows.length === 0) {
      return NextResponse.json({ error: '2FA setup not started' }, { status: 400 });
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
      `UPDATE user_authenticators SET verified_at = NOW(), is_primary = true WHERE id = $1`,
      [totpResult.rows[0].id]
    );

    await queryControl(
      `INSERT INTO audit_logs (user_id, actor_type, action, resource_type, module, result, metadata)
       VALUES ($1, 'human', '2fa_enabled', 'user', 'auth', 'success', $2)`,
      [session.user.id, JSON.stringify({ enabled: true })]
    );

    return NextResponse.json({ success: true, message: '2FA enabled' });

  } catch (error) {
    return NextResponse.json({ error: 'Failed to verify' }, { status: 500 });
  }
}