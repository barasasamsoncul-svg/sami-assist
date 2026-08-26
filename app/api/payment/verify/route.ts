import { NextRequest, NextResponse } from 'next/server';
import { getPesaPalToken, getTransactionStatus } from '@/lib/services/pesapal';

export async function POST(request: NextRequest) {
  try {
    const { orderTrackingId } = await request.json();

    if (!orderTrackingId) {
      return NextResponse.json({ error: 'Missing order tracking ID' }, { status: 400 });
    }

    const token = await getPesaPalToken();
    const status = await getTransactionStatus(token, orderTrackingId);

    if (status.status_code === 1 || status.payment_status_description === 'Completed') {
      return NextResponse.json({
        success: true,
        message: 'Payment verified',
      });
    }

    return NextResponse.json({
      success: false,
      error: `Payment status: ${status.payment_status_description || 'Pending'}`,
    });

  } catch (error) {
    console.error('Verify payment error:', error);
    return NextResponse.json({ error: 'Failed to verify payment' }, { status: 500 });
  }
}