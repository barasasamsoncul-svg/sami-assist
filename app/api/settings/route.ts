import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserTenants } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

    if (!activeTenantId) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 403 });
    }

    // Profile - full user data
    const profileResult = await queryControl(
      `SELECT 
        id, email, full_name, first_name, last_name, phone, 
        avatar_file_id, status, email_verified_at, last_login_at, created_at
       FROM users WHERE id = $1`,
      [session.user.id]
    );

    // Tenant info
    const tenantResult = await queryControl(
      `SELECT t.*, tu.is_owner, tu.status as member_status
       FROM tenants t
       INNER JOIN tenant_users tu ON tu.tenant_id = t.id
       WHERE t.id = $1 AND tu.user_id = $2`,
      [activeTenantId, session.user.id]
    );

    // Team
    const teamResult = await queryControl(
      `SELECT tu.id, tu.user_id, tu.status, tu.is_owner, tu.joined_at,
              u.email, u.full_name, u.avatar_file_id,
              COALESCE(r.name, CASE WHEN tu.is_owner THEN 'Owner' ELSE 'Member' END) as role
       FROM tenant_users tu
       INNER JOIN users u ON u.id = tu.user_id
       LEFT JOIN user_roles ur ON ur.tenant_id = tu.tenant_id AND ur.user_id = tu.user_id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE tu.tenant_id = $1
       ORDER BY tu.joined_at ASC`,
      [activeTenantId]
    );

    // Modules
    const modulesResult = await queryControl(
      `SELECT m.key, m.name, m.category, m.icon, tm.status, tm.version
       FROM tenant_modules tm
       INNER JOIN modules m ON m.id = tm.module_id
       WHERE tm.tenant_id = $1
       ORDER BY tm.installed_at ASC`,
      [activeTenantId]
    );

    // Subscription
    const subResult = await queryControl(
      `SELECT s.status, s.billing_cycle, s.trial_ends_at, s.current_period_end,
              p.key as plan_key, p.name as plan_name, p.ai_queries_limit
       FROM subscriptions s
       INNER JOIN plans p ON p.id = s.plan_id
       WHERE s.tenant_id = $1
       ORDER BY s.created_at DESC LIMIT 1`,
      [activeTenantId]
    );

    // Sessions
    const sessionsResult = await queryControl(
      `SELECT id, device_type, browser, operating_system, ip_address, 
              location, is_current, last_active_at, created_at
       FROM sessions 
       WHERE user_id = $1 AND is_current = true 
       ORDER BY last_active_at DESC`,
      [session.user.id]
    );

    // API Keys
    const apiKeysResult = await queryControl(
      `SELECT id, name, key_preview, scopes, last_used_at, created_at
       FROM api_keys 
       WHERE tenant_id = $1 AND revoked_at IS NULL 
       ORDER BY created_at DESC`,
      [activeTenantId]
    );

    // 2FA status
    const twoFactorResult = await queryControl(
      `SELECT id FROM user_authenticators 
       WHERE user_id = $1 AND type = 'totp' 
         AND verified_at IS NOT NULL AND revoked_at IS NULL`,
      [session.user.id]
    );

    return NextResponse.json({
      success: true,
      profile: {
        id: profileResult.rows[0].id,
        email: profileResult.rows[0].email,
        fullName: profileResult.rows[0].full_name,
        firstName: profileResult.rows[0].first_name,
        lastName: profileResult.rows[0].last_name,
        phone: profileResult.rows[0].phone,
        avatarFileId: profileResult.rows[0].avatar_file_id,
        status: profileResult.rows[0].status,
        emailVerifiedAt: profileResult.rows[0].email_verified_at,
        lastLoginAt: profileResult.rows[0].last_login_at,
        createdAt: profileResult.rows[0].created_at,
        twoFactorEnabled: twoFactorResult.rows.length > 0,
      },
      tenant: tenantResult.rows[0],
      team: teamResult.rows,
      modules: modulesResult.rows,
      subscription: subResult.rows[0] || null,
      sessions: sessionsResult.rows,
      apiKeys: apiKeysResult.rows,
    });

  } catch (error) {
    console.error('Settings API error:', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}