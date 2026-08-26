import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl, getControlPool } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { password, confirmation } = await request.json();

    // Verify password
    const bcrypt = require('bcryptjs');
    const userResult = await queryControl(
      `SELECT password_hash FROM users WHERE id = $1`,
      [session.user.id]
    );
    const valid = await bcrypt.compare(password, userResult.rows[0].password_hash);

    if (!valid) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 400 });
    }

    // Check confirmation text
    if (confirmation !== 'DELETE') {
      return NextResponse.json({ error: 'Please type DELETE to confirm' }, { status: 400 });
    }

    const client = await getControlPool().connect();

    try {
      await client.query('BEGIN');

      // Get user's businesses where they are owner
      const ownedBusinesses = await client.query(
        `SELECT bu.business_id 
         FROM business_users bu 
         WHERE bu.user_id = $1 AND bu.role = 'owner'`,
        [session.user.id]
      );

      for (const business of ownedBusinesses.rows) {
        const businessId = business.business_id;

        // Delete all business data
        await client.query(`DELETE FROM business_users WHERE business_id = $1`, [businessId]);
        await client.query(`DELETE FROM business_apps WHERE business_id = $1`, [businessId]);
        await client.query(`DELETE FROM business_settings WHERE business_id = $1`, [businessId]);
        await client.query(`DELETE FROM invites WHERE business_id = $1`, [businessId]);
        await client.query(`DELETE FROM subscriptions WHERE business_id = $1`, [businessId]);
        await client.query(`DELETE FROM ai_usage WHERE business_id = $1`, [businessId]);
        await client.query(`DELETE FROM audit_logs WHERE business_id = $1`, [businessId]);
        await client.query(`DELETE FROM database_registry WHERE business_id = $1`, [businessId]);
        await client.query(`DELETE FROM businesses WHERE id = $1`, [businessId]);
      }

      // Remove from businesses where user is member (not owner)
      await client.query(
        `UPDATE business_users SET status = 'removed' WHERE user_id = $1 AND role != 'owner'`,
        [session.user.id]
      );

      // Delete user data
      await client.query(`DELETE FROM api_keys WHERE user_id = $1`, [session.user.id]);
      await client.query(`DELETE FROM auth_sessions WHERE user_id = $1`, [session.user.id]);
      await client.query(`DELETE FROM sessions WHERE user_id = $1`, [session.user.id]);

      // Delete user
      await client.query(`DELETE FROM users WHERE id = $1`, [session.user.id]);

      await client.query('COMMIT');

      const response = NextResponse.json({ success: true, message: 'Account deleted' });
      response.cookies.delete('sami_session');
      response.cookies.delete('sami_business_id');

      return response;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}