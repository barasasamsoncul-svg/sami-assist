import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

const PRICING = {
  free: { plan: 'free', name: 'One App Free', includedApps: 1, includedUsers: -1, pricePerUser: 0, aiQueries: 100 },
  standard: { plan: 'standard', name: 'Standard', includedApps: -1, includedUsers: 0, pricePerUser: 14.90, aiQueries: 1000 },
  custom: { plan: 'custom', name: 'Custom', includedApps: -1, includedUsers: 0, pricePerUser: 24.90, aiQueries: -1 },
};

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

    // Get subscription from database
    const subResult = await queryControl(
      `SELECT * FROM subscriptions WHERE business_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [activeBusinessId]
    );
    const subscription = subResult.rows[0];

    if (!subscription) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
    }

    // Count enabled apps
    const appsCount = await queryControl(
      `SELECT COUNT(*) as count FROM business_apps WHERE business_id = $1 AND enabled = true`,
      [activeBusinessId]
    );
    const enabledApps = parseInt(appsCount.rows[0].count);

    // Count active users
    const usersCount = await queryControl(
      `SELECT COUNT(*) as count FROM business_users WHERE business_id = $1 AND status = 'active'`,
      [activeBusinessId]
    );
    const activeUsers = parseInt(usersCount.rows[0].count);

    // Get billing history from audit_logs
    const billingHistory = await queryControl(
      `SELECT * FROM audit_logs 
       WHERE business_id = $1 
         AND action IN ('payment_received', 'trial_started', 'payment_failed', 'plan_updated')
       ORDER BY created_at DESC
       LIMIT 20`,
      [activeBusinessId]
    );

    // Calculate trial days remaining
    let trialDaysRemaining = 0;
    if (subscription.trial_ends_at && subscription.status === 'trialing') {
      const now = new Date();
      const trialEnd = new Date(subscription.trial_ends_at);
      trialDaysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (trialDaysRemaining < 0) trialDaysRemaining = 0;
    }

    // Build billing object
    const planKey = subscription.plan || 'free';
    const planInfo = PRICING[planKey as keyof typeof PRICING] || PRICING.free;

    const billing = {
      plan: planInfo.name,
      planKey,
      status: subscription.status,
      billingCycle: subscription.billing_cycle || 'monthly',
      trialEndsAt: subscription.trial_ends_at,
      trialDaysRemaining,
      currentPeriodEnd: subscription.current_period_end,
      startedAt: subscription.started_at,
      enabledApps,
      activeUsers,
      aiQueriesUsed: subscription.ai_queries_used || 0,
      aiQueriesLimit: subscription.ai_queries_limit || planInfo.aiQueries,
      pricePerUser: planInfo.pricePerUser,
      cardLast4: subscription.card_last4,
      cardBrand: subscription.card_brand,
      pesapalSubscriptionId: subscription.pesapal_subscription_id,
      pesapalOrderId: subscription.pesapal_order_id,
    };

    return NextResponse.json({
      success: true,
      subscription,
      billing,
      billingHistory: billingHistory.rows,
    });

  } catch (error) {
    console.error('Subscription API error:', error);
    return NextResponse.json({ error: 'Failed to load subscription' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { plan, billingCycle } = await request.json();

    if (!plan || !['free', 'standard', 'custom'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    // Update subscription in database
    await queryControl(
      `UPDATE subscriptions 
       SET plan = $1, 
           billing_cycle = $2,
           ai_queries_limit = $3,
           updated_at = NOW()
       WHERE business_id = $4 AND status = 'active'`,
      [
        plan, 
        billingCycle || 'monthly', 
        PRICING[plan as keyof typeof PRICING]?.aiQueries || 100,
        activeBusinessId
      ]
    );

    // Log
    await queryControl(
      `INSERT INTO audit_logs (user_id, business_id, action, resource_type, details)
       VALUES ($1, $2, 'plan_updated', 'subscription', $3)`,
      [session.user.id, activeBusinessId, JSON.stringify({ plan, billingCycle })]
    );

    return NextResponse.json({ success: true, message: `Plan updated to ${plan}` });

  } catch (error) {
    console.error('Update subscription error:', error);
    return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
  }
}