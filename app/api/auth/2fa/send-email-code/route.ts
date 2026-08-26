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
      `SELECT email FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await queryControl(
      `DELETE FROM auth_sessions WHERE user_id = $1 AND token_hash LIKE '2fa_%'`,
      [userId]
    );

    await queryControl(
      `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, `2fa_${code}`, expiresAt]
    );

    await sendTwoFactorCode(userResult.rows[0].email, code);

    return NextResponse.json({ success: true, message: 'Code sent to email' });

  } catch (error) {
    console.error('Send 2FA code error:', error);
    return NextResponse.json({ error: 'Failed to send code' }, { status: 500 });
  }
}