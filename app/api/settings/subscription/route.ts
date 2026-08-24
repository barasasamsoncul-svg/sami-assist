import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

const PRICING = {
  free: { plan: 'free', name: 'Free', basePrice: 0, includedApps: 1, includedUsers: 1, pricePerApp: 0, pricePerUser: 0 },
  business: { plan: 'business', name: 'Business', basePrice: 29, includedApps: 3, includedUsers: 5, pricePerApp: 5, pricePerUser: 3 },
  enterprise: { plan: 'enterprise', name: 'Enterprise', basePrice: 99, includedApps: 10, includedUsers: 20, pricePerApp: 8, pricePerUser: 5 },
};

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    if (!activeBusinessId) return NextResponse.json({ error: 'No business found' }, { status: 403 });

    const subResult = await queryControl(
      `SELECT * FROM subscriptions WHERE business_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [activeBusinessId]
    );
    const subscription = subResult.rows[0] || null;

    const appsCount = await queryControl(
      `SELECT COUNT(*) as count FROM business_apps WHERE business_id = $1 AND enabled = true`,
      [activeBusinessId]
    );
    const enabledApps = parseInt(appsCount.rows[0].count);

    const teamCount = await queryControl(
      `SELECT COUNT(*) as count FROM business_users WHERE business_id = $1 AND status = 'active'`,
      [activeBusinessId]
    );
    const activeUsers = parseInt(teamCount.rows[0].count);

    const planKey = subscription?.plan || 'free';
    const plan = PRICING[planKey as keyof typeof PRICING] || PRICING.free;

    const extraApps = Math.max(0, enabledApps - plan.includedApps);
    const extraUsers = Math.max(0, activeUsers - plan.includedUsers);

    const billing = {
      plan: plan.name,
      planKey,
      basePrice: plan.basePrice,
      includedApps: plan.includedApps,
      includedUsers: plan.includedUsers,
      pricePerApp: plan.pricePerApp,
      pricePerUser: plan.pricePerUser,
      enabledApps,
      activeUsers,
      extraApps,
      extraUsers,
      appsCost: extraApps * plan.pricePerApp,
      usersCost: extraUsers * plan.pricePerUser,
      totalMonthly: plan.basePrice + (extraApps * plan.pricePerApp) + (extraUsers * plan.pricePerUser),
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

    const { plan } = await request.json();

    if (!['free', 'business', 'enterprise'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    if (!activeBusinessId) return NextResponse.json({ error: 'No business found' }, { status: 403 });

    await queryControl(
      `UPDATE subscriptions SET plan = $1, updated_at = NOW() WHERE business_id = $2 AND status = 'active'`,
      [plan, activeBusinessId]
    );

    return NextResponse.json({ success: true, message: `Plan updated to ${plan}` });

  } catch (error) {
    console.error('Update subscription error:', error);
    return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
  }
}