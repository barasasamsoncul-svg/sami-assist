import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { password } = await request.json();

    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    // Verify password
    const userResult = await queryControl(
      `SELECT password_hash FROM users WHERE id = $1`,
      [session.user.id]
    );
    const valid = await bcrypt.compare(password, userResult.rows[0].password_hash);

    if (!valid) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 400 });
    }

    // Disable 2FA
    await queryControl(
      `UPDATE users SET two_factor_enabled = false, two_factor_secret = NULL, updated_at = NOW() WHERE id = $1`,
      [session.user.id]
    );

    // Log
    await queryControl(
      `INSERT INTO audit_logs (user_id, action, resource_type, details)
       VALUES ($1, '2fa_disabled', 'user', $2)`,
      [session.user.id, JSON.stringify({ enabled: false })]
    );

    return NextResponse.json({ success: true, message: 'Two-factor authentication disabled' });

  } catch (error) {
    console.error('Disable 2FA error:', error);
    return NextResponse.json({ error: 'Failed to disable 2FA' }, { status: 500 });
  }
}