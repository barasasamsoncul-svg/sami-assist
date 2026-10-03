import { NextRequest,NextResponse } from 'next/server';

import { AccountingInputError } from '@/lib/apps/accounting/validation';
import { EnterpriseModuleError } from '@/lib/apps/enterprise/service';
import { TenantContextError } from '@/lib/auth/tenant-context';
import { CompanyContextError } from '@/lib/auth/company-context';
import {
  extractAccountingDocument,
  getAccountingDocumentCapture,
  reviewAccountingDocumentExtraction,
} from '@/lib/apps/accounting/document-extraction';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const respond=(body:object,status=200)=>
  NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});

function failure(error:unknown) {
  if (error instanceof SyntaxError) return respond({error:'Enter valid document-capture data.'},400);
  if (error instanceof AccountingInputError) return respond({error:error.message},400);
  if (error instanceof TenantContextError) return respond({error:error.message},error.code==='UNAUTHENTICATED'?401:403);
  if (error instanceof CompanyContextError) return respond({error:error.message},error.code==='UNAUTHENTICATED'?401:403);
  if (error instanceof EnterpriseModuleError) {
    return respond(
      {error:error.message},
      error.code==='MODULE_PERMISSION_REQUIRED'
        ? 403
        : error.code==='WORKSPACE_SUSPENDED'
          ? 402
          : 409,
    );
  }
  console.error('[Accounting] Document capture failed',error);
  return respond({error:'Accounting document capture could not be completed.'},500);
}

export async function GET() {
  try {
    return respond({success:true,result:await getAccountingDocumentCapture()});
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request:NextRequest) {
  const origin=request.headers.get('origin');
  if (request.headers.get('sec-fetch-site')==='cross-site'||(origin&&origin!==request.nextUrl.origin)) {
    return respond({error:'This request could not be verified.'},403);
  }

  try {
    const raw=await request.text();
    if (new TextEncoder().encode(raw).length>128*1024) {
      return respond({error:'Document-capture request is too large.'},413);
    }
    const body=JSON.parse(raw) as Record<string,unknown>;
    const action=String(body.action||'');
    const result=action==='extract'
      ? await extractAccountingDocument(body)
      : action==='review'
        ? await reviewAccountingDocumentExtraction(body)
        : null;
    if (!result) return respond({error:'Choose a supported document-capture action.'},400);
    return respond({success:true,result});
  } catch (error) {
    return failure(error);
  }
}
