import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const { tenantId, plan, billingCycle } = await request.json();

    if (!tenantId || !plan) {
      return NextResponse.json({ error: 'Tenant ID and plan required' }, { status: 400 });
    }

    const planResult = await queryControl(`SELECT id FROM plans WHERE key = $1`, [plan]);
    if (planResult.rows.length === 0) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    if (plan === 'standard' || plan === 'custom') {
      await queryControl(
        `UPDATE subscriptions SET plan_id = $1, billing_cycle = $2, status = 'trialing',
            trial_ends_at = NOW() + INTERVAL '15 days', updated_at = NOW()
         WHERE tenant_id = $3 AND status IN ('pending', 'trialing', 'active')`,
        [planResult.rows[0].id, billingCycle || 'monthly', tenantId]
      );
    } else {
      await queryControl(
        `UPDATE subscriptions SET plan_id = $1, billing_cycle = $2, updated_at = NOW()
         WHERE tenant_id = $3`,
        [planResult.rows[0].id, billingCycle || 'monthly', tenantId]
      );
    }

    return NextResponse.json({ success: true, message: `Plan updated to ${plan}` });

  } catch (error) {
    console.error('Update plan error:', error);
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
  }
}