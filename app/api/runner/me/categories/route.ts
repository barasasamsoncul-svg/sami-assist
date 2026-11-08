
import { NextResponse } from "next/server";

import { authenticateRunner } from "@/apps/runner/server/auth";
import { databasePool } from "@/apps/runner/server/db";
import { errorResponse, isRecord } from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CATEGORIES = 16;

const CATEGORY_KEY_PATTERN = /^[a-z0-9_]{2,60}$/;

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
      "This Runner account cannot update its task categories.",
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
      "Choose the task categories you can perform.",
    );
  }

  const rawKeys = body.categoryKeys;

  if (
    rawKeys.length < 1 ||
    rawKeys.length > MAX_CATEGORIES ||
    !rawKeys.every(
      (key): key is string =>
        typeof key === "string" &&
        CATEGORY_KEY_PATTERN.test(key),
    )
  ) {
    return errorResponse(
      "Select between 1 and 16 valid task categories.",
    );
  }

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
      "A task category has been selected more than once.",
    );
  }

  const client = await databasePool().connect();

  try {
    await client.query("BEGIN");

    // Lock the account while replacing its category selection.
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
        "This Runner account cannot update its task categories.",
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
        "Task categories cannot be changed after an application has been submitted or approved.",
        409,
      );
    }

    // Only active Runner categories can be saved.
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
        "One or more selected task categories are no longer available. Refresh the list and try again.",
        409,
      );
    }

    // Replace the full selection in one transaction so an
    // interrupted save cannot leave a partial selection behind.
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
      message: "Your task categories have been saved.",
      selectedCategories: uniqueCategoryKeys,
      nextStep: "transport",
    });
  } catch (cause) {
    await client.query("ROLLBACK").catch(
      () => undefined,
    );

    console.error(
      "[SaMi Runner task categories] Save failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Your task categories could not be saved. Please try again.",
      503,
    );
  } finally {
    client.release();
  }
}
