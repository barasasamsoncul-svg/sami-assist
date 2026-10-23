import { NextRequest, NextResponse } from 'next/server';

import { CompanyContextError } from '@/lib/auth/company-context';
import { TenantContextError } from '@/lib/auth/tenant-context';
import { EnterpriseModuleError } from '@/lib/apps/enterprise/service';
import {
  VendorPortalError,
  cancelVendorPortalRfq,
  createVendorPortalAccount,
  decideVendorPortalResponse,
  getVendorPortalOverview,
  issueVendorPortalRfq,
} from '@/lib/apps/vendor_portal/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BODY_BYTES = 24 * 1024;

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
  if (error instanceof VendorPortalError) {
    const status = error.code === 'INVALID_INPUT' ? 400
      : error.code === 'NOT_FOUND' ? 404
      : error.code === 'STATE_CONFLICT' ? 409
      : 502;
    return respond({ success: false, code: error.code, error: error.message }, status);
  }
  if (error instanceof SyntaxError) return respond({ success: false, error: 'Enter valid Vendor Portal data.' }, 400);
  if (error instanceof TenantContextError || error instanceof CompanyContextError) {
    const status = error.code === 'UNAUTHENTICATED' ? 401 : error.code === 'NO_WORKSPACE_SELECTED' ? 409 : 403;
    return respond({ success: false, code: error.code, error: error.message }, status);
  }
  if (error instanceof EnterpriseModuleError) {
    const status = error.code === 'MODULE_PERMISSION_REQUIRED' ? 403
      : error.code === 'RECORD_NOT_FOUND' || error.code === 'MODULE_NOT_SUPPORTED' ? 404
      : error.code === 'WORKSPACE_SUSPENDED' ? 402 : 409;
    return respond({ success: false, code: error.code, error: error.message }, status);
  }
  return respond({ success: false, error: 'Vendor Portal could not complete this request. Try again.' }, 500);
}

export async function GET(request: NextRequest) {
  if (!sameOrigin(request)) return respond({ success: false, error: 'Cross-origin Vendor Portal requests are not allowed.' }, 403);
  try {
    return respond({ success: true, result: await getVendorPortalOverview() });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return respond({ success: false, error: 'Cross-origin Vendor Portal requests are not allowed.' }, 403);
  const declaredSize = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredSize) && declaredSize > MAX_BODY_BYTES) return respond({ success: false, error: 'Vendor Portal request is too large.' }, 413);
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return respond({ success: false, error: 'Vendor Portal request is too large.' }, 413);
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return respond({ success: false, error: 'Enter valid Vendor Portal data.' }, 400);
    const body = value as Record<string, unknown>;
    switch (body.action) {
      case 'create-account':
        return respond({ success: true, result: await createVendorPortalAccount(body) }, 201);
      case 'issue-rfq':
        return respond({ success: true, result: await issueVendorPortalRfq(body) }, 201);
      case 'cancel-rfq':
        return respond({ success: true, result: await cancelVendorPortalRfq(body) });
      case 'decide-response':
        return respond({ success: true, result: await decideVendorPortalResponse(body) });
      default:
        return respond({ success: false, error: 'Choose a supported Vendor Portal action.' }, 400);
    }
  } catch (error) {
    return handleError(error);
  }
}
