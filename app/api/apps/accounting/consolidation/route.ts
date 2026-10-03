import { NextRequest,NextResponse } from 'next/server';

import { EnterpriseModuleError } from '@/lib/apps/enterprise/service';
import { TenantContextError } from '@/lib/auth/tenant-context';
import { CompanyContextError } from '@/lib/auth/company-context';
import { AccountingInputError } from '@/lib/apps/accounting/validation';
import {
  createConsolidationElimination,
  createConsolidationGroup,
  finalizeAccountingConsolidationRun,
  finalizeConsolidationElimination,
  getAccountingConsolidation,
  runAccountingConsolidation,
  saveConsolidationMapping,
  saveConsolidationMember,
  saveConsolidationRate,
  saveConsolidationSettings,
  setConsolidationGroupStatus,
} from '@/lib/apps/accounting/consolidation';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const respond=(body:object,status=200)=>
  NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});

function failure(error: unknown) {
  if (error instanceof SyntaxError) return respond({error:'Enter valid consolidation data.'},400);
  if (error instanceof AccountingInputError) return respond({error:error.message},400);
  if (error instanceof TenantContextError || error instanceof CompanyContextError) {
    return respond({error:error.message},'code' in error && error.code==='UNAUTHENTICATED' ? 401 : 403);
  }
  if (error instanceof EnterpriseModuleError) {
    return respond({error:error.message},error.code==='MODULE_PERMISSION_REQUIRED' ? 403 : 409);
  }
  console.error('[Accounting] Consolidation action failed',error);
  return respond({error:'The consolidation action could not be completed. Retry or contact your administrator.'},500);
}

export async function GET() {
  try {
    return respond({success:true,result:await getAccountingConsolidation()});
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request:NextRequest) {
  const origin=request.headers.get('origin');
  if (request.headers.get('sec-fetch-site')==='cross-site' || (origin && origin!==request.nextUrl.origin)) {
    return respond({error:'This request could not be verified.'},403);
  }
  try {
    const raw=await request.text();
    if (new TextEncoder().encode(raw).length>256*1024) {
      return respond({error:'Consolidation request is too large.'},413);
    }
    const body=JSON.parse(raw) as Record<string,unknown>;
    const result=
      body.action==='save-settings'
        ? await saveConsolidationSettings(body)
        : body.action==='create-group'
          ? await createConsolidationGroup(body)
          : body.action==='save-member'
            ? await saveConsolidationMember(body)
            : body.action==='save-mapping'
              ? await saveConsolidationMapping(body)
              : body.action==='save-rate'
                ? await saveConsolidationRate(body)
                : body.action==='create-elimination'
                  ? await createConsolidationElimination(body)
                  : body.action==='finalize-elimination'
                    ? await finalizeConsolidationElimination(body)
                    : body.action==='set-group-status'
                      ? await setConsolidationGroupStatus(body)
                      : body.action==='run'
                        ? await runAccountingConsolidation(body)
                        : body.action==='finalize-run'
                          ? await finalizeAccountingConsolidationRun(body)
                          : (()=>{ throw new AccountingInputError('Choose a supported consolidation action.'); })();
    return respond({success:true,result});
  } catch (error) {
    return failure(error);
  }
}
