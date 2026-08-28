import { NextRequest, NextResponse } from 'next/server';
import { getPesaPalToken, submitOrderRequest } from '@/lib/services/pesapal';

export async function POST(request: NextRequest) {
  try {
    const { plan, billingCycle, businessName, email, fullName } = await request.json();

    if (!plan || !email) {
      return NextResponse.json({ error: 'Plan and email required' }, { status: 400 });
    }

    if (!process.env.PESAPAL_CONSUMER_KEY || !process.env.PESAPAL_CONSUMER_SECRET) {
      return NextResponse.json({ error: 'PesaPal not configured' }, { status: 500 });
    }

    if (!process.env.PESAPAL_IPN_ID) {
      return NextResponse.json({ error: 'PesaPal IPN ID not configured' }, { status: 500 });
    }

    const appUrl = request.nextUrl.origin;
    const orderId = `sami_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const token = await getPesaPalToken();

    const orderData = {
      id: orderId,
      currency: 'KES',
      amount: 1,
      description: `SaMi ${plan} plan - 15-day trial`,
      callback_url: `${appUrl}/api/webhooks/pesapal`,
      redirect_url: `${appUrl}/auth/payment/callback?orderTrackingId=${orderId}`,
      billing_address: {
        email_address: email,
        first_name: businessName || fullName?.split(' ')[0] || '',
        last_name: fullName?.split(' ').slice(1).join(' ') || '',
      },
    };

    const response = await submitOrderRequest(token, orderData);

    if (!response.redirect_url) {
      return NextResponse.json({ error: 'Failed to create payment link' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      redirectUrl: response.redirect_url,
      orderTrackingId: response.order_tracking_id || orderId,
      trialDays: 15,
    });

  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 });
  }
}