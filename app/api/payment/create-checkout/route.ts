import { NextRequest, NextResponse } from 'next/server';
import { getPesaPalToken, subscribeToPlan, submitOrderRequest } from '@/lib/services/pesapal';

export async function POST(request: NextRequest) {
  try {
    const { plan, billingCycle, businessName, email, fullName } = await request.json();

    const appUrl = request.nextUrl.origin;
    const token = await getPesaPalToken();

    const planKey = `${plan}_${billingCycle || 'monthly'}`;

    // Get plan ID from env
    const PLAN_IDS: Record<string, string | undefined> = {
      standard_monthly: process.env.PESAPAL_PLAN_STANDARD_MONTHLY,
      standard_annual: process.env.PESAPAL_PLAN_STANDARD_ANNUAL,
      custom_monthly: process.env.PESAPAL_PLAN_CUSTOM_MONTHLY,
    };

    const planId = PLAN_IDS[planKey];

    if (planId) {
      // Recurring subscription
      const subscriptionData = {
        plan_id: planId,
        subscriber_email: email,
        subscriber_first_name: businessName || fullName?.split(' ')[0] || '',
        subscriber_last_name: fullName?.split(' ').slice(1).join(' ') || '',
        redirect_url: `${appUrl}/auth/payment/callback`,
        callback_url: `${appUrl}/api/webhooks/pesapal`,
      };

      const response = await subscribeToPlan(token, subscriptionData);

      if (!response.redirect_url) {
        return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        redirectUrl: response.redirect_url,
        orderTrackingId: response.order_tracking_id || response.subscription_id || `sami_${Date.now()}`,
        isRecurring: true,
      });
    }

    // Fallback: One-time verification if plans not configured
    const PRICING_KES: Record<string, number> = {
      standard_monthly: parseInt(process.env.PESAPAL_PRICE_STANDARD_MONTHLY || '2000'),
      standard_annual: parseInt(process.env.PESAPAL_PRICE_STANDARD_ANNUAL || '19200'),
      custom_monthly: parseInt(process.env.PESAPAL_PRICE_CUSTOM_MONTHLY || '3340'),
    };

    const amount = PRICING_KES[planKey];
    if (!amount) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const orderId = `sami_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const orderData = {
      id: orderId,
      currency: 'KES',
      amount: 1,
      description: `SaMi ${plan} - 15-day trial`,
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
      return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      redirectUrl: response.redirect_url,
      orderTrackingId: response.order_tracking_id || orderId,
      isRecurring: false,
    });

  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 });
  }
}