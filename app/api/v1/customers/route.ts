import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey } from '@/lib/auth/api-key';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { getTenantDatabaseName } from '@/lib/db/registry';
import { queryTenant } from '@/lib/db/tenant';

export async function GET(request: NextRequest) {
  try {
    // Check for API key OR session
    const authHeader = request.headers.get('authorization');
    let userId: string | null = null;
    let permissions: string[] = [];

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // API key authentication
      const apiKeyAuth = await verifyApiKey(authHeader);
      if (!apiKeyAuth) {
        return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
      }
      userId = apiKeyAuth.userId;
      permissions = apiKeyAuth.permissions;
    } else {
      // Session authentication
      const session = await getSession();
      if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      userId = session.user.id;
      permissions = ['read', 'write'];
    }

    // Check if userId exists
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check permission
    if (!permissions.includes('read')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Get business
    const businesses = await getUserBusinesses(userId);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    if (!activeBusinessId) {
      return NextResponse.json({ error: 'No business found' }, { status: 403 });
    }

    const databaseName = await getTenantDatabaseName(activeBusinessId);
    if (!databaseName) {
      return NextResponse.json({ error: 'Database not ready' }, { status: 503 });
    }

    // Query customers table
    const result = await queryTenant(
      databaseName,
      `SELECT * FROM crm_customers ORDER BY created_at DESC LIMIT 50`
    );

    return NextResponse.json({
      success: true,
      customers: result.rows,
    });

  } catch (error) {
    console.error('API customers error:', error);
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}