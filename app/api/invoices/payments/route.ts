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
    const limit = parseInt(searchParams.get("limit") || "50");
    const invoiceId = searchParams.get("invoice_id");

    let query = `
      SELECT 
        p.*,
        i.invoice_number,
        i.customer_id,
        c.company_name as customer_name
      FROM payments p
      LEFT JOIN invoices i ON p.invoice_id = i.id
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 1;
    
    if (invoiceId) {
      query += ` AND p.invoice_id = $${paramCount}`;
      params.push(invoiceId);
      paramCount++;
    }
    
    query += ` ORDER BY p.payment_date DESC LIMIT $${paramCount}`;
    params.push(limit);

    const result = await pool.query(query, params);
    
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Payments fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load payments" },
      { status: 500 }
    );
  }
}