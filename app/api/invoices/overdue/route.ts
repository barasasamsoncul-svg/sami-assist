import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);

    const result = await pool.query(`
      SELECT
        i.*,
        json_build_object(
          'id', c.id,
          'company_name', c.company_name,
          'contact_name', c.contact_name,
          'email', c.email,
          'phone', c.phone
        ) AS customer,
        CURRENT_DATE - i.due_date AS days_overdue
      FROM invoices i
      INNER JOIN customers c ON c.id = i.customer_id
      WHERE i.status NOT IN ('paid','cancelled')
        AND i.amount_due > 0
        AND i.due_date IS NOT NULL
        AND i.due_date < CURRENT_DATE
      ORDER BY i.due_date ASC
    `);

    return NextResponse.json({ invoices: result.rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load overdue invoices" },
      { status: 500 },
    );
  }
}
