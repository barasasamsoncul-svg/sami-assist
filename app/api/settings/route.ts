import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    if (!activeBusinessId) {
      return NextResponse.json({ error: 'No business found' }, { status: 403 });
    }

    // 1. User profile
    const userResult = await queryControl(
      `SELECT id, email, full_name, status, email_verified, two_factor_enabled, last_login_at, created_at
       FROM users WHERE id = $1`,
      [session.user.id]
    );
    const profile = userResult.rows[0];

    // 2. Business info
    const businessResult = await queryControl(
      `SELECT * FROM businesses WHERE id = $1`,
      [activeBusinessId]
    );
    const business = businessResult.rows[0];

    // 3. Team members
    const teamResult = await queryControl(
      `SELECT bu.*, u.email, u.full_name, u.last_login_at
       FROM business_users bu
       INNER JOIN users u ON u.id = bu.user_id
       WHERE bu.business_id = $1
       ORDER BY bu.created_at ASC`,
      [activeBusinessId]
    );

    // 4. Pending invites
    const invitesResult = await queryControl(
      `SELECT * FROM invites WHERE business_id = $1 AND status = 'pending'
       ORDER BY created_at DESC`,
      [activeBusinessId]
    );

    // 5. Installed apps
    const appsResult = await queryControl(
      `SELECT * FROM business_apps WHERE business_id = $1
       ORDER BY created_at ASC`,
      [activeBusinessId]
    );

    // 6. Subscription
    const subResult = await queryControl(
      `SELECT * FROM subscriptions WHERE business_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [activeBusinessId]
    );
    const subscription = subResult.rows[0];

    // 7. AI usage
    const currentMonth = new Date().toISOString().slice(0, 7);
    const aiUsageResult = await queryControl(
      `SELECT * FROM ai_usage WHERE business_id = $1 AND month = $2`,
      [activeBusinessId, currentMonth]
    );
    const aiUsage = aiUsageResult.rows[0];

    // 8. API keys
    const apiKeysResult = await queryControl(
      `SELECT id, name, key_preview, permissions, last_used, expires_at, created_at
       FROM api_keys WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [session.user.id]
    );

    // 9. Active sessions
    const sessionsResult = await queryControl(
      `SELECT id, device, browser, os, ip, location, last_active, is_current, created_at
       FROM sessions WHERE user_id = $1 AND is_current = true
       ORDER BY last_active DESC`,
      [session.user.id]
    );

    // 10. Audit logs
    const auditLogsResult = await queryControl(
      `SELECT al.*, u.full_name, u.email
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.business_id = $1
       ORDER BY al.created_at DESC
       LIMIT 50`,
      [activeBusinessId]
    );

    return NextResponse.json({
      success: true,
      profile,
      business,
      team: teamResult.rows,
      invites: invitesResult.rows,
      apps: appsResult.rows,
      subscription,
      aiUsage,
      apiKeys: apiKeysResult.rows,
      sessions: sessionsResult.rows,
      auditLogs: auditLogsResult.rows,
    });

  } catch (error) {
    console.error('Settings API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to load settings: ${errorMessage}` }, { status: 500 });
  }
}