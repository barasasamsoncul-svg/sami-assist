import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| GET /api/invoices/activity/[id]
|--------------------------------------------------------------------------
|
| Returns a single activity record.
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
        { error: "Activity ID is required" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `
        SELECT
          a.id,
          a.invoice_id,
          a.user_id,
          a.user_name,
          a.action,
          a.details,
          a.ip_address,
          a.user_agent,
          a.created_at,

          i.invoice_number,
          i.status AS invoice_status,
          i.total_amount,
          i.amount_due,
          i.currency,

          c.id AS customer_id,
          c.company_name AS customer_name,

          CASE
            WHEN a.user_id IS NOT NULL THEN (
              SELECT row_to_json(u)
              FROM (
                SELECT
                  id,
                  full_name,
                  email
                FROM public.users
                WHERE id = a.user_id
              ) u
            )
            ELSE NULL
          END AS user_details

        FROM public.invoice_activity_log a

        INNER JOIN public.invoices i
          ON i.id = a.invoice_id

        INNER JOIN public.customers c
          ON c.id = i.customer_id

        WHERE a.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Activity record not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      activity: result.rows[0],
    });
  } catch (error) {
    console.error("GET /api/invoices/activity/[id]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch activity record",
      },
      { status: 500 }
    );
  }
}