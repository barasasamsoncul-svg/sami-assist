import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { tenantId } = await request.json();

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 });
    }

    const result = await queryControl(
      `SELECT id FROM tenant_users WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'`,
      [tenantId, session.user.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'No access to this tenant' }, { status: 403 });
    }

    const response = NextResponse.json({ success: true });

    response.cookies.set('sami_tenant_id', tenantId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    return response;

  } catch (error) {
    return NextResponse.json({ error: 'Failed to switch' }, { status: 500 });
  }
}