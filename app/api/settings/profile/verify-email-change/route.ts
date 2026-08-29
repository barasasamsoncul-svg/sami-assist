import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSession } from '@/lib/auth/session';
import { queryControl, withControlTransaction } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    // ---------------------------------------------------------
    // 1. AUTHENTICATION
    // ---------------------------------------------------------
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // ---------------------------------------------------------
    // 2. PARSE REQUEST
    // ---------------------------------------------------------
    let body: { token?: string };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const token = typeof body.token === 'string' ? body.token.trim() : '';

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Verification token is required' },
        { status: 400 }
      );
    }

    if (token.length !== 64) {
      return NextResponse.json(
        { success: false, error: 'Invalid verification token' },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // 3. HASH TOKEN FOR LOOKUP
    // ---------------------------------------------------------
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // ---------------------------------------------------------
    // 4. TRANSACTION:
    //    - Validate token
    //    - Check expiry
    //    - Check unused
    //    - Lock user row
    //    - Re-check email uniqueness
    //    - Update email
    //    - Mark token consumed
    //    - Revoke sessions
    //    - Audit log
    // ---------------------------------------------------------
    const result = await withControlTransaction(async (client) => {
      // 4a. Find pending email-change request
      const tokenResult = await client.query(
        `SELECT id, secret_encrypted, expires_at, verified_at, revoked_at
         FROM user_authenticators
         WHERE user_id = $1
           AND type = 'email_change'
           AND secret_encrypted = $2
         LIMIT 1`,
        [userId, tokenHash]
      );

      if (tokenResult.rows.length === 0) {
        throw new Error('INVALID_TOKEN');
      }

      const tokenRecord = tokenResult.rows[0];

      // 4b. Check not already used
      if (tokenRecord.verified_at) {
        throw new Error('TOKEN_ALREADY_USED');
      }

      // 4c. Check not revoked
      if (tokenRecord.revoked_at) {
        throw new Error('TOKEN_REVOKED');
      }

      // 4d. Check not expired
      if (tokenRecord.expires_at) {
        const now = new Date();
        if (new Date(tokenRecord.expires_at) < now) {
          throw new Error('TOKEN_EXPIRED');
        }
      }

      // 4e. Get requested email from token label
      const requestedEmail = tokenRecord.secret_encrypted;

      // 4f. Lock user row
      const userResult = await client.query(
        `SELECT id, email FROM users WHERE id = $1 FOR UPDATE`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('USER_NOT_FOUND');
      }

      // 4g. Re-check email uniqueness (in case taken after request)
      const existingEmailResult = await client.query(
        `SELECT id FROM users 
         WHERE LOWER(email) = LOWER($1) 
           AND deleted_at IS NULL
           AND id != $2`,
        [requestedEmail, userId]
      );

      if (existingEmailResult.rows.length > 0) {
        throw new Error('EMAIL_ALREADY_IN_USE');
      }

      // 4h. Update user email
      await client.query(
        `UPDATE users
         SET email = $1,
             email_verified_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [requestedEmail, userId]
      );

      // 4i. Mark token as consumed
      await client.query(
        `UPDATE user_authenticators
         SET verified_at = NOW(),
             revoked_at = NOW()
         WHERE id = $1`,
        [tokenRecord.id]
      );

      // 4j. Invalidate any other pending email-change tokens
      await client.query(
        `UPDATE user_authenticators
         SET revoked_at = NOW()
         WHERE user_id = $1
           AND type = 'email_change'
           AND verified_at IS NULL
           AND revoked_at IS NULL
           AND id != $2`,
        [userId, tokenRecord.id]
      );

      // 4k. Revoke all sessions except current
      await client.query(
        `UPDATE sessions
         SET is_current = false, revoked_at = NOW()
         WHERE user_id = $1
           AND is_current = true
           AND revoked_at IS NULL`,
        [userId]
      );

      // 4l. Audit log (without full PII)
      const emailDomain = requestedEmail.split('@')[1] || 'unknown';

      await client.query(
        `INSERT INTO audit_logs (
           user_id,
           actor_type,
           action,
           resource_type,
           resource_id,
           module,
           result,
           metadata
         ) VALUES (
           $1,
           'human',
           'email_changed',
           'user',
           $1,
           'identity',
           'success',
           $2
         )`,
        [
          userId,
          JSON.stringify({
            new_email_domain: emailDomain,
          }),
        ]
      );

      return {
        newEmail: requestedEmail,
      };
    });

    // ---------------------------------------------------------
    // 5. SUCCESS
    // ---------------------------------------------------------
    return NextResponse.json(
      {
        success: true,
        message: 'Email address changed successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case 'INVALID_TOKEN':
          return NextResponse.json(
            { success: false, error: 'Invalid verification token' },
            { status: 400 }
          );
        case 'TOKEN_ALREADY_USED':
          return NextResponse.json(
            { success: false, error: 'This verification link has already been used' },
            { status: 400 }
          );
        case 'TOKEN_REVOKED':
          return NextResponse.json(
            { success: false, error: 'This verification link has been revoked' },
            { status: 400 }
          );
        case 'TOKEN_EXPIRED':
          return NextResponse.json(
            { success: false, error: 'This verification link has expired' },
            { status: 400 }
          );
        case 'USER_NOT_FOUND':
          return NextResponse.json(
            { success: false, error: 'User account not found' },
            { status: 404 }
          );
        case 'EMAIL_ALREADY_IN_USE':
          return NextResponse.json(
            { success: false, error: 'Email address is already in use' },
            { status: 409 }
          );
      }
    }

    console.error('Verify email change error:', error);

    return NextResponse.json(
      { success: false, error: 'Failed to verify email change' },
      { status: 500 }
    );
  }
}