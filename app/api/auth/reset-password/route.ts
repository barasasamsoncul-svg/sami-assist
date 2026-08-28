import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const { token, newPassword } = await request.json();

    if (!token || !newPassword) {
      return NextResponse.json({ error: 'Token and password required' }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const result = await queryControl(
      `SELECT id, user_id, created_at
       FROM user_authenticators 
       WHERE type = 'password_reset' 
         AND secret_encrypted = $1 
         AND verified_at IS NULL
         AND revoked_at IS NULL`,
      [token]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 400 });
    }

    const userId = result.rows[0].user_id;

    const newHash = await bcrypt.hash(newPassword, 12);
    await queryControl(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, userId]);

    await queryControl(
      `UPDATE user_authenticators SET verified_at = NOW(), revoked_at = NOW() WHERE id = $1`,
      [result.rows[0].id]
    );

    await queryControl(
      `UPDATE sessions SET is_current = false, revoked_at = NOW() WHERE user_id = $1`,
      [userId]
    );

    await queryControl(
      `INSERT INTO audit_logs (user_id, actor_type, action, resource_type, module, result)
       VALUES ($1, 'human', 'password_reset_completed', 'user', 'auth', 'success')`,
      [userId]
    );

    return NextResponse.json({ success: true, message: 'Password reset successful' });

  } catch (error) {
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}