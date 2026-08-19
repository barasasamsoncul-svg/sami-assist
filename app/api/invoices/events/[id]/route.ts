import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| GET /api/invoices/events/[id]
|--------------------------------------------------------------------------
|
| Returns a single event.
|--------------------------------------------------------------------------
*/

export async function GET(req: NextRequest, { params }: Context) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Event ID is required" },
        { status: 400 }
      );
    }

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
        WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      event: result.rows[0],
    });
  } catch (error) {
    console.error("GET /api/invoices/events/[id]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch event",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices/events/[id]/retry
|--------------------------------------------------------------------------
|
| Retries a failed event.
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest, { params }: Context) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Event ID is required" },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Get existing event
      const existingResult = await client.query(
        `
          SELECT *
          FROM public.invoice_events
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if (existingResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Event not found" },
          { status: 404 }
        );
      }

      const event = existingResult.rows[0];

      // Check if already processed
      if (event.processed) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Event is already processed" },
          { status: 409 }
        );
      }

      // Check retry limit
      if (event.retry_count >= event.max_retries) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Max retries exceeded" },
          { status: 409 }
        );
      }

      // Increment retry count
      const result = await client.query(
        `
          UPDATE public.invoice_events
          SET
            retry_count = retry_count + 1,
            error_message = NULL,
            processed = false,
            response_status = NULL,
            response_body = NULL,
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [id]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        message: "Event queued for retry",
        event: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("POST /api/invoices/events/[id]/retry:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to retry event",
      },
      { status: 500 }
    );
  }
}