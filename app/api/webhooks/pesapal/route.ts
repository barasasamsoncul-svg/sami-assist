import { NextRequest, NextResponse } from 'next/server';
import { getPesaPalToken, getTransactionStatus } from '@/lib/services/pesapal';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    console.log('PesaPal IPN received:', body);

    const { orderTrackingId, orderNotificationType } = body;

    if (!orderTrackingId) {
      return NextResponse.json({ error: 'Missing tracking ID' }, { status: 400 });
    }

    // Get PesaPal token
    const token = await getPesaPalToken();

    // Get full transaction status
    const status = await getTransactionStatus(token, orderTrackingId);

    console.log('Transaction status:', status);

    // Extract business ID from order tracking ID
    // Format: sami_<businessId>_<timestamp>
    const orderParts = orderTrackingId.split('_');
    const businessId = orderParts.length >= 2 ? orderParts[1] : null;

    // PesaPal status codes:
    // 0 = Invalid, 1 = Completed, 2 = Failed, 3 = Reversed
    if (status.status_code === 1) {
      // Payment completed
      if (businessId) {
        // Update subscription to active
        await queryControl(
          `UPDATE subscriptions 
           SET status = 'active',
               trial_ends_at = NULL,
               current_period_end = NOW() + INTERVAL '1 month',
               updated_at = NOW()
           WHERE business_id = $1`,
          [businessId]
        );

        // Log payment
        await queryControl(
          `INSERT INTO audit_logs (business_id, action, resource_type, details)
           VALUES ($1, 'payment_completed', 'subscription', $2)`,
          [businessId, JSON.stringify({ 
            orderTrackingId, 
            status: status.payment_status_description,
            amount: status.amount || null,
            currency: status.currency || 'KES',
          })]
        );
      }
    } else if (status.status_code === 2) {
      // Payment failed
      if (businessId) {
        await queryControl(
          `INSERT INTO audit_logs (business_id, action, resource_type, details)
           VALUES ($1, 'payment_failed', 'subscription', $2)`,
          [businessId, JSON.stringify({ orderTrackingId, status: status.payment_status_description })]
        );
      }
    } else if (status.status_code === 3) {
      // Payment reversed
      if (businessId) {
        await queryControl(
          `UPDATE subscriptions SET status = 'past_due', updated_at = NOW()
           WHERE business_id = $1`,
          [businessId]
        );
      }
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('PesaPal webhook error:', error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
}