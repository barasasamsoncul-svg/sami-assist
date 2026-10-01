import { NextRequest, NextResponse } from "next/server";
import { AccountingInputError } from "@/lib/apps/accounting/validation";
import { LedgerPostingError } from "@/lib/apps/accounting/ledger-engine";
import { EnterpriseModuleError } from "@/lib/apps/enterprise/service";
import { TenantContextError } from "@/lib/auth/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const respond = (body: object, status = 200) =>
  NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});

function verified(request: NextRequest) {
  const origin=request.headers.get("origin");
  return !(request.headers.get("sec-fetch-site")==="cross-site" || (origin && origin!==request.nextUrl.origin));
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AccountingInputError || error instanceof LedgerPostingError || error instanceof SyntaxError) {
    return respond({error:error instanceof SyntaxError ? "Enter a valid Accounts Payable request." : error.message}, error instanceof LedgerPostingError ? 409 : 400);
  }
  if (error instanceof TenantContextError) {
    return respond({error:error.message},error.code==="UNAUTHENTICATED"?401:403);
  }
  if (error instanceof EnterpriseModuleError) {
    return respond({error:error.message},error.code==="MODULE_PERMISSION_REQUIRED"?403:error.code==="WORKSPACE_SUSPENDED"?402:409);
  }
  console.error("[Accounting] Payables request failed",error);
  return respond({error:error instanceof Error?error.message:fallback},500);
}

import {
  applyPayablesCredit,
  approvePayablesDocument,
  cancelPayablesDocument,
  postPayablesDocument,
  reversePayablesDocument,
} from "@/lib/apps/accounting/payables";

export async function POST(
  request: NextRequest,
  {params}:{params:Promise<{documentId:string}>},
) {
  if (!verified(request)) return respond({error:"This request could not be verified."},403);
  try {
    const raw=await request.text();
    if (new TextEncoder().encode(raw).length > 65536) {
      return respond({error:"Accounts Payable action is too large."},413);
    }
    const body=JSON.parse(raw||"{}") as Record<string,unknown>;
    const {documentId}=await params;
    const payload={...body,documentId};
    const result=body.action==="approve"
      ? await approvePayablesDocument(payload)
      : body.action==="post"
        ? await postPayablesDocument(payload)
        : body.action==="apply-credit"
          ? await applyPayablesCredit({...payload,creditDocumentId:documentId})
          : body.action==="reverse"
            ? await reversePayablesDocument(payload)
            : body.action==="cancel"
              ? await cancelPayablesDocument(payload)
              : null;
    if (!result) return respond({error:"Choose a supported Accounts Payable action."},400);
    return respond({success:true,result});
  } catch(error) {
    return errorResponse(error,"The Accounts Payable action could not be completed.");
  }
}
