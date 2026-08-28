import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserTenants } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

    const subResult = await queryControl(
      `SELECT s.*, p.key as plan_key, p.name as plan_name, p.ai_queries_limit, p.included_apps, p.included_users, p.price_per_user
       FROM subscriptions s
       INNER JOIN plans p ON p.id = s.plan_id
       WHERE s.tenant_id = $1 ORDER BY s.created_at DESC LIMIT 1`,
      [activeTenantId]
    );

    const subscription = subResult.rows[0];

    const modulesCount = await queryControl(
      `SELECT COUNT(*) as count FROM tenant_modules WHERE tenant_id = $1 AND status = 'installed'`,
      [activeTenantId]
    );

    const usersCount = await queryControl(
      `SELECT COUNT(*) as count FROM tenant_users WHERE tenant_id = $1 AND status = 'active'`,
      [activeTenantId]
    );

    let trialDaysRemaining = 0;
    if (subscription?.status === 'trialing' && subscription.trial_ends_at) {
      trialDaysRemaining = Math.max(0, Math.ceil(
        (new Date(subscription.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      ));
    }

    const billing = {
      plan: subscription?.plan_name,
      planKey: subscription?.plan_key,
      status: subscription?.status,
      billingCycle: subscription?.billing_cycle,
      trialEndsAt: subscription?.trial_ends_at,
      trialDaysRemaining,
      enabledApps: parseInt(modulesCount.rows[0].count),
      activeUsers: parseInt(usersCount.rows[0].count),
      aiQueriesLimit: subscription?.ai_queries_limit,
    };

    return NextResponse.json({ success: true, subscription, billing });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { plan, billingCycle } = await request.json();
    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

    const planResult = await queryControl(`SELECT id FROM plans WHERE key = $1`, [plan]);
    if (planResult.rows.length === 0) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

    await queryControl(
      `UPDATE subscriptions SET plan_id = $1, billing_cycle = $2, updated_at = NOW()
       WHERE tenant_id = $3 AND status IN ('pending', 'trialing', 'active')`,
      [planResult.rows[0].id, billingCycle || 'monthly', activeTenantId]
    );

    return NextResponse.json({ success: true, message: `Plan updated to ${plan}` });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}