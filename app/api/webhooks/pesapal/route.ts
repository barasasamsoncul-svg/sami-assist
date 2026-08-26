import { NextRequest, NextResponse } from 'next/server';
import { getPesaPalToken, getTransactionStatus } from '@/lib/services/pesapal';
import { queryControl } from '@/lib/db/control';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orderTrackingId = searchParams.get('OrderTrackingId') || searchParams.get('orderTrackingId');

    console.log('PesaPal GET webhook:', { orderTrackingId });

    if (!orderTrackingId) {
      return NextResponse.json({ received: true });
    }

    const token = await getPesaPalToken();
    const status = await getTransactionStatus(token, orderTrackingId);

    await processPayment(status, orderTrackingId);

    return NextResponse.redirect(
      new URL(`/auth/payment/callback?orderTrackingId=${orderTrackingId}`, request.url)
    );

  } catch (error) {
    console.error('GET webhook error:', error);
    return NextResponse.json({ received: true });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('PesaPal POST webhook:', body);

    const orderTrackingId = body.orderTrackingId || body.OrderTrackingId;

    if (!orderTrackingId) {
      return NextResponse.json({ received: true });
    }

    const token = await getPesaPalToken();
    const status = await getTransactionStatus(token, orderTrackingId);

    await processPayment(status, orderTrackingId);

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('POST webhook error:', error);
    return NextResponse.json({ received: true });
  }
}

async function processPayment(status: any, orderTrackingId: string) {
  if (status.status_code === 1) {
    const amountPaid = status.amount || 0;
    
    // Try to extract businessId from order tracking ID
    // Format: sami_<businessId>_<timestamp> OR subscription ID
    const orderParts = orderTrackingId.split('_');
    let businessId = orderParts.length >= 3 ? orderParts[1] : null;

    // If no businessId in tracking ID, try to find by subscription/order reference
    if (!businessId) {
      const subResult = await queryControl(
        `SELECT business_id FROM subscriptions WHERE pesapal_subscription_id = $1 OR pesapal_order_id = $1`,
        [orderTrackingId]
      );
      businessId = subResult.rows[0]?.business_id || null;
    }

    if (!businessId) {
      console.log('No businessId found for order:', orderTrackingId);
      return;
    }

    if (amountPaid <= 1) {
      // Trial verification (KSh 1 or 0)
      await queryControl(
        `UPDATE subscriptions 
         SET status = 'trialing', 
             trial_ends_at = NOW() + INTERVAL '15 days', 
             updated_at = NOW() 
         WHERE business_id = $1`,
        [businessId]
      );

      await queryControl(
        `INSERT INTO audit_logs (business_id, action, resource_type, details)
         VALUES ($1, 'trial_started', 'subscription', $2)`,
        [businessId, JSON.stringify({ orderTrackingId, amount: amountPaid })]
      );
    } else {
      // Actual recurring payment
      await queryControl(
        `UPDATE subscriptions 
         SET status = 'active', 
             trial_ends_at = NULL, 
             current_period_end = NOW() + INTERVAL '1 month', 
             updated_at = NOW() 
         WHERE business_id = $1`,
        [businessId]
      );

      await queryControl(
        `INSERT INTO audit_logs (business_id, action, resource_type, details)
         VALUES ($1, 'payment_received', 'subscription', $2)`,
        [businessId, JSON.stringify({ orderTrackingId, amount: amountPaid, currency: status.currency })]
      );
    }
  } else if (status.status_code === 2) {
    // Payment failed
    await queryControl(
      `INSERT INTO audit_logs (action, resource_type, details)
       VALUES ('payment_failed', 'subscription', $1)`,
      [JSON.stringify({ orderTrackingId, status: status.payment_status_description })]
    );
  }
}