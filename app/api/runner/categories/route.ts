
import { NextResponse } from "next/server";

import { query } from "@/lib/runner/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const isNative =
    request.headers.get("x-sami-client") === "runner" &&
    !request.headers.get("origin");

  if (!isNative) {
    return NextResponse.json(
      { error: "This service is available through the SaMi Runner app." },
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
       ORDER BY category_key ASC`,
    );

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
      cause instanceof Error ? cause.message : "unknown error",
    );

    return NextResponse.json(
      {
        error:
          "Runner task categories are not available yet. Please try again later.",
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
