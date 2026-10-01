import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createGoodsReceipt,
  createPurchaseOrder,
  createPurchasePolicy,
  createPurchaseRequisition,
  getAccountingPurchasing,
  matchVendorBillToPurchaseOrder,
  overridePurchaseMatch,
  transitionPurchaseOrder,
  transitionPurchaseRequisition,
} from "@/lib/apps/accounting/purchasing";
import {
  AccountingInputError,
} from "@/lib/apps/accounting/validation";
import {
  EnterpriseModuleError,
} from "@/lib/apps/enterprise/service";
import {
  TenantContextError,
} from "@/lib/auth/tenant-context";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function respond(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function verified(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !(
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== request.nextUrl.origin)
  );
}

export async function GET(request: NextRequest) {
  try {
    const page = request.nextUrl.searchParams.get("page") || undefined;
    return respond({
      success: true,
      result: await getAccountingPurchasing({ page }),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!verified(request)) {
    return respond({ error: "This request could not be verified." }, 403);
  }

  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 1024 * 1024) {
      return respond({ error: "Purchasing request is too large." }, 413);
    }
    const body = JSON.parse(raw || "{}") as Record<string, unknown>;
    const action = String(body.action || "");

    const result =
      action === "create-policy"
        ? await createPurchasePolicy(body)
        : action === "create-requisition"
          ? await createPurchaseRequisition(body)
          : action === "transition-requisition"
            ? await transitionPurchaseRequisition(body)
            : action === "create-order"
              ? await createPurchaseOrder(body)
              : action === "transition-order"
                ? await transitionPurchaseOrder(body)
                : action === "create-receipt"
                  ? await createGoodsReceipt(body)
                  : action === "match-bill"
                    ? await matchVendorBillToPurchaseOrder(body)
                    : action === "override-match"
                      ? await overridePurchaseMatch(body)
                      : null;

    if (!result) {
      return respond({ error: "Choose a supported purchasing action." }, 400);
    }

    return respond({
      success: true,
      result,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return respond({ error: "Enter a valid purchasing request." }, 400);
    }
    return handleError(error);
  }
}

function handleError(error: unknown) {
  if (error instanceof AccountingInputError) {
    return respond({ error: error.message }, 400);
  }
  if (error instanceof TenantContextError) {
    return respond(
      { error: error.message },
      error.code === "UNAUTHENTICATED" ? 401 : 403,
    );
  }
  if (error instanceof EnterpriseModuleError) {
    return respond(
      { error: error.message },
      error.code === "MODULE_PERMISSION_REQUIRED"
        ? 403
        : error.code === "WORKSPACE_SUSPENDED"
          ? 402
          : 409,
    );
  }

  console.error("[Accounting] Purchasing action failed", error);
  return respond(
    {
      error:
        error instanceof Error
          ? error.message
          : "The purchasing action could not be completed.",
    },
    500,
  );
}
