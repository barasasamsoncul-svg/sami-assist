import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';
import crypto from 'crypto';
import { sendInviteEmail } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { email, role, permissions } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

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

    // Check if already invited
    const existingInvite = await queryControl(
      `SELECT id FROM invites WHERE business_id = $1 AND email = $2 AND status = 'pending'`,
      [activeBusinessId, email.toLowerCase()]
    );

    if (existingInvite.rows.length > 0) {
      return NextResponse.json({ error: 'User already invited' }, { status: 400 });
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create invite
    const inviteResult = await queryControl(
      `INSERT INTO invites (business_id, email, role, permissions, token, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, token`,
      [activeBusinessId, email.toLowerCase(), role || 'member', permissions || [], token, session.user.id, expiresAt]
    );

    // Get business and inviter info
    const businessResult = await queryControl(
      `SELECT name FROM businesses WHERE id = $1`,
      [activeBusinessId]
    );
    const businessName = businessResult.rows[0]?.name || 'Business';

    // Send invite email
    const appUrl = request.nextUrl.origin;
    const inviteLink = `${appUrl}/auth/register?invite=${token}`;
    
    const emailResult = await sendInviteEmail(
      email,
      inviteLink,
      businessName,
      session.user.fullName
    );

    if (!emailResult.success) {
      console.error('Failed to send invite email:', emailResult.error);
    }

    // Log
    await queryControl(
      `INSERT INTO audit_logs (user_id, business_id, action, resource_type, details)
       VALUES ($1, $2, 'member_invited', 'invite', $3)`,
      [session.user.id, activeBusinessId, JSON.stringify({ email, role })]
    );

    return NextResponse.json({
      success: true,
      message: `Invitation sent to ${email}`,
      inviteLink,
      userExists: existingUser.rows.length > 0,
    });

  } catch (error) {
    console.error('Invite error:', error);
    return NextResponse.json({ error: 'Failed to send invite' }, { status: 500 });
  }
}