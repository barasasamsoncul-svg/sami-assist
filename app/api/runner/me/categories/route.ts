import { NextResponse } from "next/server";

import { authenticateRunner } from "@/apps/runner/server/auth";
import { databasePool } from "@/apps/runner/server/db";
import { errorResponse, isRecord } from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUNNER_SERVICE_TYPES = [
  "pickup_deliver",
  "shop_deliver",
] as const;

const ALLOWED_SERVICE_KEYS = new Set<string>(
  RUNNER_SERVICE_TYPES,
);

function response(
  body: Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
    },
  });
}

export async function PUT(request: Request) {
  const auth = await authenticateRunner(request);

  if (auth.response) {
    return auth.response;
  }

  if (
    ["suspended", "closed"].includes(
      auth.runner.account_status,
    )
  ) {
    return errorResponse(
      "This Runner account cannot update its services.",
      403,
    );
  }

  const body: unknown = await request.json().catch(
    () => null,
  );

  if (
    !isRecord(body) ||
    !Array.isArray(body.categoryKeys)
  ) {
    return errorResponse(
      "Choose Pick Up & Deliver, Shop & Deliver, or both.",
    );
  }

  const rawKeys = body.categoryKeys;

  if (
    rawKeys.length < 1 ||
    rawKeys.length > RUNNER_SERVICE_TYPES.length ||
    !rawKeys.every(
      (key): key is string =>
        typeof key === "string" &&
        key.trim().length > 0,
    )
  ) {
    return errorResponse(
      "Select one or both of the two available Runner services.",
    );
  }

  // Normalize service keys before validation.
  const categoryKeys = rawKeys.map((key) =>
    key.trim().toLowerCase(),
  );

  const uniqueCategoryKeys = [
    ...new Set(categoryKeys),
  ];

  if (
    uniqueCategoryKeys.length !== categoryKeys.length
  ) {
    return errorResponse(
      "A Runner service has been selected more than once.",
    );
  }

  // Only these two service types are permitted.
  if (
    !uniqueCategoryKeys.every((key) =>
      ALLOWED_SERVICE_KEYS.has(key),
    )
  ) {
    return errorResponse(
      "Only Pick Up & Deliver and Shop & Deliver are available Runner services.",
    );
  }

  const client = await databasePool().connect();

  try {
    await client.query("BEGIN");

    // Lock the Runner account while validating and replacing
    // the service selection.
    const accountResult = await client.query<{
      account_status: string;
      verification_status: string;
    }>(
      `SELECT
         account_status,
         verification_status
       FROM public.runner_accounts
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [auth.runner.id],
    );

    const account = accountResult.rows[0];

    if (!account) {
      await client.query("ROLLBACK");

      return errorResponse(
        "Runner account not found.",
        404,
      );
    }

    if (
      ["suspended", "closed"].includes(
        account.account_status,
      )
    ) {
      await client.query("ROLLBACK");

      return errorResponse(
        "This Runner account cannot update its services.",
        403,
      );
    }

    if (
      ["submitted", "approved"].includes(
        account.verification_status,
      )
    ) {
      await client.query("ROLLBACK");

      return errorResponse(
        "Runner services cannot be changed after an application has been submitted or approved.",
        409,
      );
    }

    // Verify that every requested service exists and is active.
    const activeCategoriesResult =
      await client.query<{
        category_key: string;
      }>(
        `SELECT category_key
         FROM public.runner_service_categories
         WHERE category_key = ANY($1::text[])
           AND is_active = true
         FOR SHARE`,
        [uniqueCategoryKeys],
      );

    if (
      activeCategoriesResult.rows.length !==
      uniqueCategoryKeys.length
    ) {
      await client.query("ROLLBACK");

      return errorResponse(
        "One or more selected Runner services are unavailable. Refresh the list and try again.",
        409,
      );
    }

    // Replace the complete selection transactionally.
    await client.query(
      `DELETE FROM public.runner_account_service_categories
       WHERE runner_id = $1`,
      [auth.runner.id],
    );

    await client.query(
      `INSERT INTO public.runner_account_service_categories (
         runner_id,
         category_key,
         selected_at
       )
       SELECT
         $1,
         selected.category_key,
         now()
       FROM unnest($2::text[]) AS selected(category_key)`,
      [
        auth.runner.id,
        uniqueCategoryKeys,
      ],
    );

    await client.query("COMMIT");

    return response({
      ok: true,
      message: "Your Runner services have been saved.",
      selectedCategories: uniqueCategoryKeys,
      nextStep: "transport",
    });
  } catch (cause) {
    await client.query("ROLLBACK").catch(
      () => undefined,
    );

    console.error(
      "[SaMi Runner services] Save failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Your Runner services could not be saved. Please try again.",
      503,
    );
  } finally {
    client.release();
  }
}