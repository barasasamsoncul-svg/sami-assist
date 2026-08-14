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
        COUNT(*)::int AS total_invoices,
        COUNT(*) FILTER (WHERE status = 'draft')::int AS draft_invoices,
        COUNT(*) FILTER (WHERE status = 'sent')::int AS sent_invoices,
        COUNT(*) FILTER (WHERE status = 'viewed')::int AS viewed_invoices,
        COUNT(*) FILTER (WHERE status = 'partially_paid')::int AS partial_invoices,
        COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_invoices,
        COUNT(*) FILTER (
          WHERE status NOT IN ('paid','cancelled','void')
            AND amount_due > 0
            AND due_date IS NOT NULL
            AND due_date < CURRENT_DATE
        )::int AS overdue_invoices,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_invoices,
        COUNT(*) FILTER (WHERE status = 'void')::int AS void_invoices,
        COALESCE(SUM(total_amount), 0)::numeric AS total_invoiced,
        COALESCE(SUM(amount_paid), 0)::numeric AS total_collected,
        COALESCE(SUM(amount_due), 0)::numeric AS total_outstanding
      FROM invoices
      WHERE status NOT IN ('cancelled', 'void')
    `);

    return NextResponse.json({ stats: result.rows[0] });
  } catch (error) {
    console.error("Invoice stats error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load invoice statistics" },
      { status: 500 },
    );
  }
}