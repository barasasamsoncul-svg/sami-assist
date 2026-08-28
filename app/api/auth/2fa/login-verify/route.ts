import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import { createSession } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    const { userId, code } = await request.json();

    if (!userId || !code) {
      return NextResponse.json({ error: 'User ID and code required' }, { status: 400 });
    }

    const codeResult = await queryControl(
      `SELECT id, created_at FROM user_authenticators 
       WHERE user_id = $1 AND type = 'email_2fa' AND secret_encrypted = $2
         AND verified_at IS NULL AND revoked_at IS NULL`,
      [userId, code]
    );

    if (codeResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
    }

    await queryControl(
      `UPDATE user_authenticators SET verified_at = NOW(), revoked_at = NOW() WHERE id = $1`,
      [codeResult.rows[0].id]
    );

    const userResult = await queryControl(
      `SELECT id, email, full_name FROM users WHERE id = $1`,
      [userId]
    );

    const user = userResult.rows[0];

    const { sessionToken } = await createSession(userId, request);

    await queryControl(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [userId]);

    await queryControl(
      `INSERT INTO audit_logs (user_id, actor_type, action, resource_type, module, result, metadata)
       VALUES ($1, 'human', 'login', 'session', 'auth', 'success', $2)`,
      [userId, JSON.stringify({ method: 'password+email_2fa' })]
    );

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
    return NextResponse.json({ error: 'Failed to verify' }, { status: 500 });
  }
}