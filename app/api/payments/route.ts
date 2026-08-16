import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

// GET: List all payments
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

// POST: Record a new payment
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      invoice_id,
      amount,
      payment_method,
      transaction_reference,
      payment_date,
      notes,
      status = "completed",
      payment_method_details = {},
    } = body;

    // Validate required fields
    if (!invoice_id) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "Valid amount is required" },
        { status: 400 }
      );
    }

    if (!payment_method) {
      return NextResponse.json(
        { error: "Payment method is required" },
        { status: 400 }
      );
    }

    const validStatuses = ["pending", "completed", "failed", "refunded", "disputed"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    // Get invoice details
    const invoiceResult = await pool.query(
      `SELECT currency, total_amount, customer_id FROM invoices WHERE id = $1`,
      [invoice_id]
    );

    if (invoiceResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const invoice = invoiceResult.rows[0];
    const currency = invoice.currency || "USD";

    // Insert payment
    const paymentResult = await pool.query(
      `
      INSERT INTO payments (
        invoice_id,
        amount,
        currency,
        payment_method,
        payment_method_details,
        transaction_reference,
        payment_date,
        notes,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
      `,
      [
        invoice_id,
        amount,
        currency,
        payment_method,
        payment_method_details || {},
        transaction_reference || null,
        payment_date || new Date().toISOString(),
        notes || null,
        status,
      ]
    );

    const payment = paymentResult.rows[0];

    // Update invoice amount_paid and amount_due (only if payment is completed)
    if (status === "completed") {
      const paymentsResult = await pool.query(
        `SELECT SUM(amount) as total_paid FROM payments 
         WHERE invoice_id = $1 AND status = 'completed'`,
        [invoice_id]
      );

      const totalPaid = parseFloat(paymentsResult.rows[0]?.total_paid || 0);
      const totalAmount = parseFloat(invoice.total_amount || 0);
      const amountDue = Math.max(0, totalAmount - totalPaid);

      let statusUpdate = "sent";
      if (amountDue <= 0) {
        statusUpdate = "paid";
      } else if (totalPaid > 0) {
        statusUpdate = "partially_paid";
      }

      await pool.query(
        `
        UPDATE invoices 
        SET 
          amount_paid = $1,
          amount_due = $2,
          status = $3,
          payment_date = CASE WHEN $3 = 'paid' THEN NOW() ELSE payment_date END,
          updated_at = NOW()
        WHERE id = $4
        `,
        [totalPaid, amountDue, statusUpdate, invoice_id]
      );
    }

    // Log activity
    await pool.query(
      `
      INSERT INTO invoice_activity_log (
        invoice_id,
        user_id,
        user_name,
        action,
        details
      )
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        invoice_id,
        user.id,
        user.fullName || user.email,
        "payment_recorded",
        JSON.stringify({ 
          amount, 
          payment_method, 
          status,
          transaction_reference 
        }),
      ]
    );

    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    console.error("Payment creation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create payment" },
      { status: 500 }
    );
  }
}