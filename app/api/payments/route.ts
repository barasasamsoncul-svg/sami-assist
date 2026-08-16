import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

// =========================================================
// GET: List payments
// Includes related invoice and customer information.
// =========================================================
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const searchParams = req.nextUrl.searchParams;

    const rawLimit = parseInt(searchParams.get("limit") || "50", 10);
    const limit = Math.min(Math.max(rawLimit || 50, 1), 100);

    const invoiceId = searchParams.get("invoice_id");

    let query = `
      SELECT
        p.*,

        -- Related invoice
        i.invoice_number,

        -- Related customer
        c.id AS customer_id,
        c.company_name AS customer_name,
        c.contact_name AS customer_contact_name,
        c.email AS customer_email,
        c.phone AS customer_phone

      FROM payments p

      LEFT JOIN invoices i
        ON p.invoice_id = i.id

      LEFT JOIN customers c
        ON i.customer_id = c.id

      WHERE 1 = 1
    `;

    const params: unknown[] = [];
    let paramCount = 1;

    if (invoiceId) {
      query += ` AND p.invoice_id = $${paramCount}`;
      params.push(invoiceId);
      paramCount++;
    }

    query += `
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT $${paramCount}
    `;

    params.push(limit);

    const result = await pool.query(query, params);

    const payments = result.rows.map((row) => ({
      ...row,

      invoice_number: row.invoice_number || null,

      customer: row.customer_id
        ? {
            id: row.customer_id,
            company_name: row.customer_name || null,
            contact_name: row.customer_contact_name || null,
            email: row.customer_email || null,
            phone: row.customer_phone || null,
          }
        : null,
    }));

    return NextResponse.json(payments);
  } catch (error) {
    console.error("Payments fetch error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load payments",
      },
      { status: 500 }
    );
  }
}

// =========================================================
// POST: Record a new payment
// =========================================================
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
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

    // -----------------------------------------------------
    // Validate required fields
    // -----------------------------------------------------

    if (!invoice_id) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
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

    const validStatuses = [
      "pending",
      "completed",
      "failed",
      "refunded",
      "disputed",
    ];

    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        {
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    // -----------------------------------------------------
    // Get invoice + customer details
    // -----------------------------------------------------

    const invoiceResult = await pool.query(
      `
      SELECT
        i.id,
        i.invoice_number,
        i.currency,
        i.total_amount,
        i.amount_paid,
        i.amount_due,
        i.customer_id,

        c.company_name,
        c.contact_name,
        c.email,
        c.phone

      FROM invoices i

      LEFT JOIN customers c
        ON i.customer_id = c.id

      WHERE i.id = $1
      `,
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

    // -----------------------------------------------------
    // Prevent payment exceeding balance
    // -----------------------------------------------------

    if (status === "completed") {
      const currentAmountDue = Number(invoice.amount_due || 0);

      if (numericAmount > currentAmountDue) {
        return NextResponse.json(
          {
            error: `Payment amount cannot exceed the invoice balance due (${currentAmountDue.toFixed(
              2
            )} ${currency}).`,
          },
          { status: 400 }
        );
      }
    }

    // -----------------------------------------------------
    // Insert payment
    // -----------------------------------------------------

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
        numericAmount,
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

    // -----------------------------------------------------
    // Update invoice totals
    // Only completed payments affect the invoice balance.
    // -----------------------------------------------------

    if (status === "completed") {
      const paymentsResult = await pool.query(
        `
        SELECT COALESCE(SUM(amount), 0) AS total_paid
        FROM payments
        WHERE invoice_id = $1
          AND status = 'completed'
        `,
        [invoice_id]
      );

      const totalPaid = Number(
        paymentsResult.rows[0]?.total_paid || 0
      );

      const totalAmount = Number(
        invoice.total_amount || 0
      );

      const amountDue = Math.max(
        0,
        totalAmount - totalPaid
      );

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
          payment_date =
            CASE
              WHEN $3 = 'paid'
              THEN NOW()
              ELSE payment_date
            END,
          updated_at = NOW()
        WHERE id = $4
        `,
        [
          totalPaid,
          amountDue,
          statusUpdate,
          invoice_id,
        ]
      );
    }

    // -----------------------------------------------------
    // Log activity
    // -----------------------------------------------------

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
          amount: numericAmount,
          payment_method,
          status,
          transaction_reference,
        }),
      ]
    );

    // -----------------------------------------------------
    // Return enriched payment
    // -----------------------------------------------------

    const enrichedPayment = {
      ...payment,

      invoice_number: invoice.invoice_number || null,

      customer: invoice.customer_id
        ? {
            id: invoice.customer_id,
            company_name: invoice.company_name || null,
            contact_name: invoice.contact_name || null,
            email: invoice.email || null,
            phone: invoice.phone || null,
          }
        : null,
    };

    return NextResponse.json(
      {
        payment: enrichedPayment,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Payment creation error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create payment",
      },
      { status: 500 }
    );
  }
}