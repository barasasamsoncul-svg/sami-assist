import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

// SaMi Pricing - Odoo style with AI limits
const PRICING = {
  free: {
    plan: 'free',
    name: 'One App Free',
    includedApps: 1,
    includedUsers: -1, // unlimited
    pricePerUser: 0,
    aiQueriesIncluded: 100,
    aiQueryLimit: 100,
    monthlyPricePerUser: 0,
    annualPricePerUser: 0,
  },
  standard: {
    plan: 'standard',
    name: 'Standard',
    includedApps: -1, // all apps
    includedUsers: 0, // all users billed
    pricePerUser: 14.90,
    aiQueriesIncluded: 1000,
    aiQueryLimit: 1000,
    monthlyPricePerUser: 14.90,
    annualPricePerUser: 11.90, // 20% discount for annual
  },
  custom: {
    plan: 'custom',
    name: 'Custom',
    includedApps: -1, // all apps
    includedUsers: 0, // all users billed
    pricePerUser: 24.90,
    aiQueriesIncluded: -1, // unlimited
    aiQueryLimit: -1,
    monthlyPricePerUser: 24.90,
    annualPricePerUser: 19.90,
  },
};

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    if (!activeBusinessId) return NextResponse.json({ error: 'No business found' }, { status: 403 });

    // Get subscription
    const subResult = await queryControl(
      `SELECT * FROM subscriptions WHERE business_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [activeBusinessId]
    );
    const subscription = subResult.rows[0] || { plan: 'free', billing_cycle: 'monthly' };

    // Count enabled apps
    const appsCount = await queryControl(
      `SELECT COUNT(*) as count FROM business_apps WHERE business_id = $1 AND enabled = true`,
      [activeBusinessId]
    );
    const enabledApps = parseInt(appsCount.rows[0].count);

    // Count active team members (excluding owner for free plan billing)
    const teamCount = await queryControl(
      `SELECT COUNT(*) as count FROM business_users WHERE business_id = $1 AND status = 'active'`,
      [activeBusinessId]
    );
    const activeUsers = parseInt(teamCount.rows[0].count);

    const planKey = subscription.plan || 'free';
    const plan = PRICING[planKey as keyof typeof PRICING] || PRICING.free;

    // Calculate billing
    let billableUsers = 0;
    let userCost = 0;
    let totalMonthly = 0;

    if (planKey === 'free') {
      // Free: 1 app, unlimited users, no charge
      billableUsers = 0;
      userCost = 0;
      totalMonthly = 0;
    } else {
      // Paid plans: charge per active user
      billableUsers = activeUsers;
      userCost = billableUsers * plan.pricePerUser;
      totalMonthly = userCost;
    }

    const billing = {
      plan: plan.name,
      planKey,
      billingCycle: subscription.billing_cycle || 'monthly',
      includedApps: plan.includedApps === -1 ? 'All Apps' : plan.includedApps,
      includedUsers: plan.includedUsers === -1 ? 'Unlimited' : 'All users billed',
      pricePerUserMonthly: plan.monthlyPricePerUser,
      pricePerUserAnnual: plan.annualPricePerUser,
      enabledApps,
      activeUsers,
      billableUsers,
      userCost,
      totalMonthly,
      aiQueriesIncluded: plan.aiQueriesIncluded === -1 ? 'Unlimited' : `${plan.aiQueriesIncluded}/month`,
      currency: 'USD',
    };

    return NextResponse.json({ success: true, subscription, billing });

  } catch (error) {
    console.error('Subscription API error:', error);
    return NextResponse.json({ error: 'Failed to load subscription' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { plan, billingCycle } = await request.json();

    if (!['free', 'standard', 'custom'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    if (!activeBusinessId) return NextResponse.json({ error: 'No business found' }, { status: 403 });

    // Update subscription with billing cycle
    await queryControl(
      `UPDATE subscriptions 
       SET plan = $1, 
           updated_at = NOW(),
           current_period_end = CASE 
             WHEN $2 = 'monthly' THEN NOW() + INTERVAL '1 month'
             WHEN $2 = 'annual' THEN NOW() + INTERVAL '1 year'
             ELSE current_period_end
           END
       WHERE business_id = $3 AND status = 'active'`,
      [plan, billingCycle || 'monthly', activeBusinessId]
    );

    // Log to audit
    await queryControl(
      `INSERT INTO audit_logs (user_id, business_id, action, resource_type, details)
       VALUES ($1, $2, 'subscription_update', 'subscription', $3)`,
      [session.user.id, activeBusinessId, JSON.stringify({ plan, billingCycle })]
    );

    return NextResponse.json({ success: true, message: `Plan updated to ${plan} (${billingCycle || 'monthly'})` });

  } catch (error) {
    console.error('Update subscription error:', error);
    return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
  }
}