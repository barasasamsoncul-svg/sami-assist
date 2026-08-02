import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } =
      await getTenantDatabaseForUser(user.id);

    /*
     * An invoice is considered overdue when:
     * - it has a due date
     * - the due date has passed
     * - there is still an outstanding balance
     * - it has not been cancelled
     *
     * We calculate this dynamically rather than changing
     * the database status just by viewing the endpoint.
     */

    const result = await pool.query(`
      SELECT
        i.id,
        i.invoice_number,
        i.issue_date,
        i.due_date,
        i.status,
        i.subtotal,
        i.tax_amount,
        i.total_amount,
        i.amount_paid,
        i.amount_due,
        i.notes,
        i.created_at,
        i.updated_at,

        CURRENT_DATE - i.due_date
          AS days_overdue,

        json_build_object(
          'id', c.id,
          'company_name', c.company_name,
          'contact_name', c.contact_name,
          'email', c.email,
          'phone', c.phone,
          'address', c.address
        ) AS customer

      FROM invoices i

      INNER JOIN customers c
        ON c.id = i.customer_id

      WHERE
        i.due_date IS NOT NULL
        AND i.due_date < CURRENT_DATE
        AND i.amount_due > 0
        AND i.status <> 'cancelled'

      ORDER BY
        i.due_date ASC,
        i.created_at ASC
    `);

    return NextResponse.json({
      success: true,
      invoices: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error(
      "Overdue invoices API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load overdue invoices",
      },
      { status: 500 }
    );
  }
}
