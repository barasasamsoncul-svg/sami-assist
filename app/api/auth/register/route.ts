import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { queryControl, getControlPool } from '@/lib/db/control';
import { sendVerificationEmail } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { firstName, lastName, email, phone, password, businessName, acceptTerms, acceptPrivacy } = body;

    if (!firstName || !lastName || !email || !password || !businessName) {
      return NextResponse.json({ error: 'All required fields must be provided' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase();
    const fullName = `${firstName} ${lastName}`.trim();

    const existingUser = await queryControl(
      `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const client = await getControlPool().connect();

    try {
      await client.query('BEGIN');

      // Create user
      const passwordHash = await bcrypt.hash(password, 12);
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, full_name, first_name, last_name, phone, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING id, email, full_name`,
        [normalizedEmail, passwordHash, fullName, firstName, lastName, phone || null]
      );
      const userId = userResult.rows[0].id;

      // Create tenant
      const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '-' + Date.now();
      const tenantResult = await client.query(
        `INSERT INTO tenants (name, slug, status)
         VALUES ($1, $2, 'active')
         RETURNING id, name, slug`,
        [businessName, slug]
      );
      const tenantId = tenantResult.rows[0].id;

      // Link user to tenant as owner
      await client.query(
        `INSERT INTO tenant_users (tenant_id, user_id, status, is_owner)
         VALUES ($1, $2, 'active', true)`,
        [tenantId, userId]
      );

      // Assign Owner role
      const ownerRole = await client.query(`SELECT id FROM roles WHERE name = 'Owner' LIMIT 1`);
      const ownerRoleId = ownerRole.rows[0]?.id;
      if (ownerRoleId) {
        await client.query(
          `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)`,
          [tenantId, userId, ownerRoleId]
        );
      }

      // Create subscription
      const freePlan = await client.query(`SELECT id FROM plans WHERE key = 'free' LIMIT 1`);
      const freePlanId = freePlan.rows[0]?.id;
      if (!freePlanId) throw new Error('Free plan not found');

      await client.query(
        `INSERT INTO subscriptions (tenant_id, plan_id, status, billing_cycle)
         VALUES ($1, $2, 'pending', 'monthly')`,
        [tenantId, freePlanId]
      );

      // Create verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpires = new Date();
      verificationExpires.setMinutes(verificationExpires.getMinutes() + 15);

      await client.query(
        `INSERT INTO user_authenticators (user_id, type, secret_encrypted, label, expires_at, created_at)
         VALUES ($1, 'email_verification', $2, 'Email Verification', $3, NOW())`,
        [userId, verificationToken, verificationExpires]
      );

      await client.query('COMMIT');

      // Send verification email
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
      await sendVerificationEmail(normalizedEmail, verificationToken, appUrl);

      return NextResponse.json({
        success: true,
        message: 'Account created. Check your email to verify.',
        user: { id: userId, email: normalizedEmail, fullName },
        tenant: { id: tenantId, name: businessName },
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