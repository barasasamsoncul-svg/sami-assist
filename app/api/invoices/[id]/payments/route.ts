import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { pool } = await getTenantDatabaseForUser(user.id);
    const { id } = params;

    // Check if invoice exists
    const invoiceCheck = await pool.query(
      `SELECT id FROM invoices WHERE id = $1`,
      [id]
    );

    if (invoiceCheck.rows.length === 0) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const result = await pool.query(
      `
      SELECT *
      FROM payments
      WHERE invoice_id = $1
      ORDER BY payment_date DESC
      `,
      [id]
    );

    return NextResponse.json({ payments: result.rows });
  } catch (error) {
    console.error("Invoice payments fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch payments" },
      { status: 500 }
    );
  }
}