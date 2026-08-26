import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';
import { getPesaPalToken, submitOrderRequest } from '@/lib/services/pesapal';

const PRICING_KES = {
  standard_monthly: 2000,
  standard_annual: 19200,
  custom_monthly: 3340,
};

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { plan, billingCycle } = await request.json();

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    if (!activeBusinessId) {
      return NextResponse.json({ error: 'No business found' }, { status: 403 });
    }

    const businessResult = await queryControl(
      `SELECT * FROM businesses WHERE id = $1`,
      [activeBusinessId]
    );
    const business = businessResult.rows[0];

    const amount = PRICING_KES[`${plan}_${billingCycle || 'monthly'}` as keyof typeof PRICING_KES];

    if (!amount) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Generate unique order ID
    const orderId = `sami_${activeBusinessId}_${Date.now()}`;

    // Get app URL from request
    const appUrl = request.nextUrl.origin;

    // Get PesaPal token
    const token = await getPesaPalToken();

    // Submit order
    const orderData = {
      id: orderId,
      currency: 'KES',
      amount,
      description: `SaMi ${plan} plan - ${billingCycle || 'monthly'}`,
      callback_url: `${appUrl}/api/webhooks/pesapal`,
      redirect_url: `${appUrl}/auth/payment/callback?orderTrackingId=${orderId}`,
      billing_address: {
        email_address: business.email || session.user.email,
        first_name: business.name || session.user.fullName.split(' ')[0] || '',
        last_name: session.user.fullName.split(' ').slice(1).join(' ') || '',
      },
    };

    const response = await submitOrderRequest(token, orderData);

    if (!response.redirect_url) {
      return NextResponse.json({ error: 'Failed to create payment link' }, { status: 500 });
    }

    // Log payment initiation
    await queryControl(
      `INSERT INTO audit_logs (user_id, business_id, action, resource_type, details)
       VALUES ($1, $2, 'payment_initiated', 'subscription', $3)`,
      [session.user.id, activeBusinessId, JSON.stringify({ orderId, plan, billingCycle, amount })]
    );

    return NextResponse.json({
      success: true,
      redirectUrl: response.redirect_url,
      orderTrackingId: response.order_tracking_id || orderId,
    });

  } catch (error) {
    console.error('Checkout error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create checkout';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}