import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { businessId } = await request.json();

    // Verify user has access to this business
    const result = await queryControl(
      `SELECT id FROM business_users 
       WHERE business_id = $1 AND user_id = $2 AND status = 'active'`,
      [businessId, session.user.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'No access to this business' },
        { status: 403 }
      );
    }

    // Set business cookie
    const response = NextResponse.json({ success: true });
    response.cookies.set('sami_business_id', businessId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    return response;

  } catch (error) {
    console.error('Business switch error:', error);
    return NextResponse.json(
      { error: 'Failed to switch business' },
      { status: 500 }
    );
  }
}