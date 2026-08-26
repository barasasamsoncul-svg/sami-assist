import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    // Cancel subscription
    await queryControl(
      `UPDATE subscriptions SET status = 'cancelled', updated_at = NOW()
       WHERE business_id = $1`,
      [activeBusinessId]
    );

    // Log
    await queryControl(
      `INSERT INTO audit_logs (user_id, business_id, action, resource_type, details)
       VALUES ($1, $2, 'subscription_cancelled', 'subscription', $3)`,
      [session.user.id, activeBusinessId, JSON.stringify({ cancelled: true })]
    );

    return NextResponse.json({ success: true, message: 'Subscription cancelled' });

  } catch (error) {
    console.error('Cancel subscription error:', error);
    return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 });
  }
}