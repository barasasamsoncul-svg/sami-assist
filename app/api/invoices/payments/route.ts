import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { pool } = await getTenantDatabaseForUser(user.id);
    const result = await pool.query(`
      SELECT p.id, p.invoice_id, p.amount, p.payment_method,
             p.transaction_reference, p.payment_date, p.status, p.notes,
             i.invoice_number, c.company_name
      FROM payments p
      INNER JOIN invoices i ON i.id = p.invoice_id
      INNER JOIN customers c ON c.id = i.customer_id
      ORDER BY p.payment_date DESC, p.created_at DESC
    `);
    return NextResponse.json({ payments: result.rows });
  } catch (error) {
    console.error("Invoice payments GET error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load payments" }, { status: 500 });
  }
}
