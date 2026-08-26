import { NextRequest, NextResponse } from 'next/server';
import { getPesaPalToken, getTransactionStatus } from '@/lib/services/pesapal';
import { queryControl } from '@/lib/db/control';

// Handle GET (PesaPal redirect/callback)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orderTrackingId = searchParams.get('OrderTrackingId') || searchParams.get('orderTrackingId');
    const orderMerchantReference = searchParams.get('OrderMerchantReference');
    const orderNotificationType = searchParams.get('OrderNotificationType');

    console.log('PesaPal GET webhook:', { orderTrackingId, orderMerchantReference, orderNotificationType });

    if (!orderTrackingId) {
      return NextResponse.json({ received: true, message: 'No tracking ID' });
    }

    // Verify transaction status
    const token = await getPesaPalToken();
    const status = await getTransactionStatus(token, orderTrackingId);

    console.log('Transaction status from GET:', status);

    // Process payment
    await processPaymentStatus(orderTrackingId, status);

    // Redirect to callback page
    return NextResponse.redirect(
      new URL(`/auth/payment/callback?orderTrackingId=${orderTrackingId}`, request.url)
    );

  } catch (error) {
    console.error('PesaPal GET webhook error:', error);
    // Always return 200 for PesaPal to avoid retries
    return NextResponse.json({ received: true, error: 'Processing failed' });
  }
}

// Handle POST (PesaPal IPN)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('PesaPal POST webhook:', body);

    const { orderTrackingId, orderNotificationType } = body;

    if (!orderTrackingId) {
      return NextResponse.json({ received: true, message: 'No tracking ID' });
    }

    const token = await getPesaPalToken();
    const status = await getTransactionStatus(token, orderTrackingId);

    console.log('Transaction status from POST:', status);

    await processPaymentStatus(orderTrackingId, status);

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('PesaPal POST webhook error:', error);
    return NextResponse.json({ received: true, error: 'Processing failed' });
  }
}

// Helper to process payment status
async function processPaymentStatus(orderTrackingId: string, status: any) {
  if (status.status_code === 1) {
    const amountPaid = status.amount || 0;
    const orderParts = orderTrackingId.split('_');
    const businessId = orderParts.length >= 3 ? orderParts[1] : null;

    if (businessId) {
      if (amountPaid <= 1) {
        // Trial verification
        await queryControl(
          `UPDATE subscriptions SET status = 'trialing', trial_ends_at = NOW() + INTERVAL '15 days', updated_at = NOW() WHERE business_id = $1`,
          [businessId]
        );
      } else {
        // Actual payment
        await queryControl(
          `UPDATE subscriptions SET status = 'active', trial_ends_at = NULL, current_period_end = NOW() + INTERVAL '1 month', updated_at = NOW() WHERE business_id = $1`,
          [businessId]
        );
      }

      await queryControl(
        `INSERT INTO audit_logs (business_id, action, resource_type, details) VALUES ($1, 'payment_verified', 'subscription', $2)`,
        [businessId, JSON.stringify({ orderTrackingId, amount: amountPaid })]
      );
    }
  }
}