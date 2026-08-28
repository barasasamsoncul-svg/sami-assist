import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await queryControl(
      `UPDATE users SET status = 'active', deleted_at = NULL, updated_at = NOW() WHERE id = $1`,
      [session.user.id]
    );

    return NextResponse.json({ success: true, message: 'Deletion cancelled' });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}