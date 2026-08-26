import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `SaMi (${session.user.email})`,
      length: 20,
    });

    // Generate QR code
    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url || '');

    // Store secret
    await queryControl(
      `UPDATE users SET two_factor_secret = $1, updated_at = NOW() WHERE id = $2`,
      [secret.base32, session.user.id]
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