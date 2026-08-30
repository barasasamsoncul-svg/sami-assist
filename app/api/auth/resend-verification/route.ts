import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import crypto from 'crypto';
import { sendVerificationEmail } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email required' },
        { status: 400 }
      );
    }

    // Check if user exists
    const userResult = await queryControl(
      `SELECT id, first_name FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Delete old verification codes
    await queryControl(
      `UPDATE email_verifications SET deleted_at = NOW() 
       WHERE email = $1 AND deleted_at IS NULL`,
      [email.toLowerCase()]
    );

    // Generate new verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await queryControl(
      `INSERT INTO email_verifications (email, code_hash, expires_at, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [email.toLowerCase(), hashedCode, expiresAt]
    );

    // Send verification email
    await sendVerificationEmail(
      email, 
      code, 
      userResult.rows[0].first_name || 'there'
    );

    return NextResponse.json({ 
      success: true, 
      message: 'Verification code sent' 
    });

  } catch (error) {
    console.error('Resend verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send verification code' },
      { status: 500 }
    );
  }
}