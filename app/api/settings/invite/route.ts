import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSession, getUserTenants } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';
import { sendInviteEmail } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { email, role } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

    // Get tenant name
    const tenantResult = await queryControl(`SELECT name FROM tenants WHERE id = $1`, [activeTenantId]);
    const tenantName = tenantResult.rows[0]?.name || 'Workspace';

    // Check existing invite
    const existing = await queryControl(
      `SELECT id FROM invites WHERE tenant_id = $1 AND email = $2 AND status = 'pending'`,
      [activeTenantId, email.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'User already invited' }, { status: 400 });
    }

    // Get role ID
    let roleId = null;
    if (role) {
      const roleResult = await queryControl(
        `SELECT id FROM roles WHERE name = $1 LIMIT 1`,
        [role.charAt(0).toUpperCase() + role.slice(1)]
      );
      roleId = roleResult.rows[0]?.id || null;
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await queryControl(
      `INSERT INTO invites (tenant_id, email, role_id, token, invited_by, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [activeTenantId, email.toLowerCase(), roleId, token, session.user.id, expiresAt]
    );

    // Send email
    const appUrl = request.nextUrl.origin;
    const inviteLink = `${appUrl}/auth/register?invite=${token}`;
    await sendInviteEmail(email, inviteLink, tenantName, session.user.fullName);

    await queryControl(
      `INSERT INTO audit_logs (tenant_id, user_id, actor_type, action, resource_type, module, result, metadata)
       VALUES ($1, $2, 'human', 'member_invited', 'invite', 'team', 'success', $3)`,
      [activeTenantId, session.user.id, JSON.stringify({ email, role })]
    );

    return NextResponse.json({
      success: true,
      message: `Invitation sent to ${email}`,
      inviteLink,
    });

  } catch (error) {
    console.error('Invite error:', error);
    return NextResponse.json({ error: 'Failed to send invite' }, { status: 500 });
  }
}