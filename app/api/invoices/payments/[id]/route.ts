import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

// GET: Get payments for a specific invoice
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }  // Changed to Promise
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { pool } = await getTenantDatabaseForUser(user.id);
    const { id } = await params;  // Await the params

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
      SELECT 
        p.*,
        i.invoice_number,
        c.company_name as customer_name
      FROM payments p
      LEFT JOIN invoices i ON p.invoice_id = i.id
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE p.invoice_id = $1
      ORDER BY p.payment_date DESC
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

// POST: Add payment to invoice
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }  // Changed to Promise
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id } = await params;  // Await the params
    const {
      amount,
      payment_method,
      transaction_reference,
      payment_date,
      notes,
      status = "completed",
      payment_method_details = {},
    } = body;

    // Validate required fields
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

    // Check if invoice exists
    const invoiceResult = await pool.query(
      `SELECT currency, total_amount FROM invoices WHERE id = $1`,
      [id]
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
        id,
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
        [id]
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
        [totalPaid, amountDue, statusUpdate, id]
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
        id,
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