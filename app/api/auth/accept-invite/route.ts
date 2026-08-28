import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { queryControl, getControlPool } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const { inviteToken, fullName, password } = await request.json();

    if (!inviteToken || !fullName || !password) {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const inviteResult = await queryControl(
      `SELECT i.*, t.name as tenant_name
       FROM invites i
       INNER JOIN tenants t ON t.id = i.tenant_id
       WHERE i.token = $1 AND i.status = 'pending' AND i.expires_at > NOW()`,
      [inviteToken]
    );

    if (inviteResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 400 });
    }

    const invite = inviteResult.rows[0];

    const client = await getControlPool().connect();

    try {
      await client.query('BEGIN');

      let userId;

      const existingUser = await client.query(
        `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
        [invite.email]
      );

      if (existingUser.rows.length > 0) {
        userId = existingUser.rows[0].id;
      } else {
        const passwordHash = await bcrypt.hash(password, 12);
        const firstName = fullName.split(' ')[0];
        const lastName = fullName.split(' ').slice(1).join(' ');

        const userResult = await client.query(
          `INSERT INTO users (email, password_hash, full_name, first_name, last_name, email_verified_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           RETURNING id`,
          [invite.email.toLowerCase(), passwordHash, fullName, firstName, lastName]
        );
        userId = userResult.rows[0].id;
      }

      await client.query(
        `INSERT INTO tenant_users (tenant_id, user_id, status, is_owner, invited_at, joined_at)
         VALUES ($1, $2, 'active', false, NOW(), NOW())
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET status = 'active'`,
        [invite.tenant_id, userId]
      );

      if (invite.role_id) {
        await client.query(
          `INSERT INTO user_roles (tenant_id, user_id, role_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (tenant_id, user_id, role_id) DO NOTHING`,
          [invite.tenant_id, userId, invite.role_id]
        );
      }

      await client.query(
        `UPDATE invites SET status = 'accepted', accepted_at = NOW() WHERE id = $1`,
        [invite.id]
      );

      await client.query('COMMIT');

      await queryControl(
        `INSERT INTO audit_logs (tenant_id, user_id, actor_type, action, resource_type, module, result)
         VALUES ($1, $2, 'human', 'invite_accepted', 'invite', 'auth', 'success')`,
        [invite.tenant_id, userId]
      );

      return NextResponse.json({
        success: true,
        message: `You have joined ${invite.tenant_name}. Please log in.`,
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    return NextResponse.json({ error: 'Failed to accept invite' }, { status: 500 });
  }
}