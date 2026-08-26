import { NextRequest, NextResponse } from 'next/server';
import { getPesaPalToken, getTransactionStatus } from '@/lib/services/pesapal';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderTrackingId, orderNotificationType } = body;

    if (!orderTrackingId) {
      return NextResponse.json({ error: 'Missing tracking ID' }, { status: 400 });
    }

    // Get PesaPal token
    const token = await getPesaPalToken();

    // Get full transaction status
    const status = await getTransactionStatus(token, orderTrackingId);

    // Handle payment completion
    if (status.status_code === 1) {
      await queryControl(
        `INSERT INTO audit_logs (action, resource_type, details)
         VALUES ('payment_completed', 'subscription', $1)`,
        [JSON.stringify({ orderTrackingId, status })]
      );
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('PesaPal webhook error:', error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
}