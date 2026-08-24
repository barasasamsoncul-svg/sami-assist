import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { getTenantDatabaseName } from '@/lib/db/registry';
import { queryTenant } from '@/lib/db/tenant';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ app: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { app } = await params;
    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    if (!activeBusinessId) {
      return NextResponse.json({ error: 'No business found' }, { status: 403 });
    }

    const databaseName = await getTenantDatabaseName(activeBusinessId);
    if (!databaseName) {
      return NextResponse.json({ error: 'Database not ready' }, { status: 503 });
    }

    // Get table list for this app (tables prefixed with app name)
    const tablesResult = await queryTenant(
      databaseName,
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = 'public' 
         AND table_name LIKE $1
       ORDER BY table_name`,
      [`${app}%`]
    );

    const tables = tablesResult.rows.map(row => row.table_name);

    // Get record counts for each table
    const tableStats = [];
    for (const table of tables) {
      const countResult = await queryTenant(
        databaseName,
        `SELECT COUNT(*) as count FROM ${table}`
      );
      tableStats.push({
        table,
        count: parseInt(countResult.rows[0].count),
      });
    }

    return NextResponse.json({
      success: true,
      app,
      tables,
      tableStats,
    });

  } catch (error) {
    console.error('Module API error:', error);
    return NextResponse.json({ error: 'Failed to load module data' }, { status: 500 });
  }
}