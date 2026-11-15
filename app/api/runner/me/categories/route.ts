import { NextResponse } from "next/server";

import { authenticateRunner } from "@/apps/runner/server/auth";
import { databasePool } from "@/apps/runner/server/db";
import {
  errorResponse,
  isRecord,
} from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUNNER_SERVICE_TYPES = [
  "pickup_deliver",
  "shop_deliver",
] as const;

const ALLOWED_SERVICE_KEYS = new Set<string>(
  RUNNER_SERVICE_TYPES,
);

type RunnerServiceCategoryRow = {
  key: string;
};

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

/**
 * GET /api/runner/categories
 *
 * The mobile Tasks screen loads this catalogue before rendering the
 * six service-and-vehicle combinations. Keep the response contract
 * aligned with getRunnerCategories(): { ok, categories: [{ key }] }.
 */
export async function GET(request: Request) {
  const auth = await authenticateRunner(request, {
    allowRestricted: true,
  });

  if (auth.response) {
    return auth.response;
  }

  try {
    const result = await databasePool().query<RunnerServiceCategoryRow>(
      `SELECT category_key AS key
       FROM public.runner_service_categories
       WHERE is_active = true
         AND category_key = ANY($1::text[])
       ORDER BY display_order ASC, category_key ASC`,
      [RUNNER_SERVICE_TYPES],
    );

    return response({
      ok: true,
      categories: result.rows,
    });
  } catch (cause) {
    console.error(
      "[SaMi Runner categories] Catalogue read failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "The Runner service catalogue could not be loaded. Please try again.",
      503,
    );
  }
}

/**
 * PUT /api/runner/me/categories
 *
 * Kept for existing callers. New Tasks setup writes should use the
 * combined /api/runner/me/onboarding/setup endpoint instead.
 */
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
      "This Runner account cannot update its service.",
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
      "Choose one Runner service.",
    );
  }

  const rawKeys = body.categoryKeys;

  if (
    rawKeys.length !== 1 ||
    !rawKeys.every(
      (key): key is string =>
        typeof key === "string" &&
        key.trim().length > 0,
    )
  ) {
    return errorResponse(
      "Select exactly one Runner service: Pick Up & Deliver or Shop & Deliver.",
    );
  }

  const categoryKeys = rawKeys.map((key) =>
    key.trim().toLowerCase(),
  );

  const uniqueCategoryKeys = [
    ...new Set(categoryKeys),
  ];

  if (uniqueCategoryKeys.length !== 1) {
    return errorResponse(
      "A Runner can select only one service.",
    );
  }

  if (
    !uniqueCategoryKeys.every((key) =>
      ALLOWED_SERVICE_KEYS.has(key),
    )
  ) {
    return errorResponse(
      "Only Pick Up & Deliver or Shop & Deliver is available for Runners.",
    );
  }

  const client = await databasePool().connect();

  try {
    await client.query("BEGIN");

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
        "This Runner account cannot update its service.",
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
        "Runner service selection cannot be changed after an application has been submitted or approved.",
        409,
      );
    }

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
      activeCategoriesResult.rows.length !== 1 ||
      activeCategoriesResult.rows[0]?.category_key !==
        uniqueCategoryKeys[0]
    ) {
      await client.query("ROLLBACK");

      return errorResponse(
        "The selected Runner service is unavailable. Refresh the list and try again.",
        409,
      );
    }

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
       VALUES ($1, $2, now())`,
      [
        auth.runner.id,
        uniqueCategoryKeys[0],
      ],
    );

    await client.query("COMMIT");

    return response({
      ok: true,
      message: "Your Runner service has been saved.",
      selectedCategories: uniqueCategoryKeys,
      nextStep: "tasks",
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
      "Your Runner service could not be saved. Please try again.",
      503,
    );
  } finally {
    client.release();
  }
}
