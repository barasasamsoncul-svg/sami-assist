import { NextRequest, NextResponse } from 'next/server';

import {
  EnterpriseModuleError,
} from '@/lib/apps/enterprise/service';
import {
  createVendorPortalAccessLink,
  revokeVendorPortalAccess,
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
  const site = request.headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (site === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return respond({ success: false, code: 'INVALID_ORIGIN', error: 'This request could not be verified.' }, 403);
  }

  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > 16 * 1024) {
    return respond({ success: false, code: 'REQUEST_TOO_LARGE', error: 'This Vendor Portal request is too large.' }, 413);
  }

  try {
    const payload: unknown = await request.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return respond({ success: false, code: 'INVALID_INPUT', error: 'A valid JSON request body is required.' }, 400);
    }
    const input = payload as Record<string, unknown>;
    const action = typeof input.action === 'string' ? input.action.trim().toLowerCase() : '';
    const result = action === 'issue'
      ? await createVendorPortalAccessLink(input)
      : action === 'revoke'
        ? await revokeVendorPortalAccess(input)
        : null;
    if (!result) {
      return respond({ success: false, code: 'INVALID_ACTION', error: 'Choose a supported vendor access action.' }, 400);
    }
    return respond({ success: true, result });
  } catch (error) {
    if (error instanceof VendorPortalError) {
      const status = error.code === 'ACCESS_NOT_FOUND' ? 404
        : error.code === 'RESPONSE_LOCKED' ? 409 : 400;
      return respond({ success: false, code: error.code, error: error.message }, status);
    }
    if (error instanceof EnterpriseModuleError) {
      const status = error.code === 'MODULE_PERMISSION_REQUIRED' ? 403
        : error.code === 'WORKSPACE_SUSPENDED' ? 402
          : error.code === 'MODULE_NOT_INSTALLED' || error.code === 'MODULE_NOT_SUPPORTED' ? 404
            : error.code === 'TABLE_NOT_READY' ? 409 : 400;
      return respond({ success: false, code: error.code, error: error.message }, status);
    }
    console.error('[SaMi Vendor Portal] access-link operation failed:', error);
    return respond({ success: false, code: 'VENDOR_PORTAL_REQUEST_FAILED', error: 'SaMi could not complete this vendor access request.' }, 500);
  }
}
