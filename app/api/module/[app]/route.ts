import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserTenants } from '@/lib/auth/session';
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
    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

    if (!activeTenantId) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 403 });
    }

    const databaseName = await getTenantDatabaseName(activeTenantId);
    if (!databaseName) {
      return NextResponse.json({ error: 'Database not ready' }, { status: 503 });
    }

    // Get tables for this module
    const tablesResult = await queryTenant(
      databaseName,
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_name LIKE $1`,
      [`${app}%`]
    );

    return NextResponse.json({
      success: true,
      app,
      tables: tablesResult.rows.map((row: any) => row.table_name),
    });

  } catch (error) {
    console.error('Module API error:', error);
    return NextResponse.json({ error: 'Failed to load module' }, { status: 500 });
  }
}