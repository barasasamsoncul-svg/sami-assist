import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createRecurringAccountingJournal,
  generateRecurringAccountingJournal,
} from "@/lib/apps/accounting/journals";
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


export async function POST(
  request: NextRequest,
) {
  const origin =
    request.headers.get(
      "origin",
    );

  if (
    request.headers.get(
      "sec-fetch-site",
    ) ===
      "cross-site" ||
    (
      origin &&
      origin !==
        request.nextUrl.origin
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
    const text =
      await request.text();

    if (
      new TextEncoder().encode(
        text,
      ).length >
      65536
    ) {
      return respond(
        {
          error:
            "Recurring journal request is too large.",
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

    const result =
      body.action ===
        "generate"
        ? await generateRecurringAccountingJournal(
            body,
          )
        : body.action ===
            "create"
          ? await createRecurringAccountingJournal(
              body,
            )
          : null;

    if (!result) {
      return respond(
        {
          error:
            "Choose a supported recurring journal action.",
        },
        400,
      );
    }

    return respond(
      {
        success:
          true,
        result,
      },
      body.action ===
        "create"
        ? 201
        : 200,
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
              ? "Enter a valid recurring journal request."
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
      "[Accounting] Recurring journal action failed",
      error,
    );

    return respond(
      {
        error:
          error instanceof
            Error
            ? error.message
            : "The recurring journal action could not be completed.",
      },
      500,
    );
  }
}
