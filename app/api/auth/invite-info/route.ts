import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }

    const result = await queryControl(
      `SELECT i.email, t.name as tenant_name, r.name as role_name
       FROM invites i
       INNER JOIN tenants t ON t.id = i.tenant_id
       LEFT JOIN roles r ON r.id = i.role_id
       WHERE i.token = $1 AND i.status = 'pending' AND i.expires_at > NOW()`,
      [token]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      invite: {
        email: result.rows[0].email,
        tenant_name: result.rows[0].tenant_name,
        role_name: result.rows[0].role_name || 'Member',
      },
    });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}