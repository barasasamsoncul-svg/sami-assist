import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const orderTrackingId = searchParams.get('orderTrackingId') || searchParams.get('OrderTrackingId');

  if (!orderTrackingId) {
    return NextResponse.redirect(new URL('/auth/payment?error=missing', request.url));
  }

  return NextResponse.redirect(new URL(`/auth/payment/callback?orderTrackingId=${orderTrackingId}`, request.url));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orderTrackingId = body.orderTrackingId || body.order_tracking_id;

    if (!orderTrackingId) {
      return NextResponse.redirect(new URL('/auth/payment?error=missing', request.url));
    }

    return NextResponse.redirect(new URL(`/auth/payment/callback?orderTrackingId=${orderTrackingId}`, request.url));
  } catch {
    return NextResponse.redirect(new URL('/auth/payment?error=failed', request.url));
  }
}