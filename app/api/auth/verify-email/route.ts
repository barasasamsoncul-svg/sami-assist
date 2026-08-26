import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import { sendWelcomeEmail } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    // Find user with this token
    const result = await queryControl(
      `SELECT user_id FROM auth_sessions WHERE token_hash = $1 AND expires_at > NOW()`,
      [token]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
    }

    const userId = result.rows[0].user_id;

    // Mark email as verified
    await queryControl(
      `UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1`,
      [userId]
    );

    // Delete used token
    await queryControl(
      `DELETE FROM auth_sessions WHERE token_hash = $1`,
      [token]
    );

    // Get user info for welcome email
    const userResult = await queryControl(
      `SELECT u.email, u.full_name, b.name as business_name
       FROM users u
       INNER JOIN business_users bu ON bu.user_id = u.id
       INNER JOIN businesses b ON b.id = bu.business_id
       WHERE u.id = $1
       LIMIT 1`,
      [userId]
    );

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      const appUrl = request.nextUrl.origin;
      await sendWelcomeEmail(user.email, user.full_name, user.business_name, appUrl);
    }

    // Log
    await queryControl(
      `INSERT INTO audit_logs (user_id, action, resource_type, details)
       VALUES ($1, 'email_verified', 'user', $2)`,
      [userId, JSON.stringify({ verified: true })]
    );

    return NextResponse.json({ success: true, message: 'Email verified successfully' });

  } catch (error) {
    console.error('Verify email error:', error);
    return NextResponse.json({ error: 'Failed to verify email' }, { status: 500 });
  }
}