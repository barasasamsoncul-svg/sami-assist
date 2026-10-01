import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  changeFinancialAccountStatus,
  createFinancialAccount,
  createInternalTransfer,
  getAccountingBankCash,
  reverseInternalTransfer,
  updateFinancialAccount,
} from "@/lib/apps/accounting/bank-cash";
import {
  LedgerPostingError,
} from "@/lib/apps/accounting/ledger-engine";
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


function respond(
  body: object,
  status = 200,
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}


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


export async function GET(
  request: NextRequest,
) {
  try {
    return respond({
      success:
        true,
      result:
        await getAccountingBankCash({
          page:
            request.nextUrl.searchParams.get(
              "page",
            ) ||
            undefined,
        }),
    });
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}


export async function POST(
  request: NextRequest,
) {
  if (
    !verified(
      request,
    )
  ) {
    return respond(
      {
        error:
          "This request could not be verified.",
      },
      403,
    );
  }

  try {
    const raw =
      await request.text();

    if (
      new TextEncoder().encode(
        raw,
      ).length >
      1024 *
        1024
    ) {
      return respond(
        {
          error:
            "Financial-account request is too large.",
        },
        413,
      );
    }

    const body =
      JSON.parse(
        raw ||
        "{}",
      ) as Record<
        string,
        unknown
      >;

    const action =
      String(
        body.action ||
        "",
      );

    const result =
      action ===
        "create-account"
        ? await createFinancialAccount(
            body,
          )
        : action ===
            "update-account"
          ? await updateFinancialAccount(
              body,
            )
          : action ===
              "change-status"
            ? await changeFinancialAccountStatus(
                body,
              )
            : action ===
                "create-transfer"
              ? await createInternalTransfer(
                  body,
                )
              : action ===
                  "reverse-transfer"
                ? await reverseInternalTransfer(
                    body,
                  )
                : null;

    if (!result) {
      return respond(
        {
          error:
            "Choose a supported bank, cash or mobile-money action.",
        },
        400,
      );
    }

    return respond({
      success:
        true,
      result,
    });
  } catch (
    error
  ) {
    if (
      error instanceof
        SyntaxError
    ) {
      return respond(
        {
          error:
            "Enter a valid financial-account request.",
        },
        400,
      );
    }

    return handleError(
      error,
    );
  }
}


function handleError(
  error: unknown,
) {
  if (
    error instanceof
      AccountingInputError
  ) {
    return respond(
      {
        error:
          error.message,
      },
      400,
    );
  }

  if (
    error instanceof
      LedgerPostingError
  ) {
    return respond(
      {
        error:
          error.message,
      },
      409,
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
    "[Accounting] Financial-account action failed",
    error,
  );

  return respond(
    {
      error:
        error instanceof
          Error
          ? error.message
          : "The financial-account action could not be completed.",
    },
    500,
  );
}
