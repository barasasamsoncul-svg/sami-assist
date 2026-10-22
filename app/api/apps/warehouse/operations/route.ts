import { NextRequest, NextResponse } from 'next/server';

import { CompanyContextError } from '@/lib/auth/company-context';
import { TenantContextError } from '@/lib/auth/tenant-context';
import { EnterpriseModuleError } from '@/lib/apps/enterprise/service';
import {
  WarehouseConflictError,
  WarehouseInputError,
  getWarehouseWorkspaceOverview,
  runWarehouseAction,
} from '@/lib/apps/warehouse/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 64 * 1024;

function respond(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  });
}

function sameOrigin(request: NextRequest) {
  if (request.headers.get('sec-fetch-site')?.toLowerCase() === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function handleError(error: unknown) {
  if (error instanceof WarehouseInputError) {
    return respond({ success: false, error: error.message }, 400);
  }
  if (error instanceof WarehouseConflictError) {
    return respond({ success: false, error: error.message }, 409);
  }
  if (error instanceof SyntaxError) {
    return respond({ success: false, error: 'Enter valid Warehouse data.' }, 400);
  }
  if (error instanceof TenantContextError || error instanceof CompanyContextError) {
    const status = error.code === 'UNAUTHENTICATED' ? 401
      : error.code === 'NO_WORKSPACE_SELECTED' ? 409 : 403;
    return respond({ success: false, code: error.code, error: error.message }, status);
  }
  if (error instanceof EnterpriseModuleError) {
    const status = error.code === 'MODULE_PERMISSION_REQUIRED' ? 403
      : error.code === 'RECORD_NOT_FOUND' || error.code === 'MODULE_NOT_SUPPORTED' ? 404
      : error.code === 'WORKSPACE_SUSPENDED' ? 402 : 409;
    return respond({ success: false, code: error.code, error: error.message }, status);
  }
  return respond({ success: false, error: 'Warehouse could not complete this request. Please retry.' }, 500);
}

export async function GET(request: NextRequest) {
  if (!sameOrigin(request)) return respond({ success: false, error: 'Cross-origin access is not allowed.' }, 403);
  try {
    return respond({ success: true, data: await getWarehouseWorkspaceOverview() });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return respond({ success: false, error: 'Cross-origin access is not allowed.' }, 403);
  const declaredSize = Number(request.headers.get('content-length') || 0);
  if (declaredSize > MAX_BODY_BYTES) return respond({ success: false, error: 'Warehouse request is too large.' }, 413);

  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
      return respond({ success: false, error: 'Warehouse request is too large.' }, 413);
    }
    const payload = JSON.parse(raw) as unknown;
    return respond({ success: true, data: await runWarehouseAction(payload) });
  } catch (error) {
    return handleError(error);
  }
}
