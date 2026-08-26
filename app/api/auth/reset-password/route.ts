import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const { token, newPassword } = await request.json();

    if (!token || !newPassword) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Find user with this reset token
    const result = await queryControl(
      `SELECT user_id FROM auth_sessions 
       WHERE token_hash = $1 AND expires_at > NOW()`,
      [`reset_${token}`]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });
    }

    const userId = result.rows[0].user_id;

    // Update password
    const newHash = await bcrypt.hash(newPassword, 12);
    await queryControl(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newHash, userId]
    );

    // Delete used token
    await queryControl(
      `DELETE FROM auth_sessions WHERE token_hash = $1`,
      [`reset_${token}`]
    );

    // Delete all sessions (force re-login)
    await queryControl(
      `UPDATE sessions SET is_current = false WHERE user_id = $1`,
      [userId]
    );

    // Log
    await queryControl(
      `INSERT INTO audit_logs (user_id, action, resource_type, details)
       VALUES ($1, 'password_reset_completed', 'user', $2)`,
      [userId, JSON.stringify({ completed: true })]
    );

    return NextResponse.json({ success: true, message: 'Password reset successful. Please log in.' });

  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}