import { NextRequest, NextResponse } from 'next/server';

import {
  VendorPortalPublicError,
  getPublicVendorPortalRfq,
  submitPublicVendorPortalResponse,
} from '@/lib/apps/vendor_portal/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BODY_BYTES = 16 * 1024;

function respond(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' },
  });
}
function sameOrigin(request: NextRequest) {
  if (request.headers.get('sec-fetch-site')?.toLowerCase() === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).origin === request.nextUrl.origin; } catch { return false; }
}
function handleError(error: unknown) {
  if (error instanceof VendorPortalPublicError) {
    const status = error.code === 'INVALID_INPUT' ? 400 : error.code === 'NOT_FOUND' ? 404 : 409;
    return respond({ success: false, code: error.code, error: error.message }, status);
  }
  if (error instanceof SyntaxError) return respond({ success: false, error: 'Enter valid quotation data.' }, 400);
  return respond({ success: false, error: 'This supplier request could not be loaded or submitted. Please retry or contact the buyer.' }, 500);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; token: string }> },
) {
  try {
    const { tenantId, token } = await params;
    return respond({ success: true, result: await getPublicVendorPortalRfq(tenantId, token) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; token: string }> },
) {
  if (!sameOrigin(request)) return respond({ success: false, error: 'Cross-origin supplier responses are not allowed.' }, 403);
  const declaredSize = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredSize) && declaredSize > MAX_BODY_BYTES) return respond({ success: false, error: 'Quotation response is too large.' }, 413);
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return respond({ success: false, error: 'Quotation response is too large.' }, 413);
    const body: unknown = JSON.parse(raw);
    const { tenantId, token } = await params;
    return respond({ success: true, result: await submitPublicVendorPortalResponse(tenantId, token, body) }, 201);
  } catch (error) {
    return handleError(error);
  }
}
