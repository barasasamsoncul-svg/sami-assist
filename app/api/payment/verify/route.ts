import { NextRequest, NextResponse } from 'next/server';
import { getPesaPalToken, getTransactionStatus } from '@/lib/services/pesapal';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const { orderTrackingId } = await request.json();

    if (!orderTrackingId) {
      return NextResponse.json({ error: 'Missing order tracking ID' }, { status: 400 });
    }

    // Get PesaPal token
    const token = await getPesaPalToken();

    // Get transaction status
    const status = await getTransactionStatus(token, orderTrackingId);

    // PesaPal status: status_code 1 = Completed
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
    const errorMessage = error instanceof Error ? error.message : 'Failed to verify payment';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}