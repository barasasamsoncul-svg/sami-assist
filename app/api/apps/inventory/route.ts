import { NextRequest, NextResponse } from 'next/server';
import { CompanyContextError } from '@/lib/auth/company-context';
import { TenantContextError } from '@/lib/auth/tenant-context';
import { EnterpriseModuleError } from '@/lib/apps/enterprise/service';
import { InventoryConflictError, InventoryInputError, getInventoryStockOverview, getInventoryWorkflowOverview, runInventoryWorkflow } from '@/lib/apps/inventory/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BODY_BYTES = 32 * 1024;

function respond(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' } });
}
function sameOrigin(request: NextRequest) {
  if (request.headers.get('sec-fetch-site')?.toLowerCase() === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).origin === request.nextUrl.origin; } catch { return false; }
}
function handleError(error: unknown) {
  if (error instanceof InventoryInputError) {
    return respond({ success: false, error: error.message }, 400);
  }
  if (error instanceof InventoryConflictError) {
    return respond({ success: false, error: error.message }, 409);
  }
  if (error instanceof SyntaxError) {
    return respond({ success: false, error: 'Enter valid inventory data.' }, 400);
  }
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
  console.error('[SaMi Inventory] request failed', error);
  return respond({ success: false, error: 'The Inventory request could not be completed. Retry or contact your administrator.' }, 500);
}

export async function GET() {
  try {
    const [stock, workflows] = await Promise.all([getInventoryStockOverview(), getInventoryWorkflowOverview()]);
    return respond({ success: true, result: { ...stock, ...workflows } });
  }
  catch (error) { return handleError(error); }
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return respond({ success: false, error: 'This request could not be verified.' }, 403);
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return respond({ success: false, error: 'Inventory request is too large.' }, 413);
    const body = JSON.parse(raw) as unknown;
    const result = await runInventoryWorkflow(body);
    return respond({ success: true, result });
  } catch (error) { return handleError(error); }
}
