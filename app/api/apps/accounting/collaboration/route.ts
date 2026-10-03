import { NextRequest,NextResponse } from 'next/server';

import { EnterpriseModuleError } from '@/lib/apps/enterprise/service';
import { TenantContextError } from '@/lib/auth/tenant-context';
import { CompanyContextError } from '@/lib/auth/company-context';
import { AccountingInputError } from '@/lib/apps/accounting/validation';
import {
  addAccountingComment,
  deleteAccountingComment,
  editAccountingComment,
  followAccountingRecord,
  getAccountingCollaboration,
  linkAccountingFile,
  unfollowAccountingRecord,
  unlinkAccountingFile,
} from '@/lib/apps/accounting/collaboration';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const respond=(body:object,status=200)=>
  NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});

function failure(error:unknown) {
  if (error instanceof SyntaxError) return respond({error:'Enter valid collaboration data.'},400);
  if (error instanceof AccountingInputError) return respond({error:error.message},400);
  if (error instanceof TenantContextError) return respond({error:error.message},error.code==='UNAUTHENTICATED'?401:403);
  if (error instanceof CompanyContextError) return respond({error:error.message},error.code==='UNAUTHENTICATED'?401:403);
  if (error instanceof EnterpriseModuleError) return respond({error:error.message},error.code==='MODULE_PERMISSION_REQUIRED'?403:409);
  console.error('[Accounting] Collaboration action failed',error);
  return respond({error:'The Accounting collaboration action could not be completed. Retry or contact your administrator.'},500);
}

export async function GET(request:NextRequest) {
  try {
    const search=request.nextUrl.searchParams;
    return respond({
      success:true,
      result:await getAccountingCollaboration({
        model:search.get('model')||undefined,
        recordId:search.get('recordId')||undefined,
      }),
    });
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
    if (new TextEncoder().encode(raw).length>128*1024) {
      return respond({error:'Collaboration request is too large.'},413);
    }
    const body=JSON.parse(raw) as Record<string,unknown>;
    const result=
      body.action==='add-comment'
        ? await addAccountingComment(body)
        : body.action==='edit-comment'
          ? await editAccountingComment(body)
          : body.action==='delete-comment'
            ? await deleteAccountingComment(body)
            : body.action==='follow-record'
              ? await followAccountingRecord(body)
              : body.action==='unfollow-record'
                ? await unfollowAccountingRecord(body)
                : body.action==='link-file'
                  ? await linkAccountingFile(body)
                  : body.action==='unlink-file'
                    ? await unlinkAccountingFile(body)
                    : (()=>{throw new AccountingInputError('Choose a supported Accounting collaboration action.');})();
    return respond({success:true,result});
  } catch (error) {
    return failure(error);
  }
}
