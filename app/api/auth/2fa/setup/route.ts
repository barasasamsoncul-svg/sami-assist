import { NextRequest, NextResponse } from 'next/server';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const existing = await queryControl(
      `SELECT id FROM user_authenticators 
       WHERE user_id = $1 AND type = 'totp' AND verified_at IS NOT NULL AND revoked_at IS NULL`,
      [session.user.id]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json({ error: '2FA already enabled' }, { status: 400 });
    }

    const secret = speakeasy.generateSecret({
      name: `SaMi (${session.user.email})`,
      length: 20,
    });

    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url || '');

    await queryControl(
      `INSERT INTO user_authenticators (user_id, type, secret_encrypted, label)
       VALUES ($1, 'totp', $2, 'Google Authenticator')`,
      [session.user.id, secret.base32]
    );

    return NextResponse.json({
      success: true,
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url,
      qrCodeDataUrl,
    });

  } catch (error) {
    console.error('2FA setup error:', error);
    return NextResponse.json({ error: 'Failed to setup 2FA' }, { status: 500 });
  }
}