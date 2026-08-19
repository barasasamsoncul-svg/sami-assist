import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function jsonValue(value: unknown, fallback: Record<string, unknown> | unknown[] = {}) {
  if (value === undefined || value === null) {
    return fallback;
  }
  return value;
}

/*
|--------------------------------------------------------------------------
| GET /api/invoices/events
|--------------------------------------------------------------------------
|
| Returns all invoice events with filtering.
|
| Supports:
| ?invoice_id=UUID
| ?event_type=created|updated|status_changed|paid|overdue|reminder_sent
| ?processed=true|false
| ?page=1
| ?limit=50
|--------------------------------------------------------------------------
*/

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const { searchParams } = new URL(req.url);

    const invoiceId = searchParams.get("invoice_id");
    const eventType = searchParams.get("event_type");
    const processed = searchParams.get("processed");
    const page = Math.max(1, toNumber(searchParams.get("page"), 1));
    const limit = Math.min(100, Math.max(1, toNumber(searchParams.get("limit"), 50)));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];

    let parameterIndex = 1;

    if (invoiceId) {
      conditions.push(`invoice_id = $${parameterIndex}`);
      values.push(invoiceId);
      parameterIndex++;
    }

    if (eventType) {
      conditions.push(`event_type = $${parameterIndex}`);
      values.push(eventType);
      parameterIndex++;
    }

    if (processed === "true") {
      conditions.push(`processed = true`);
    } else if (processed === "false") {
      conditions.push(`processed = false`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count
    const countResult = await pool.query(
      `
        SELECT COUNT(*)::integer AS count
        FROM public.invoice_events
        ${whereClause}
      `,
      values
    );

    const total = countResult.rows[0]?.count || 0;

    // Get events
    const result = await pool.query(
      `
        SELECT
          id,
          invoice_id,
          event_type,
          payload,
          processed,
          processed_at,
          retry_count,
          max_retries,
          error_message,
          webhook_url,
          response_status,
          response_body,
          created_at
        FROM public.invoice_events
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${parameterIndex}
        OFFSET $${parameterIndex + 1}
      `,
      [...values, limit, offset]
    );

    return NextResponse.json({
      success: true,
      events: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/events:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch invoice events",
      },
      { status: 500 }
    );
  }
}