import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { queryControl, getControlPool } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find user
    const userResult = await queryControl(
      `SELECT id, email, password_hash, full_name, status 
       FROM users 
       WHERE email = $1 AND deleted_at IS NULL`,
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const user = userResult.rows[0];

    // Check if user is active
    if (user.status !== 'active') {
      return NextResponse.json(
        { error: 'Account is not active. Please contact support.' },
        { status: 403 }
      );
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Get user's businesses
    const businessesResult = await queryControl(
      `SELECT 
        b.id,
        b.name,
        b.slug,
        b.logo_url,
        bu.role,
        bu.permissions
       FROM businesses b
       INNER JOIN business_users bu ON bu.business_id = b.id
       WHERE bu.user_id = $1 
         AND bu.status = 'active'
         AND b.status = 'active'
       ORDER BY b.created_at ASC`,
      [user.id]
    );

    const businesses = businessesResult.rows;

    if (businesses.length === 0) {
      return NextResponse.json(
        { error: 'No business found for this user' },
        { status: 403 }
      );
    }

    // Create session token (simple version - use crypto)
    const crypto = require('crypto');
    const sessionToken = crypto.randomBytes(48).toString('hex');
    const sessionExpiry = new Date();
    sessionExpiry.setDate(sessionExpiry.getDate() + 30); // 30 days

    // Store session in database
    const client = await getControlPool().connect();

    try {
      // Invalidate previous current sessions
      await client.query(
        `UPDATE sessions SET is_current = false WHERE user_id = $1`,
        [user.id]
      );

      // Create new session
      await client.query(
        `INSERT INTO sessions (user_id, token, expires_at, is_current, ip, user_agent)
         VALUES ($1, $2, $3, true, $4, $5)`,
        [
          user.id,
          sessionToken,
          sessionExpiry,
          request.headers.get('x-forwarded-for') || 'unknown',
          request.headers.get('user-agent') || 'unknown',
        ]
      );

      // Update last login
      await client.query(
        `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
        [user.id]
      );

      // Set cookie with session token
      const response = NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
        },
        businesses: businesses,
        defaultBusinessId: businesses[0].id,
      });

      response.cookies.set('sami_session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/',
      });

      return response;

    } catch (error) {
      console.error('Session creation error:', error);
      return NextResponse.json(
        { error: 'Login failed. Please try again.' },
        { status: 500 }
      );
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
}