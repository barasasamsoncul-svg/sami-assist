import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { queryControl } from '@/lib/db/control';
import { sendPasswordResetEmail } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Check if user exists
    const userResult = await queryControl(
      `SELECT id, email, full_name FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    // Always return success (don't reveal if email exists)
    if (userResult.rows.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'If an account exists with this email, a reset link has been sent.' 
      });
    }

    const user = userResult.rows[0];

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date();
    resetExpires.setHours(resetExpires.getHours() + 1);

    // Store token (delete any old tokens first)
    await queryControl(
      `DELETE FROM auth_sessions WHERE user_id = $1 AND token_hash LIKE 'reset_%'`,
      [user.id]
    );

    await queryControl(
      `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, `reset_${resetToken}`, resetExpires]
    );

    // Send reset email
    const appUrl = request.nextUrl.origin;
    await sendPasswordResetEmail(user.email, resetToken, appUrl);

    // Log
    await queryControl(
      `INSERT INTO audit_logs (user_id, action, resource_type, details)
       VALUES ($1, 'password_reset_requested', 'user', $2)`,
      [user.id, JSON.stringify({ email: user.email })]
    );

    return NextResponse.json({ 
      success: true, 
      message: 'Password reset link sent to your email.' 
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Failed to send reset email' }, { status: 500 });
  }
}