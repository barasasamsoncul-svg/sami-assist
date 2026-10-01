import { NextRequest,NextResponse } from 'next/server';
import { EnterpriseModuleError } from '@/lib/apps/enterprise/service';
import { TenantContextError } from '@/lib/auth/tenant-context';
import { AccountingInputError } from '@/lib/apps/accounting/validation';
import {
  generateFxRevaluation,
  getAccountingFx,
  importFxRates,
  importInvoicingRates,
  postCrossCurrencyTransfer,
  postForeignVendorPayment,
  postFxRevaluation,
  reverseCrossCurrencyTransfer,
  reverseForeignVendorPayment,
  reverseFxRevaluation,
  saveExchangeRate,
  saveFxCurrency,
  saveFxSettings,
} from '@/lib/apps/accounting/fx';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const respond=(body:object,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown){
  if(error instanceof AccountingInputError||error instanceof SyntaxError)return respond({error:error instanceof SyntaxError?'Enter valid foreign-currency data.':error.message},400);
  if(error instanceof TenantContextError)return respond({error:error.message},error.code==='UNAUTHENTICATED'?401:403);
  if(error instanceof EnterpriseModuleError)return respond({error:error.message},error.code==='MODULE_PERMISSION_REQUIRED'?403:409);
  console.error('[Accounting] FX action failed',error);
  return respond({error:'The foreign-currency action could not be completed. Retry or contact your administrator.'},500);
}
export async function GET(request:NextRequest){
  try{return respond({success:true,result:await getAccountingFx({asOf:request.nextUrl.searchParams.get('asOf')||undefined})});}
  catch(error){return failure(error);}
}
export async function POST(request:NextRequest){
  const origin=request.headers.get('origin');
  if(request.headers.get('sec-fetch-site')==='cross-site'||(origin&&origin!==request.nextUrl.origin))return respond({error:'This request could not be verified.'},403);
  try{
    const raw=await request.text();
    if(new TextEncoder().encode(raw).length>160*1024)return respond({error:'Foreign-currency request is too large.'},413);
    const body=JSON.parse(raw) as Record<string,unknown>;
    const result=body.action==='save-settings'?await saveFxSettings(body)
      :body.action==='save-currency'?await saveFxCurrency(body)
      :body.action==='save-rate'?await saveExchangeRate(body)
      :body.action==='import-rates'?await importFxRates(body)
      :body.action==='import-invoicing-rates'?await importInvoicingRates()
      :body.action==='generate-revaluation'?await generateFxRevaluation(body)
      :body.action==='post-revaluation'?await postFxRevaluation(body)
      :body.action==='reverse-revaluation'?await reverseFxRevaluation(body)
      :body.action==='post-vendor-payment'?await postForeignVendorPayment(body)
      :body.action==='reverse-vendor-payment'?await reverseForeignVendorPayment(body)
      :body.action==='post-transfer'?await postCrossCurrencyTransfer(body)
      :body.action==='reverse-transfer'?await reverseCrossCurrencyTransfer(body)
      :(()=>{throw new AccountingInputError('Choose a supported foreign-currency action.');})();
    return respond({success:true,result});
  }catch(error){return failure(error);}
}
