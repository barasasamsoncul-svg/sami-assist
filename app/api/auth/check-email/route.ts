import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';

export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get('email');
    
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const result = await queryControl(
      `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email.toLowerCase()]
    );

    return NextResponse.json({ 
      exists: result.rows.length > 0,
      email: email
    });
  } catch (error) {
    console.error('Check email error:', error);
    return NextResponse.json({ error: 'Failed to check email' }, { status: 500 });
  }
}