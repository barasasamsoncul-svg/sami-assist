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
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const existingUser = await queryControl(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existingUser.rows.length > 0) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const client = await getControlPool().connect();

    try {
      await client.query('BEGIN');

      // Create verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpires = new Date();
      verificationExpires.setHours(verificationExpires.getHours() + 24);

      // Create user
      const passwordHash = await bcrypt.hash(password, 12);
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, full_name, email_verified)
         VALUES ($1, $2, $3, false)
         RETURNING id, email, full_name`,
        [email.toLowerCase(), passwordHash, fullName]
      );
      const userId = userResult.rows[0].id;

      // Store verification token in auth_sessions or a new table
      // For now, store in auth_sessions
      await client.query(
        `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, verificationToken, verificationExpires]
      );

      // Create business
      const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
      const businessResult = await client.query(
        `INSERT INTO businesses (name, slug, email)
         VALUES ($1, $2, $3)
         RETURNING id, name, slug`,
        [businessName, slug, email.toLowerCase()]
      );
      const businessId = businessResult.rows[0].id;

      // Create business_user
      await client.query(
        `INSERT INTO business_users (business_id, user_id, role, status)
         VALUES ($1, $2, 'owner', 'active')`,
        [businessId, userId]
      );

      // Create subscription
      await client.query(
        `INSERT INTO subscriptions (business_id, plan, status, billing_cycle, ai_queries_limit)
         VALUES ($1, 'free', 'pending', 'monthly', 100)`,
        [businessId]
      );

      await client.query('COMMIT');

      // Send verification email
      const appUrl = request.nextUrl.origin;
      const emailResult = await sendVerificationEmail(email, verificationToken, appUrl);

      if (!emailResult.success) {
        console.error('Failed to send verification email:', emailResult.error);
      }

      // Log
      await queryControl(
        `INSERT INTO audit_logs (user_id, business_id, action, resource_type, details)
         VALUES ($1, $2, 'user_registered', 'user', $3)`,
        [userId, businessId, JSON.stringify({ email, businessName })]
      );

      return NextResponse.json({
        success: true,
        message: 'Registration successful. Please check your email to verify your account.',
        user: { id: userId, email: userResult.rows[0].email, fullName: userResult.rows[0].full_name },
        business: { id: businessId, name: businessResult.rows[0].name, slug: businessResult.rows[0].slug },
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 });
  }
}