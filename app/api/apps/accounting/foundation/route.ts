import { NextRequest, NextResponse } from "next/server";
import { createAccountingJournal } from "@/lib/apps/accounting/foundation";
import { AccountingInputError } from "@/lib/apps/accounting/validation";
import { EnterpriseModuleError } from "@/lib/apps/enterprise/service";
import { EnterpriseIdempotencyConflictError } from "@/lib/apps/enterprise/idempotency";
import { TenantContextError } from "@/lib/auth/tenant-context";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const respond = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== request.nextUrl.origin)
  )
    return respond({ error: "This request could not be verified." }, 403);
  try {
    if (Number(request.headers.get("content-length") || 0) > 65536)
      return respond({ error: "Journal is too large." }, 413);
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 65536)
      return respond({ error: "Journal is too large." }, 413);
    const result = await createAccountingJournal(JSON.parse(text));
    return respond(
      { success: true, journal: result },
      result.replayed ? 200 : 201,
    );
  } catch (error) {
    if (error instanceof AccountingInputError || error instanceof SyntaxError)
      return respond(
        {
          error:
            error instanceof SyntaxError
              ? "Enter a valid journal."
              : error.message,
        },
        400,
      );
    if (error instanceof EnterpriseIdempotencyConflictError)
      return respond({ error: error.message }, 409);
    if (error instanceof TenantContextError)
      return respond(
        { error: error.message },
        error.code === "UNAUTHENTICATED" ? 401 : 403,
      );
    if (error instanceof EnterpriseModuleError)
      return respond(
        { error: error.message },
        error.code === "MODULE_PERMISSION_REQUIRED"
          ? 403
          : error.code === "WORKSPACE_SUSPENDED"
            ? 402
            : 409,
      );
    console.error("[Accounting] Could not save journal", error);
    return respond(
      { error: "The journal could not be saved. Retry with the same details." },
      500,
    );
  }
}
