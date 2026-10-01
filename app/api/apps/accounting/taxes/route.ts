import { NextRequest, NextResponse } from "next/server";

import {
  createAccountingTaxAdjustment,
  getAccountingTaxes,
  saveAccountingTaxCode,
  saveAccountingTaxGroup,
  saveAccountingTaxGroupComponent,
  setAccountingTaxStatus,
  transitionAccountingTaxAdjustment,
} from "@/lib/apps/accounting/tax-engine";
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

function errorResponse(error: unknown) {
  if (error instanceof AccountingInputError || error instanceof LedgerPostingError || error instanceof SyntaxError) {
    return respond(
      {error:error instanceof SyntaxError ? "Enter a valid Accounting tax request." : error.message},
      error instanceof LedgerPostingError ? 409 : 400,
    );
  }
  if (error instanceof TenantContextError) {
    return respond({error:error.message},error.code==="UNAUTHENTICATED"?401:403);
  }
  if (error instanceof EnterpriseModuleError) {
    return respond(
      {error:error.message},
      error.code==="MODULE_PERMISSION_REQUIRED"?403:error.code==="WORKSPACE_SUSPENDED"?402:409,
    );
  }
  console.error("[Accounting] Tax engine request failed",error);
  return respond({error:error instanceof Error?error.message:"Accounting tax action failed."},500);
}

export async function GET(request: NextRequest) {
  try {
    const {searchParams}=request.nextUrl;
    const result=await getAccountingTaxes({
      from:searchParams.get("from") || undefined,
      to:searchParams.get("to") || undefined,
      page:searchParams.get("page") || undefined,
    });
    return respond({success:true,result});
  } catch(error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!verified(request)) return respond({error:"This request could not be verified."},403);
  try {
    const raw=await request.text();
    if (new TextEncoder().encode(raw).length > 256*1024) {
      return respond({error:"Accounting tax request is too large."},413);
    }
    const body=JSON.parse(raw||"{}") as Record<string,unknown>;
    const action=String(body.action || "");
    const result=
      action==="save-code" ? await saveAccountingTaxCode(body) :
      action==="save-group" ? await saveAccountingTaxGroup(body) :
      action==="save-group-component" ? await saveAccountingTaxGroupComponent(body) :
      action==="set-code-status" ? await setAccountingTaxStatus({...body,kind:"code"}) :
      action==="set-group-status" ? await setAccountingTaxStatus({...body,kind:"group"}) :
      action==="create-adjustment" ? await createAccountingTaxAdjustment(body) :
      ["approve-adjustment","post-adjustment","reverse-adjustment","cancel-adjustment"].includes(action)
        ? await transitionAccountingTaxAdjustment({
            ...body,
            action:action.replace("-adjustment",""),
          })
        : null;
    if (!result) return respond({error:"Choose a supported Accounting tax action."},400);
    return respond({success:true,result},action.startsWith("save-") || action==="create-adjustment" ? 201 : 200);
  } catch(error) {
    return errorResponse(error);
  }
}
