import { NextResponse } from "next/server";

import { authenticateRunner } from "@/apps/runner/server/auth";
import { databasePool } from "@/apps/runner/server/db";
import { errorResponse } from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUNNER_SERVICE_TYPES = [
  "pickup_deliver",
  "shop_deliver",
] as const;

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
 * Returns the active Runner service catalogue. This endpoint is read-only.
 * A Runner must have a valid native-app session to access it.
 *
 * Response contract:
 * {
 *   ok: true,
 *   categories: [{ key: "pickup_deliver" }, { key: "shop_deliver" }]
 * }
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticateRunner(request, {
      allowRestricted: true,
    });

    if (auth.response) {
      return auth.response;
    }

    const result = await databasePool().query<RunnerServiceCategoryRow>(
      `SELECT category_key AS key
       FROM public.runner_service_categories
       WHERE is_active = true
         AND category_key = ANY($1::text[])
       ORDER BY display_order ASC, category_key ASC`,
      [RUNNER_SERVICE_TYPES],
    );

    const availableKeys = new Set(
      result.rows.map((item) => item.key),
    );

    const missingServices = RUNNER_SERVICE_TYPES.filter(
      (key) => !availableKeys.has(key),
    );

    if (missingServices.length > 0) {
      console.error(
        "[SaMi Runner categories] The service catalogue is missing required entries.",
        missingServices,
      );

      return errorResponse(
        "The Runner service catalogue is incomplete. Please contact SaMi Operations.",
        503,
      );
    }

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