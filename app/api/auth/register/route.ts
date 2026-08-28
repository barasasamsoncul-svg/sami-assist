import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { queryControl, getControlPool } from '@/lib/db/control';
import { sendVerificationEmail } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fullName, email, password, businessName } = body;

    if (!fullName || !email || !password || !businessName) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase();

    const existingUser = await queryControl(
      `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      return NextResponse.json({ error: 'Email already registered. Please log in.' }, { status: 409 });
    }

    const client = await getControlPool().connect();

    try {
      await client.query('BEGIN');

      const passwordHash = await bcrypt.hash(password, 12);
      const firstName = fullName.split(' ')[0];
      const lastName = fullName.split(' ').slice(1).join(' ');

      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, full_name, first_name, last_name)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, full_name`,
        [normalizedEmail, passwordHash, fullName, firstName, lastName]
      );
      const userId = userResult.rows[0].id;

      const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '-' + Date.now();
      const tenantResult = await client.query(
        `INSERT INTO tenants (name, slug, status)
         VALUES ($1, $2, 'active')
         RETURNING id, name, slug`,
        [businessName, slug]
      );
      const tenantId = tenantResult.rows[0].id;

      await client.query(
        `INSERT INTO tenant_users (tenant_id, user_id, status, is_owner)
         VALUES ($1, $2, 'active', true)`,
        [tenantId, userId]
      );

      const ownerRole = await client.query(`SELECT id FROM roles WHERE name = 'Owner' LIMIT 1`);
      const ownerRoleId = ownerRole.rows[0]?.id;

      if (ownerRoleId) {
        await client.query(
          `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)`,
          [tenantId, userId, ownerRoleId]
        );
      }

      const freePlan = await client.query(`SELECT id FROM plans WHERE key = 'free' LIMIT 1`);
      const freePlanId = freePlan.rows[0]?.id;

      if (!freePlanId) throw new Error('Free plan not found');

      await client.query(
        `INSERT INTO subscriptions (tenant_id, plan_id, status, billing_cycle)
         VALUES ($1, $2, 'pending', 'monthly')`,
        [tenantId, freePlanId]
      );

      const verificationToken = crypto.randomBytes(32).toString('hex');

      await client.query(
        `INSERT INTO user_authenticators (user_id, type, secret_encrypted, label)
         VALUES ($1, 'email_verification', $2, 'Email Verification')`,
        [userId, verificationToken]
      );

      await client.query('COMMIT');

      const appUrl = request.nextUrl.origin;
      await sendVerificationEmail(normalizedEmail, verificationToken, appUrl);

      await queryControl(
        `INSERT INTO audit_logs (tenant_id, user_id, actor_type, action, resource_type, module, result, metadata)
         VALUES ($1, $2, 'human', 'user_registered', 'user', 'auth', 'success', $3)`,
        [tenantId, userId, JSON.stringify({ email: normalizedEmail })]
      );

      return NextResponse.json({
        success: true,
        message: 'Registration successful. Check your email to verify your account.',
        user: { id: userId, email: userResult.rows[0].email, fullName: userResult.rows[0].full_name },
        tenant: { id: tenantId, name: tenantResult.rows[0].name },
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}