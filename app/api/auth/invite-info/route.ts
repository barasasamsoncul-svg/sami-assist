import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const result = await queryControl(
      `SELECT i.*, b.name as business_name
       FROM invites i
       INNER JOIN businesses b ON b.id = i.business_id
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
        role: result.rows[0].role,
        business_name: result.rows[0].business_name,
      },
    });

  } catch (error) {
    console.error('Invite info error:', error);
    return NextResponse.json({ error: 'Failed to load invite' }, { status: 500 });
  }
}