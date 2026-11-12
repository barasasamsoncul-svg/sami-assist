
import { NextResponse } from "next/server";

import { query } from "@/apps/runner/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUNNER_SERVICE_TYPES = [
  "pickup_deliver",
  "shop_deliver",
] as const;

export async function GET(request: Request) {
  const isNative =
    request.headers.get("x-sami-client") === "runner" &&
    !request.headers.get("origin");

  if (!isNative) {
    return NextResponse.json(
      {
        error:
          "This service is available through the SaMi Runner app.",
      },
      { status: 403 },
    );
  }

  try {
    const result = await query<{
      category_key: string;
    }>(
      `SELECT category_key
       FROM public.runner_service_categories
       WHERE is_active = true
         AND category_key = ANY($1::text[])
       ORDER BY
         CASE category_key
           WHEN 'pickup_deliver' THEN 1
           WHEN 'shop_deliver' THEN 2
           ELSE 3
         END`,
      [[...RUNNER_SERVICE_TYPES]],
    );

    const availableKeys = new Set(
      result.rows.map((row) => row.category_key),
    );

    // Do not expose a partial service catalogue.
    // Both services must exist and be active.
    const hasCompleteCatalogue =
      RUNNER_SERVICE_TYPES.every((key) =>
        availableKeys.has(key),
      ) &&
      result.rows.length === RUNNER_SERVICE_TYPES.length;

    if (!hasCompleteCatalogue) {
      console.error(
        "[SaMi Runner categories] The two-service catalogue is not fully configured.",
      );

      return NextResponse.json(
        {
          error:
            "Runner services are not fully configured yet. Please try again later.",
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store, private",
          },
        },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        categories: result.rows.map((row) => ({
          key: row.category_key,
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      },
    );
  } catch (cause) {
    console.error(
      "[SaMi Runner categories] Failed to load categories.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return NextResponse.json(
      {
        error:
          "Runner services are not available yet. Please try again later.",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, private",
        },
      },
    );
  }
}
