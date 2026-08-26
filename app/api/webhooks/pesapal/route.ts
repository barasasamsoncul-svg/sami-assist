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

    const token = await getPesaPalToken();
    const status = await getTransactionStatus(token, orderTrackingId);

    console.log('Transaction status:', status);

    const orderParts = orderTrackingId.split('_');
    const businessId = orderParts.length >= 2 ? orderParts[1] : null;

    if (status.status_code === 1) {
      // Payment completed
      const amountPaid = status.amount || 0;

      if (businessId) {
        if (amountPaid === 0) {
          // Trial started (KSh 0 charge = card authorization only)
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
            [businessId, JSON.stringify({ orderTrackingId, trialDays: 15 })]
          );
        } else {
          // Actual payment received (after trial)
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
             VALUES ($1, 'payment_completed', 'subscription', $2)`,
            [businessId, JSON.stringify({ 
              orderTrackingId, 
              amount: amountPaid,
              status: status.payment_status_description,
            })]
          );
        }
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
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('PesaPal webhook error:', error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
}