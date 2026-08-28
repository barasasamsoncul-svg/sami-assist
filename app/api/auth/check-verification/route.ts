import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email');
  
  if (!email) {
    return NextResponse.json({ verified: false });
  }

  const result = await queryControl(
    `SELECT email_verified_at FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ verified: false });
  }

  return NextResponse.json({ verified: !!result.rows[0].email_verified_at });
}