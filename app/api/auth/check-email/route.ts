import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email');
  
  if (!email) {
    return NextResponse.json({ exists: false });
  }

  const result = await queryControl(
    `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [email.toLowerCase()]
  );

  return NextResponse.json({ exists: result.rows.length > 0 });
}