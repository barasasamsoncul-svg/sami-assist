import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| GET /api/invoices/reminders/[id]
|--------------------------------------------------------------------------
|
| Returns a single reminder.
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
        { error: "Reminder ID is required" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `
        SELECT
          r.*,

          json_build_object(
            'id', i.id,
            'invoice_number', i.invoice_number,
            'status', i.status,
            'total_amount', i.total_amount,
            'amount_due', i.amount_due,
            'currency', i.currency,
            'due_date', i.due_date
          ) AS invoice,

          json_build_object(
            'id', c.id,
            'company_name', c.company_name,
            'contact_name', c.contact_name,
            'email', c.email,
            'phone', c.phone
          ) AS customer

        FROM public.invoice_reminders r

        INNER JOIN public.invoices i
          ON i.id = r.invoice_id

        INNER JOIN public.customers c
          ON c.id = i.customer_id

        WHERE r.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Reminder not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      reminder: result.rows[0],
    });
  } catch (error) {
    console.error("GET /api/invoices/reminders/[id]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch reminder",
      },
      { status: 500 }
    );
  }
}