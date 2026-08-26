import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl, getControlPool } from '@/lib/db/control';
import { getTenantDatabaseName } from '@/lib/db/registry';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { password } = await request.json();

    // Verify password for security
    const bcrypt = require('bcryptjs');
    const userResult = await queryControl(
      `SELECT password_hash FROM users WHERE id = $1`,
      [session.user.id]
    );
    const valid = await bcrypt.compare(password, userResult.rows[0].password_hash);

    if (!valid) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 400 });
    }

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    // Check if user is owner
    const roleResult = await queryControl(
      `SELECT role FROM business_users WHERE business_id = $1 AND user_id = $2`,
      [activeBusinessId, session.user.id]
    );

    if (roleResult.rows[0]?.role !== 'owner') {
      return NextResponse.json({ error: 'Only the owner can delete the business' }, { status: 403 });
    }

    const client = await getControlPool().connect();

    try {
      await client.query('BEGIN');

      // 1. Delete business_users
      await client.query(`DELETE FROM business_users WHERE business_id = $1`, [activeBusinessId]);

      // 2. Delete business_apps
      await client.query(`DELETE FROM business_apps WHERE business_id = $1`, [activeBusinessId]);

      // 3. Delete business_settings
      await client.query(`DELETE FROM business_settings WHERE business_id = $1`, [activeBusinessId]);

      // 4. Delete invites
      await client.query(`DELETE FROM invites WHERE business_id = $1`, [activeBusinessId]);

      // 5. Delete subscriptions
      await client.query(`DELETE FROM subscriptions WHERE business_id = $1`, [activeBusinessId]);

      // 6. Delete ai_usage
      await client.query(`DELETE FROM ai_usage WHERE business_id = $1`, [activeBusinessId]);

      // 7. Delete audit_logs
      await client.query(`DELETE FROM audit_logs WHERE business_id = $1`, [activeBusinessId]);

      // 8. Delete database_registry
      await client.query(`DELETE FROM database_registry WHERE business_id = $1`, [activeBusinessId]);

      // 9. Delete business
      await client.query(`DELETE FROM businesses WHERE id = $1`, [activeBusinessId]);

      await client.query('COMMIT');

      // Clear business cookie
      const response = NextResponse.json({ success: true, message: 'Business deleted successfully' });
      response.cookies.delete('sami_business_id');

      return response;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Delete business error:', error);
    return NextResponse.json({ error: 'Failed to delete business' }, { status: 500 });
  }
}