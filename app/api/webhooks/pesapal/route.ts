import { NextRequest, NextResponse } from 'next/server';
import { getPesaPalToken, getTransactionStatus } from '@/lib/services/pesapal';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('PesaPal IPN:', body);

    const { orderTrackingId } = body;

    if (!orderTrackingId) {
      return NextResponse.json({ error: 'Missing tracking ID' }, { status: 400 });
    }

    const token = await getPesaPalToken();
    const status = await getTransactionStatus(token, orderTrackingId);

    if (status.status_code === 1) {
      const amountPaid = status.amount || 0;
      const orderParts = orderTrackingId.split('_');
      const businessId = orderParts.length >= 3 ? orderParts[1] : null;

      if (businessId) {
        if (amountPaid <= 1) {
          // Trial verification (KSh 1 charge)
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

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('PesaPal webhook error:', error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
}