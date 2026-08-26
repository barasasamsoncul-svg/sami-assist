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

    // Get recent notifications from audit_logs (security events, billing events)
    const notifications = await queryControl(
      `SELECT 
        al.id,
        al.action,
        al.resource_type,
        al.details,
        al.created_at
       FROM audit_logs al
       WHERE al.business_id = $1
         AND al.action IN (
           'payment_received',
           'payment_failed',
           'trial_started',
           'member_invited',
           'invite_accepted',
           '2fa_enabled',
           '2fa_disabled',
           'password_reset_completed',
           'role_changed',
           'member_removed',
           'app_installed',
           'subscription_cancelled',
           'plan_updated'
         )
       ORDER BY al.created_at DESC
       LIMIT 20`,
      [activeBusinessId]
    );

    // Check trial ending soon
    const subResult = await queryControl(
      `SELECT plan, status, trial_ends_at FROM subscriptions WHERE business_id = $1`,
      [activeBusinessId]
    );
    const subscription = subResult.rows[0];

    let trialWarning = null;
    if (subscription?.status === 'trialing' && subscription.trial_ends_at) {
      const now = new Date();
      const trialEnd = new Date(subscription.trial_ends_at);
      const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysRemaining <= 3 && daysRemaining > 0) {
        trialWarning = {
          id: 'trial-warning',
          action: 'trial_ending',
          resource_type: 'subscription',
          details: { daysRemaining },
          created_at: new Date().toISOString(),
        };
      }
    }

    // Check AI usage warning
    const aiResult = await queryControl(
      `SELECT ai_queries_used, ai_queries_limit FROM subscriptions WHERE business_id = $1`,
      [activeBusinessId]
    );

    let aiWarning = null;
    if (aiResult.rows[0] && aiResult.rows[0].ai_queries_limit !== -1) {
      const used = aiResult.rows[0].ai_queries_used || 0;
      const limit = aiResult.rows[0].ai_queries_limit;
      const percentage = (used / limit) * 100;
      
      if (percentage >= 80) {
        aiWarning = {
          id: 'ai-warning',
          action: 'ai_limit_warning',
          resource_type: 'ai',
          details: { used, limit, percentage: Math.round(percentage) },
          created_at: new Date().toISOString(),
        };
      }
    }

    const allNotifications = [
      ...(trialWarning ? [trialWarning] : []),
      ...(aiWarning ? [aiWarning] : []),
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