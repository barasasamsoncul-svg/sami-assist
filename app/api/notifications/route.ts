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

    // Get recent notifications from audit_logs
    const notifications = await queryControl(
      `SELECT id, action, resource_type, metadata, created_at
       FROM audit_logs
       WHERE tenant_id = $1
         AND action IN (
           'payment_received', 'payment_failed', 'trial_started',
           'member_invited', 'invite_accepted', '2fa_enabled',
           '2fa_disabled', 'password_reset_completed', 'role_changed',
           'member_removed', 'module_installed', 'subscription_cancelled',
           'plan_updated'
         )
       ORDER BY created_at DESC
       LIMIT 20`,
      [activeTenantId]
    );

    // Check trial ending
    const subResult = await queryControl(
      `SELECT status, trial_ends_at FROM subscriptions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [activeTenantId]
    );

    let trialWarning = null;
    if (subResult.rows[0]?.status === 'trialing' && subResult.rows[0].trial_ends_at) {
      const daysRemaining = Math.ceil(
        (new Date(subResult.rows[0].trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (daysRemaining <= 3 && daysRemaining > 0) {
        trialWarning = {
          id: 'trial-warning',
          action: 'trial_ending',
          resource_type: 'subscription',
          created_at: new Date().toISOString(),
        };
      }
    }

    const allNotifications = [
      ...(trialWarning ? [trialWarning] : []),
      ...notifications.rows,
    ];

    return NextResponse.json({
      success: true,
      notifications: allNotifications,
      unreadCount: allNotifications.length,
    });

  } catch (error) {
    console.error('Notifications API error:', error);
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 });
  }
}