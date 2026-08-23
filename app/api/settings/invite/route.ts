import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { email, role, permissions } = await request.json();

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    if (!activeBusinessId) {
      return NextResponse.json({ error: 'No business found' }, { status: 403 });
    }

    // Check if user already exists
    const existingUser = await queryControl(
      `SELECT id FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const inviteResult = await queryControl(
      `INSERT INTO invites (business_id, email, role, permissions, token, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, token`,
      [activeBusinessId, email.toLowerCase(), role, permissions || [], token, session.user.id, expiresAt]
    );

    const invite = inviteResult.rows[0];
    const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/auth/register?invite=${invite.token}`;

    return NextResponse.json({ 
      success: true, 
      message: `Invite created for ${email}`,
      inviteLink,
      userExists: existingUser.rows.length > 0,
    });

  } catch (error) {
    console.error('Invite error:', error);
    return NextResponse.json({ error: 'Failed to send invite' }, { status: 500 });
  }
}