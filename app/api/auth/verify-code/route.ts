import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json(
        { success: false, error: 'Email and verification code required' },
        { status: 400 }
      );
    }

    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');

    // Check if verification code exists and is valid
    const result = await queryControl(
      `SELECT id FROM email_verifications 
       WHERE email = $1 
       AND code_hash = $2 
       AND expires_at > NOW() 
       AND used_at IS NULL
       AND deleted_at IS NULL`,
      [email.toLowerCase(), hashedCode]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired verification code' },
        { status: 400 }
      );
    }

    // Mark code as used
    await queryControl(
      `UPDATE email_verifications SET used_at = NOW() WHERE id = $1`,
      [result.rows[0].id]
    );

    // Update user's email_verified_at
    await queryControl(
      `UPDATE users SET email_verified_at = NOW() WHERE email = $1 AND deleted_at IS NULL`,
      [email.toLowerCase()]
    );

    return NextResponse.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to verify code' },
      { status: 500 }
    );
  }
}