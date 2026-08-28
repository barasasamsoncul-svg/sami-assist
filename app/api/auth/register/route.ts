import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { queryControl, getControlPool } from '@/lib/db/control';
import { sendVerificationEmail } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { firstName, lastName, email, phone, password, acceptTerms, acceptPrivacy } = body;

    // Validation
    if (!firstName || !lastName || !email || !password) {
      return NextResponse.json({ error: 'First name, last name, email, and password are required' }, { status: 400 });
    }

    if (!acceptTerms || !acceptPrivacy) {
      return NextResponse.json({ error: 'You must accept Terms of Service and Privacy Policy' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase();
    const fullName = `${firstName} ${lastName}`.trim();

    // Check existing user
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
         RETURNING id, email, full_name, status`,
        [normalizedEmail, passwordHash, fullName, firstName, lastName, phone || null]
      );
      const userId = userResult.rows[0].id;

      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpires = new Date();
      verificationExpires.setHours(verificationExpires.getHours() + 24);

      await client.query(
        `INSERT INTO user_authenticators (user_id, type, secret_encrypted, label, created_at)
         VALUES ($1, 'email_verification', $2, 'Email Verification', $3)`,
        [userId, verificationToken, verificationExpires]
      );

      await client.query('COMMIT');

      // Send verification email
      const appUrl = request.nextUrl.origin;
      await sendVerificationEmail(normalizedEmail, verificationToken, appUrl);

      // Log
      await queryControl(
        `INSERT INTO audit_logs (user_id, actor_type, action, resource_type, module, result, metadata)
         VALUES ($1, 'human', 'user_registered', 'user', 'auth', 'success', $2)`,
        [userId, JSON.stringify({ email: normalizedEmail, phone, acceptTerms, acceptPrivacy })]
      );

      return NextResponse.json({
        success: true,
        message: 'Registration successful. Check your email to verify your account.',
        user: { id: userId, email: normalizedEmail, fullName, status: 'pending' },
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Registration error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Registration failed: ${errorMessage}` }, { status: 500 });
  }
}