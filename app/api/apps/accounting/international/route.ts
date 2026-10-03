import { NextRequest,NextResponse } from 'next/server';
import { EnterpriseModuleError } from '@/lib/apps/enterprise/service';
import { TenantContextError } from '@/lib/auth/tenant-context';
import { AccountingInputError } from '@/lib/apps/accounting/validation';
import {
  archiveLocalizationReportRule,
  createLocalizationReportBox,
  createLocalizationReportRun,
  finalizeLocalizationReportRun,
  getAccountingInternational,
  installGenericVatLocalizationPack,
  saveAccountingInternationalSettings,
  saveLocalizationReportRule,
  setLocalizationBoxStatus,
} from '@/lib/apps/accounting/international';
import {
  importAccountingLocalizationPack,
} from '@/lib/apps/accounting/localization-packs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const respond=(body:object,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown){
  if(error instanceof AccountingInputError||error instanceof SyntaxError)return respond({error:error instanceof SyntaxError?'Enter valid international localization data.':error.message},400);
  if(error instanceof TenantContextError)return respond({error:error.message},error.code==='UNAUTHENTICATED'?401:403);
  if(error instanceof EnterpriseModuleError)return respond({error:error.message},error.code==='MODULE_PERMISSION_REQUIRED'?403:409);
  console.error('[Accounting] International localization action failed',error);
  return respond({error:'The international localization action could not be completed. Retry or contact your administrator.'},500);
}
export async function GET(request:NextRequest){
  try{return respond({success:true,result:await getAccountingInternational({
    from:request.nextUrl.searchParams.get('from')||undefined,
    to:request.nextUrl.searchParams.get('to')||undefined,
  })});}catch(error){return failure(error);}
}
export async function POST(request:NextRequest){
  const origin=request.headers.get('origin');
  if(request.headers.get('sec-fetch-site')==='cross-site'||(origin&&origin!==request.nextUrl.origin))return respond({error:'This request could not be verified.'},403);
  try{
    const raw=await request.text();
    if(new TextEncoder().encode(raw).length>96*1024)return respond({error:'Localization request is too large.'},413);
    const body=JSON.parse(raw) as Record<string,unknown>;
    const result=body.action==='save-settings'?await saveAccountingInternationalSettings(body)
      :body.action==='install-generic-vat-pack'?await installGenericVatLocalizationPack(body)
      :body.action==='import-pack'?await importAccountingLocalizationPack(body)
      :body.action==='create-box'?await createLocalizationReportBox(body)
      :body.action==='box-status'?await setLocalizationBoxStatus(body)
      :body.action==='save-rule'?await saveLocalizationReportRule(body)
      :body.action==='archive-rule'?await archiveLocalizationReportRule(body)
      :body.action==='create-report-run'?await createLocalizationReportRun(body)
      :body.action==='finalize-report-run'?await finalizeLocalizationReportRun(body)
      :(()=>{throw new AccountingInputError('Choose a supported international localization action.');})();
    return respond({success:true,result});
  }catch(error){return failure(error);}
}
