import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSession } from '@/lib/auth/session';
import { withControlTransaction } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    // 1. AUTHENTICATION
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. PARSE REQUEST
    let body: { code?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const code = typeof body.code === 'string' ? body.code.trim() : '';

    // 3. VALIDATE
    if (!code) {
      return NextResponse.json({ success: false, error: 'Verification code is required' }, { status: 400 });
    }
    if (code.length !== 6 || !/^\d+$/.test(code)) {
      return NextResponse.json({ success: false, error: 'Invalid verification code' }, { status: 400 });
    }

    // 4. Hash code
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    // 5. TRANSACTION
    await withControlTransaction(async (client) => {
      // Find pending request
      const tokenResult = await client.query(
        `SELECT id, secret_encrypted, expires_at, verified_at, revoked_at
         FROM user_authenticators
         WHERE user_id = $1 AND type = 'email_change' AND secret_encrypted = $2
         LIMIT 1`,
        [userId, codeHash]
      );

      if (tokenResult.rows.length === 0) {
        throw new Error('INVALID_CODE');
      }

      const tokenRecord = tokenResult.rows[0];

      if (tokenRecord.verified_at) throw new Error('CODE_ALREADY_USED');
      if (tokenRecord.revoked_at) throw new Error('CODE_REVOKED');

      if (tokenRecord.expires_at) {
        if (new Date(tokenRecord.expires_at) < new Date()) {
          throw new Error('CODE_EXPIRED');
        }
      }

      const requestedEmail = tokenRecord.secret_encrypted;

      // Lock user row
      const userResult = await client.query(
        `SELECT id FROM users WHERE id = $1 FOR UPDATE`,
        [userId]
      );
      if (userResult.rows.length === 0) throw new Error('USER_NOT_FOUND');

      // Re-check uniqueness
      const existing = await client.query(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL AND id != $2`,
        [requestedEmail, userId]
      );
      if (existing.rows.length > 0) throw new Error('EMAIL_ALREADY_IN_USE');

      // Update email
      await client.query(
        `UPDATE users SET email = $1, email_verified_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [requestedEmail, userId]
      );

      // Mark code consumed
      await client.query(
        `UPDATE user_authenticators SET verified_at = NOW(), revoked_at = NOW() WHERE id = $1`,
        [tokenRecord.id]
      );

      // Invalidate other codes
      await client.query(
        `UPDATE user_authenticators SET revoked_at = NOW()
         WHERE user_id = $1 AND type = 'email_change' AND verified_at IS NULL AND revoked_at IS NULL AND id != $2`,
        [userId, tokenRecord.id]
      );

      // Revoke all sessions
      await client.query(
        `UPDATE sessions SET is_current = false, revoked_at = NOW()
         WHERE user_id = $1 AND is_current = true AND revoked_at IS NULL`,
        [userId]
      );

      // Audit
      const emailDomain = requestedEmail.split('@')[1] || 'unknown';
      await client.query(
        `INSERT INTO audit_logs (user_id, actor_type, action, resource_type, resource_id, module, result, metadata)
         VALUES ($1, 'human', 'email_changed', 'user', $1, 'identity', 'success', $2)`,
        [userId, JSON.stringify({ new_email_domain: emailDomain })]
      );
    });

    return NextResponse.json({ success: true, message: 'Email address changed successfully' });

  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case 'INVALID_CODE':
          return NextResponse.json({ success: false, error: 'Invalid verification code' }, { status: 400 });
        case 'CODE_ALREADY_USED':
          return NextResponse.json({ success: false, error: 'This code has already been used' }, { status: 400 });
        case 'CODE_REVOKED':
          return NextResponse.json({ success: false, error: 'This code has been revoked' }, { status: 400 });
        case 'CODE_EXPIRED':
          return NextResponse.json({ success: false, error: 'This code has expired' }, { status: 400 });
        case 'USER_NOT_FOUND':
          return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        case 'EMAIL_ALREADY_IN_USE':
          return NextResponse.json({ success: false, error: 'Email already in use' }, { status: 409 });
      }
    }
    console.error('Verify email change error:', error);
    return NextResponse.json({ success: false, error: 'Failed to verify' }, { status: 500 });
  }
}