import { NextRequest, NextResponse } from 'next/server';
import { getPesaPalToken, getTransactionStatus } from '@/lib/services/pesapal';
import { queryControl } from '@/lib/db/control';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orderTrackingId = searchParams.get('OrderTrackingId') || searchParams.get('orderTrackingId');

    if (!orderTrackingId) {
      return NextResponse.json({ received: true });
    }

    const token = await getPesaPalToken();
    const status = await getTransactionStatus(token, orderTrackingId);

    await processPayment(orderTrackingId, status);

    return NextResponse.redirect(new URL(`/auth/payment/callback?orderTrackingId=${orderTrackingId}`, request.url));

  } catch (error) {
    console.error('Webhook GET error:', error);
    return NextResponse.json({ received: true });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orderTrackingId = body.orderTrackingId || body.OrderTrackingId;

    if (!orderTrackingId) {
      return NextResponse.json({ received: true });
    }

    const token = await getPesaPalToken();
    const status = await getTransactionStatus(token, orderTrackingId);

    await processPayment(orderTrackingId, status);

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Webhook POST error:', error);
    return NextResponse.json({ received: true });
  }
}

async function processPayment(orderTrackingId: string, status: any) {
  if (status.status_code === 1) {
    const amountPaid = status.amount || 0;

    await queryControl(
      `INSERT INTO audit_logs (actor_type, action, resource_type, module, result, metadata)
       VALUES ('system', 'payment_received', 'payment', 'billing', 'success', $1)`,
      [JSON.stringify({ orderTrackingId, amount: amountPaid })]
    );
  }
}