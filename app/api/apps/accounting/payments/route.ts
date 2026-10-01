import { NextRequest, NextResponse } from 'next/server';
import { createPaymentBatch, getAccountingPayments, transitionPaymentBatch } from '@/lib/apps/accounting/payments';
import { paymentBody } from '@/lib/apps/accounting/payment-validation';
import { AccountingInputError } from '@/lib/apps/accounting/validation';
import { LedgerPostingError } from '@/lib/apps/accounting/ledger-engine';
import { EnterpriseModuleError } from '@/lib/apps/enterprise/service';
import { TenantContextError } from '@/lib/auth/tenant-context';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const respond=(body:object,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown) {
  if (error instanceof AccountingInputError || error instanceof SyntaxError) return respond({error:error instanceof SyntaxError?'Enter valid payment data.':error.message},400);
  if (error instanceof LedgerPostingError) return respond({error:error.message},409);
  if (error instanceof TenantContextError) return respond({error:error.message},error.code==='UNAUTHENTICATED'?401:403);
  if (error instanceof EnterpriseModuleError) return respond({error:error.message},error.code==='MODULE_PERMISSION_REQUIRED'?403:409);
  console.error('[Accounting] Payment action failed',error);
  return respond({error:'The payment action could not be completed. Retry or contact your administrator.'},500);
}
export async function GET(request:NextRequest) {
  try {return respond({success:true,result:await getAccountingPayments(request.nextUrl.searchParams.get('page')||undefined)});} catch(error) {return failure(error);}
}
export async function POST(request:NextRequest) {
  const origin=request.headers.get('origin');
  if (request.headers.get('sec-fetch-site')==='cross-site' || (origin && origin!==request.nextUrl.origin)) return respond({error:'This request could not be verified.'},403);
  try {
    const raw=await request.text();
    if (new TextEncoder().encode(raw).length>128*1024) return respond({error:'Payment request is too large.'},413);
    const body=paymentBody(JSON.parse(raw));
    const result=body.action==='create'?await createPaymentBatch(body):await transitionPaymentBatch(body);
    return respond({success:true,result});
  } catch(error) {return failure(error);}
}
