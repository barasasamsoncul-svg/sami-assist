import { NextRequest, NextResponse } from 'next/server';
import { getPesaPalToken, submitOrderRequest } from '@/lib/services/pesapal';

const PRICING_KES = {
  standard_monthly: 2000,
  standard_annual: 19200,
  custom_monthly: 3340,
};

export async function POST(request: NextRequest) {
  try {
    const { plan, billingCycle, businessName, email, fullName } = await request.json();

    const amount = PRICING_KES[`${plan}_${billingCycle || 'monthly'}` as keyof typeof PRICING_KES];

    if (!amount) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const orderId = `sami_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const appUrl = request.nextUrl.origin;

    const token = await getPesaPalToken();

    const orderData = {
      id: orderId,
      currency: 'KES',
      amount: 1, // KSh 1 for card verification (trial)
      description: `SaMi ${plan} plan - 15-day trial then KSh ${amount}/${billingCycle || 'monthly'}`,
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
      console.error('PesaPal response:', response);
      return NextResponse.json({ 
        error: 'Failed to create payment link. Please try again.' 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      redirectUrl: response.redirect_url,
      orderTrackingId: response.order_tracking_id || orderId,
      trialDays: 15,
      amountAfterTrial: amount,
    });

  } catch (error) {
    console.error('Checkout error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create checkout';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}