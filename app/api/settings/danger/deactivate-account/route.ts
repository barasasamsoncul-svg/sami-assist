import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { password } = await request.json();

    // Verify password
    const bcrypt = require('bcryptjs');
    const userResult = await queryControl(
      `SELECT password_hash FROM users WHERE id = $1`,
      [session.user.id]
    );
    const valid = await bcrypt.compare(password, userResult.rows[0].password_hash);

    if (!valid) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 400 });
    }

    // Deactivate account
    await queryControl(
      `UPDATE users SET status = 'deactivated', updated_at = NOW() WHERE id = $1`,
      [session.user.id]
    );

    // Revoke all sessions
    await queryControl(
      `UPDATE sessions SET is_current = false WHERE user_id = $1`,
      [session.user.id]
    );

    // Log
    await queryControl(
      `INSERT INTO audit_logs (user_id, action, resource_type, details)
       VALUES ($1, 'account_deactivated', 'user', $2)`,
      [session.user.id, JSON.stringify({ deactivated: true })]
    );

    // Clear session cookie
    const response = NextResponse.json({ success: true, message: 'Account deactivated' });
    response.cookies.delete('sami_session');

    return response;

  } catch (error) {
    console.error('Deactivate account error:', error);
    return NextResponse.json({ error: 'Failed to deactivate account' }, { status: 500 });
  }
}