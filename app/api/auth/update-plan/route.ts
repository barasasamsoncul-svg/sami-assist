import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const { businessId, plan } = await request.json();

    if (!businessId || !plan) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    if (!['free', 'standard', 'custom'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    await queryControl(
      `UPDATE subscriptions SET plan = $1, updated_at = NOW()
       WHERE business_id = $2 AND status = 'active'`,
      [plan, businessId]
    );

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Update plan error:', error);
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
  }
}