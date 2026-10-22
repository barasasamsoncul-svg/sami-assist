import { NextRequest, NextResponse } from 'next/server';

import { CompanyContextError } from '@/lib/auth/company-context';
import { TenantContextError } from '@/lib/auth/tenant-context';
import { EnterpriseModuleError } from '@/lib/apps/enterprise/service';
import {
  ShippingConflictError,
  ShippingInputError,
  createShippingShipment,
  getShippingOverview,
  recordShippingMilestone,
  transitionShippingShipment,
} from '@/lib/apps/shipping/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BODY_BYTES = 48 * 1024;

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
  if (error instanceof ShippingInputError) return respond({ success: false, error: error.message }, 400);
  if (error instanceof ShippingConflictError) return respond({ success: false, error: error.message }, 409);
  if (error instanceof SyntaxError) return respond({ success: false, error: 'Enter valid Shipping data.' }, 400);
  if (error instanceof TenantContextError || error instanceof CompanyContextError) {
    const status = error.code === 'UNAUTHENTICATED' ? 401 : error.code === 'NO_WORKSPACE_SELECTED' ? 409 : 403;
    return respond({ success: false, code: error.code, error: error.message }, status);
  }
  if (error instanceof EnterpriseModuleError) {
    const status = error.code === 'MODULE_PERMISSION_REQUIRED' ? 403
      : error.code === 'RECORD_NOT_FOUND' || error.code === 'MODULE_NOT_SUPPORTED' ? 404
      : error.code === 'WORKSPACE_CONTEXT_CHANGED' ? 409 : 400;
    return respond({ success: false, code: error.code, error: error.message }, status);
  }
  return respond({ success: false, error: 'Shipping could not complete the request. Try again.' }, 500);
}

export async function GET() {
  try { return respond({ success: true, data: await getShippingOverview() }); }
  catch (error) { return handleError(error); }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return respond({ success: false, error: 'Cross-origin Shipping requests are not allowed.' }, 403);
  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return respond({ success: false, error: 'Shipping request is too large.' }, 413);
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return respond({ success: false, error: 'Shipping request is too large.' }, 413);
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return respond({ success: false, error: 'Enter valid Shipping data.' }, 400);
    const action = (body as Record<string, unknown>).action;
    if (action === 'create') return respond({ success: true, data: await createShippingShipment(body) }, 201);
    if (action === 'transition') return respond({ success: true, data: await transitionShippingShipment(body) });
    if (action === 'milestone') return respond({ success: true, data: await recordShippingMilestone(body) }, 201);
    return respond({ success: false, error: 'Choose a supported Shipping action.' }, 400);
  } catch (error) { return handleError(error); }
}
