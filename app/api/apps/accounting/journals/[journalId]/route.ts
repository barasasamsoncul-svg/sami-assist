import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  approveAccountingJournal,
  postAccountingJournal,
  reverseAccountingJournal,
} from "@/lib/apps/accounting/journals";
import {
  AccountingInputError,
} from "@/lib/apps/accounting/validation";
import {
  LedgerPostingError,
} from "@/lib/apps/accounting/ledger-engine";
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
        "Cache-Control": "no-store",
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
  {
    params,
  }: {
    params: Promise<{
      journalId: string;
    }>;
  },
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
      32768
    ) {
      return respond(
        {
          error:
            "Journal action is too large.",
        },
        413,
      );
    }

    const body =
      JSON.parse(
        text ||
        "{}",
      ) as Record<
        string,
        unknown
      >;

    const {
      journalId,
    } =
      await params;

    const action =
      body.action;

    const payload = {
      ...body,
      journalId,
    };

    const result =
      action ===
        "approve"
        ? await approveAccountingJournal(
            payload,
          )
        : action ===
            "post"
          ? await postAccountingJournal(
              payload,
            )
          : action ===
              "reverse"
            ? await reverseAccountingJournal(
                payload,
              )
            : null;

    if (!result) {
      return respond(
        {
          error:
            "Choose a supported journal action.",
        },
        400,
      );
    }

    return respond({
      success:
        true,
      result,
    });
  } catch (error) {
    if (
      error instanceof
        AccountingInputError ||
      error instanceof
        LedgerPostingError ||
      error instanceof
        SyntaxError
    ) {
      return respond(
        {
          error:
            error instanceof
              SyntaxError
              ? "Enter a valid journal action."
              : error.message,
        },
        error instanceof
          LedgerPostingError
          ? 409
          : 400,
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
      "[Accounting] Journal action failed",
      error,
    );

    return respond(
      {
        error:
          error instanceof
            Error
            ? error.message
            : "The journal action could not be completed.",
      },
      500,
    );
  }
}
