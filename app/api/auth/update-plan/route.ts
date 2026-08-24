import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const { businessId, plan, billingCycle } = await request.json();

    if (!businessId || !plan) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    if (!['free', 'standard', 'custom'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Set AI limits based on plan
    const aiLimits = {
      free: 100,
      standard: 1000,
      custom: -1, // unlimited
    };

    await queryControl(
      `UPDATE subscriptions 
       SET plan = $1, 
           billing_cycle = $2,
           ai_queries_limit = $3,
           updated_at = NOW()
       WHERE business_id = $4 AND status = 'active'`,
      [plan, billingCycle || 'monthly', aiLimits[plan as keyof typeof aiLimits], businessId]
    );

    // Log audit
    await queryControl(
      `INSERT INTO audit_logs (business_id, action, resource_type, details)
       VALUES ($1, 'plan_updated', 'subscription', $2)`,
      [businessId, JSON.stringify({ plan, billingCycle })]
    );

    return NextResponse.json({ success: true, message: `Plan updated to ${plan}` });

  } catch (error) {
    console.error('Update plan error:', error);
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
  }
}