import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createOpeningBalanceBatch,
} from "@/lib/apps/accounting/opening-balances";
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

const respond = (
  body: object,
  status = 200,
) =>
  NextResponse.json(
    body,
    {
      status,
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );


function verified(
  request: NextRequest,
) {
  const origin =
    request.headers.get(
      "origin",
    );

  return !(
    request.headers.get(
      "sec-fetch-site",
    ) ===
      "cross-site" ||
    (
      origin &&
      origin !==
        request.nextUrl.origin
    )
  );
}


export async function POST(
  request: NextRequest,
) {
  if (!verified(request)) {
    return respond(
      {
        error:
          "This request could not be verified.",
      },
      403,
    );
  }

  try {
    const text =
      await request.text();

    if (
      new TextEncoder().encode(
        text,
      ).length >
      5 *
        1024 *
        1024
    ) {
      return respond(
        {
          error:
            "Opening-balance import is too large. Keep one request below 5 MB.",
        },
        413,
      );
    }

    const body =
      JSON.parse(
        text ||
        "{}",
      );

    const result =
      await createOpeningBalanceBatch(
        body,
      );

    return respond(
      {
        success:
          true,
        result,
      },
      result.replayed
        ? 200
        : 201,
    );
  } catch (error) {
    if (
      error instanceof
        AccountingInputError ||
      error instanceof
        SyntaxError
    ) {
      return respond(
        {
          error:
            error instanceof
              SyntaxError
              ? "Enter a valid opening-balance request."
              : error.message,
        },
        400,
      );
    }

    if (
      error instanceof
        TenantContextError
    ) {
      return respond(
        {
          error:
            error.message,
        },
        error.code ===
          "UNAUTHENTICATED"
          ? 401
          : 403,
      );
    }

    if (
      error instanceof
        EnterpriseModuleError
    ) {
      return respond(
        {
          error:
            error.message,
        },
        error.code ===
          "MODULE_PERMISSION_REQUIRED"
          ? 403
          : error.code ===
              "WORKSPACE_SUSPENDED"
            ? 402
            : 409,
      );
    }

    console.error(
      "[Accounting] Opening-balance import failed",
      error,
    );

    return respond(
      {
        error:
          error instanceof
            Error
            ? error.message
            : "Opening balances could not be imported.",
      },
      500,
    );
  }
}
