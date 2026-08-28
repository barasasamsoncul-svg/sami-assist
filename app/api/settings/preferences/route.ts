import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserTenants } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

    const result = await queryControl(
      `SELECT settings FROM tenant_settings WHERE tenant_id = $1`,
      [activeTenantId]
    );

    return NextResponse.json({
      success: true,
      preferences: result.rows[0]?.settings || { theme: 'system', dateFormat: 'DD/MM/YYYY', timeFormat: '24h' },
    });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { preferences } = await request.json();
    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

    await queryControl(
      `INSERT INTO tenant_settings (tenant_id, settings, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET settings = $2, updated_at = NOW()`,
      [activeTenantId, JSON.stringify(preferences)]
    );

    return NextResponse.json({ success: true, message: 'Preferences saved' });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}