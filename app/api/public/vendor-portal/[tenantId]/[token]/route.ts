import { NextRequest, NextResponse } from 'next/server';

import {
  submitVendorPortalRFQResponse,
  VendorPortalError,
} from '@/lib/apps/vendor_portal/portal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function respond(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function sameOrigin(request: NextRequest) {
  if (request.headers.get('sec-fetch-site')?.trim().toLowerCase() === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; token: string }> },
) {
  if (!sameOrigin(request)) {
    return respond({ success: false, code: 'INVALID_ORIGIN', error: 'This request could not be verified.' }, 403);
  }
  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > 16 * 1024) {
    return respond({ success: false, code: 'REQUEST_TOO_LARGE', error: 'This supplier response is too large.' }, 413);
  }

  try {
    const { tenantId, token } = await params;
    const payload: unknown = await request.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return respond({ success: false, code: 'INVALID_INPUT', error: 'A valid JSON request body is required.' }, 400);
    }
    const result = await submitVendorPortalRFQResponse(
      tenantId,
      token,
      payload as Record<string, unknown>,
    );
    return respond({ success: true, result });
  } catch (error) {
    if (error instanceof VendorPortalError) {
      const status = error.code === 'ACCESS_NOT_FOUND' || error.code === 'RFQ_NOT_AVAILABLE' ? 404
        : error.code === 'RESPONSE_LOCKED' ? 409 : 400;
      return respond({ success: false, code: error.code, error: error.message }, status);
    }
    console.error('[SaMi Vendor Portal] supplier response failed:', error);
    return respond({ success: false, code: 'VENDOR_RESPONSE_FAILED', error: 'SaMi could not submit this supplier response.' }, 500);
  }
}
