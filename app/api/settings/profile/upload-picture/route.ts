import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { avatarUrl } = await request.json();

    if (!avatarUrl) {
      return NextResponse.json({ error: 'Avatar URL required' }, { status: 400 });
    }

    await queryControl(
      `UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2`,
      [avatarUrl, session.user.id]
    );

    await queryControl(
      `INSERT INTO audit_logs (user_id, actor_type, action, resource_type, module, result)
       VALUES ($1, 'human', 'profile_picture_updated', 'user', 'settings', 'success')`,
      [session.user.id]
    );

    return NextResponse.json({ success: true, message: 'Profile picture updated' });

  } catch (error) {
    console.error('Upload picture error:', error);
    return NextResponse.json({ error: 'Failed to update picture' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await queryControl(
      `UPDATE users SET avatar_url = NULL, updated_at = NOW() WHERE id = $1`,
      [session.user.id]
    );

    return NextResponse.json({ success: true, message: 'Profile picture removed' });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}