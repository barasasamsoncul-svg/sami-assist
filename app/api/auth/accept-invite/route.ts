import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { queryControl, getControlPool } from '@/lib/db/control';
import { sendVerificationEmail } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  try {
    const { inviteToken, fullName, password } = await request.json();

    if (!inviteToken || !fullName || !password) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Find invite
    const inviteResult = await queryControl(
      `SELECT * FROM invites WHERE token = $1 AND status = 'pending' AND expires_at > NOW()`,
      [inviteToken]
    );

    if (inviteResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid or expired invite link' }, { status: 400 });
    }

    const invite = inviteResult.rows[0];

    // Check if email already registered
    const existingUser = await queryControl(
      `SELECT id FROM users WHERE email = $1`,
      [invite.email]
    );

    const client = await getControlPool().connect();

    try {
      await client.query('BEGIN');

      let userId;

      if (existingUser.rows.length > 0) {
        // User already exists - just link to business
        userId = existingUser.rows[0].id;
      } else {
        // Create new user
        const passwordHash = await bcrypt.hash(password, 12);
        const userResult = await client.query(
          `INSERT INTO users (email, password_hash, full_name, email_verified)
           VALUES ($1, $2, $3, true)
           RETURNING id`,
          [invite.email, passwordHash, fullName]
        );
        userId = userResult.rows[0].id;
      }

      // Link user to business
      await client.query(
        `INSERT INTO business_users (business_id, user_id, role, permissions, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (business_id, user_id) DO UPDATE SET status = 'active'`,
        [invite.business_id, userId, invite.role, invite.permissions || []]
      );

      // Mark invite as accepted
      await client.query(
        `UPDATE invites SET status = 'accepted', accepted_at = NOW() WHERE id = $1`,
        [invite.id]
      );

      await client.query('COMMIT');

      // Log
      await queryControl(
        `INSERT INTO audit_logs (user_id, business_id, action, resource_type, details)
         VALUES ($1, $2, 'invite_accepted', 'invite', $3)`,
        [userId, invite.business_id, JSON.stringify({ inviteId: invite.id })]
      );

      return NextResponse.json({
        success: true,
        message: 'You have joined the workspace. Please log in.',
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Accept invite error:', error);
    return NextResponse.json({ error: 'Failed to accept invite' }, { status: 500 });
  }
}