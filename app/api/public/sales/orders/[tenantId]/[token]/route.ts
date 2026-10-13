import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  SalesError,
} from '@/lib/apps/sales/context';

import {
  getPublicSalesOrderPortal,
} from '@/lib/apps/sales/order-portal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; token: string }> },
) {
  try {
    const { tenantId, token } = await params;
    return json({
      success: true,
      result: await getPublicSalesOrderPortal(tenantId, token),
    });
  } catch (error) {
    if (error instanceof SalesError && error.code === 'ORDER_NOT_FOUND') {
      return json({ success: false, code: 'ORDER_NOT_FOUND', error: 'Customer order link is invalid, expired, or revoked.' }, 404);
    }
    console.error('[SaMi public Sales order portal] request failed:', error);
    return json({ success: false, code: 'ORDER_PORTAL_UNAVAILABLE', error: 'The customer order portal is temporarily unavailable.' }, 503);
  }
}
