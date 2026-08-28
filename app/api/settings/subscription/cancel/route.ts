import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserTenants } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

    await queryControl(
      `UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE tenant_id = $1 AND status IN ('trialing', 'active')`,
      [activeTenantId]
    );

    await queryControl(
      `INSERT INTO audit_logs (tenant_id, user_id, actor_type, action, resource_type, module, result)
       VALUES ($1, $2, 'human', 'subscription_cancelled', 'subscription', 'billing', 'success')`,
      [activeTenantId, session.user.id]
    );

    return NextResponse.json({ success: true, message: 'Subscription cancelled' });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}