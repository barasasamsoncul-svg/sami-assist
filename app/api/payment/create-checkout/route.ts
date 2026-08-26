import { NextRequest, NextResponse } from 'next/server';
import { getPesaPalToken, submitOrderRequest } from '@/lib/services/pesapal';

export async function POST(request: NextRequest) {
  try {
    const { plan, billingCycle, businessName, email, fullName } = await request.json();

    console.log('Checkout request:', { plan, billingCycle, businessName, email });

    // Check env vars
    if (!process.env.PESAPAL_CONSUMER_KEY || !process.env.PESAPAL_CONSUMER_SECRET) {
      console.error('Missing PesaPal credentials');
      return NextResponse.json({ error: 'PesaPal not configured' }, { status: 500 });
    }

    if (!process.env.PESAPAL_IPN_ID) {
      console.error('Missing PESAPAL_IPN_ID');
      return NextResponse.json({ error: 'PesaPal IPN ID not configured' }, { status: 500 });
    }

    const appUrl = request.nextUrl.origin;
    console.log('App URL:', appUrl);

    // Get token
    const token = await getPesaPalToken();
    console.log('Token received');

    // Generate order ID
    const orderId = `sami_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Submit order
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

    console.log('Submitting order:', JSON.stringify(orderData));

    const response = await submitOrderRequest(token, orderData);
    console.log('PesaPal response:', JSON.stringify(response));

    if (!response.redirect_url) {
      return NextResponse.json({ 
        error: 'Failed to create payment link', 
        details: response 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      redirectUrl: response.redirect_url,
      orderTrackingId: response.order_tracking_id || orderId,
      trialDays: 15,
    });

  } catch (error) {
    console.error('Checkout error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create checkout';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}