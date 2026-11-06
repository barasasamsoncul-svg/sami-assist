import { NextResponse } from "next/server";

import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await query<{
      database_time: string;
      schema_ready: boolean;
    }>(
      `SELECT
         now()::text AS database_time,
         to_regclass('public.runner_accounts') IS NOT NULL
         AND to_regclass('public.runner_jobs') IS NOT NULL
         AND to_regclass('public.runner_sessions') IS NOT NULL
         AS schema_ready`,
    );

    const ready = result.rows[0]?.schema_ready === true;

    return NextResponse.json(
      {
        ok: ready,
        service: "sami-runner-api",
        database: "connected",
        schema: ready ? "ready" : "migration_required",
        serverTime: result.rows[0]?.database_time || null,
      },
      {
        status: ready ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        service: "sami-runner-api",
        database: "unavailable",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}