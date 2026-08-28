import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import { sendTwoFactorCode } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const userResult = await queryControl(
      `SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await queryControl(
      `UPDATE user_authenticators SET revoked_at = NOW() 
       WHERE user_id = $1 AND type = 'email_2fa' AND verified_at IS NULL`,
      [userId]
    );

    await queryControl(
      `INSERT INTO user_authenticators (user_id, type, secret_encrypted, label)
       VALUES ($1, 'email_2fa', $2, 'Email 2FA Code')`,
      [userId, code]
    );

    await sendTwoFactorCode(userResult.rows[0].email, code);

    return NextResponse.json({ success: true, message: 'Code sent' });

  } catch (error) {
    return NextResponse.json({ error: 'Failed to send code' }, { status: 500 });
  }
}