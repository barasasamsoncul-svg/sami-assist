import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('PesaPal callback POST:', body);

    const orderTrackingId = body.orderTrackingId || body.order_tracking_id;

    if (!orderTrackingId) {
      return NextResponse.redirect(new URL('/auth/payment?error=missing_id', request.url));
    }

    return NextResponse.redirect(
      new URL(`/auth/payment/callback?orderTrackingId=${orderTrackingId}`, request.url)
    );
  } catch (error) {
    console.error('Callback POST error:', error);
    return NextResponse.redirect(new URL('/auth/payment?error=callback_failed', request.url));
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orderTrackingId = searchParams.get('orderTrackingId') || searchParams.get('OrderTrackingId');

    if (!orderTrackingId) {
      return NextResponse.redirect(new URL('/auth/payment?error=missing_id', request.url));
    }

    return NextResponse.redirect(
      new URL(`/auth/payment/callback?orderTrackingId=${orderTrackingId}`, request.url)
    );
  } catch (error) {
    console.error('Callback GET error:', error);
    return NextResponse.redirect(new URL('/auth/payment?error=callback_failed', request.url));
  }
}