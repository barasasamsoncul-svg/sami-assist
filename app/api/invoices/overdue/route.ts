import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { pool } = await getTenantDatabaseForUser(user.id);
    const searchParams = req.nextUrl.searchParams;
    const days = parseInt(searchParams.get("days") || "7");

    const result = await pool.query(
      `
      SELECT 
        i.*,
        (
          SELECT row_to_json(c.*) 
          FROM customers c 
          WHERE c.id = i.customer_id
        ) as customer
      FROM invoices i
      WHERE i.status NOT IN ('paid', 'cancelled', 'void')
        AND i.due_date IS NOT NULL
        AND i.due_date <= CURRENT_DATE + INTERVAL '${days} days'
        AND i.due_date >= CURRENT_DATE
      ORDER BY i.due_date ASC
      `,
    );

    return NextResponse.json({ invoices: result.rows });
  } catch (error) {
    console.error("Overdue invoices fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch overdue invoices" },
      { status: 500 }
    );
  }
}