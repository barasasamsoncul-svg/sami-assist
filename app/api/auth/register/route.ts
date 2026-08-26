import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { queryControl, getControlPool } from '@/lib/db/control';

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

      const passwordHash = await bcrypt.hash(password, 12);
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, full_name, email_verified)
         VALUES ($1, $2, $3, false)
         RETURNING id, email, full_name`,
        [email.toLowerCase(), passwordHash, fullName]
      );
      const userId = userResult.rows[0].id;

      const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
      const businessResult = await client.query(
        `INSERT INTO businesses (name, slug, email)
         VALUES ($1, $2, $3)
         RETURNING id, name, slug`,
        [businessName, slug, email.toLowerCase()]
      );
      const businessId = businessResult.rows[0].id;

      await client.query(
        `INSERT INTO business_users (business_id, user_id, role, status)
         VALUES ($1, $2, 'owner', 'active')`,
        [businessId, userId]
      );

      await client.query(
        `INSERT INTO subscriptions (business_id, plan, status, billing_cycle, ai_queries_limit)
         VALUES ($1, 'free', 'pending', 'monthly', 100)`,
        [businessId]
      );

      await client.query('COMMIT');

      await queryControl(
        `INSERT INTO audit_logs (user_id, business_id, action, resource_type, resource_id, details)
         VALUES ($1, $2, 'business_created', 'business', $2, $3)`,
        [userId, businessId, JSON.stringify({ name: businessName })]
      );

      return NextResponse.json({
        success: true,
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