import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { password } = await request.json();

    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    const userResult = await queryControl(
      `SELECT password_hash FROM users WHERE id = $1`,
      [session.user.id]
    );

    const valid = await bcrypt.compare(password, userResult.rows[0].password_hash);

    if (!valid) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 400 });
    }

    await queryControl(
      `UPDATE user_authenticators SET revoked_at = NOW() 
       WHERE user_id = $1 AND type = 'totp' AND revoked_at IS NULL`,
      [session.user.id]
    );

    await queryControl(
      `INSERT INTO audit_logs (user_id, actor_type, action, resource_type, module, result, metadata)
       VALUES ($1, 'human', '2fa_disabled', 'user', 'auth', 'success', $2)`,
      [session.user.id, JSON.stringify({ enabled: false })]
    );

    return NextResponse.json({ success: true, message: '2FA disabled' });

  } catch (error) {
    return NextResponse.json({ error: 'Failed to disable' }, { status: 500 });
  }
}