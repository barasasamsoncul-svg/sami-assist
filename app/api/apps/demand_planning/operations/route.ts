import { NextRequest, NextResponse } from 'next/server';
import { CompanyContextError } from '@/lib/auth/company-context';
import { TenantContextError } from '@/lib/auth/tenant-context';
import { EnterpriseModuleError } from '@/lib/apps/enterprise/service';
import { DemandPlanningConflictError, DemandPlanningInputError, decideDemandRecommendation, getDemandPlanningOverview, runDemandForecast } from '@/lib/apps/demand_planning/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BODY_BYTES = 48 * 1024;
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
  if (error instanceof DemandPlanningInputError) return respond({ success:false,error:error.message },400);
  if (error instanceof DemandPlanningConflictError) return respond({ success:false,error:error.message },409);
  if (error instanceof SyntaxError) return respond({ success:false,error:'Enter valid Demand Planning data.' },400);
  if (error instanceof TenantContextError || error instanceof CompanyContextError) {
    const status = error.code === 'UNAUTHENTICATED' ? 401 : error.code === 'NO_WORKSPACE_SELECTED' ? 409 : 403;
    return respond({ success:false,code:error.code,error:error.message },status);
  }
  if (error instanceof EnterpriseModuleError) {
    const status = error.code === 'MODULE_PERMISSION_REQUIRED' ? 403 : error.code === 'RECORD_NOT_FOUND' || error.code === 'MODULE_NOT_SUPPORTED' ? 404 : error.code === 'WORKSPACE_CONTEXT_CHANGED' ? 409 : 400;
    return respond({ success:false,code:error.code,error:error.message },status);
  }
  return respond({ success:false,error:'Demand Planning could not complete this request. Try again.' },500);
}
export async function GET(request: NextRequest) {
  if (!sameOrigin(request)) return respond({ success:false,error:'Cross-origin Demand Planning requests are not allowed.' },403);
  try { return respond({ success:true,data:await getDemandPlanningOverview() }); } catch (error) { return handleError(error); }
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return respond({ success:false,error:'Cross-origin Demand Planning requests are not allowed.' },403);
  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return respond({ success:false,error:'Demand Planning request is too large.' },413);
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return respond({ success:false,error:'Demand Planning request is too large.' },413);
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return respond({ success:false,error:'Enter valid Demand Planning data.' },400);
    const action = (body as Record<string,unknown>).action;
    if (action === 'run-forecast') return respond({ success:true,data:await runDemandForecast(body) },201);
    if (action === 'decide-recommendation') return respond({ success:true,data:await decideDemandRecommendation(body) });
    return respond({ success:false,error:'Choose a supported Demand Planning action.' },400);
  } catch (error) { return handleError(error); }
}
