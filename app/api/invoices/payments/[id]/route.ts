import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

// GET: Get single payment
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

    const result = await pool.query(
      `
      SELECT 
        p.*,
        i.invoice_number,
        i.customer_id,
        c.company_name as customer_name
      FROM payments p
      LEFT JOIN invoices i ON p.invoice_id = i.id
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE p.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ payment: result.rows[0] });
  } catch (error) {
    console.error("Payment fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch payment" },
      { status: 500 }
    );
  }
}

// PUT: Update payment
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id } = params;
    const {
      amount,
      payment_method,
      transaction_reference,
      payment_date,
      notes,
      status,
      reconciled,
      payment_method_details,
    } = body;

    const { pool } = await getTenantDatabaseForUser(user.id);

    // Check if payment exists
    const checkResult = await pool.query(
      `SELECT id, invoice_id, status FROM payments WHERE id = $1`,
      [id]
    );

    if (checkResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    const payment = checkResult.rows[0];
    const validStatuses = ["pending", "completed", "failed", "refunded", "disputed"];

    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (amount !== undefined) {
      updates.push(`amount = $${paramCount}`);
      values.push(amount);
      paramCount++;
    }

    if (payment_method) {
      updates.push(`payment_method = $${paramCount}`);
      values.push(payment_method);
      paramCount++;
    }

    if (payment_method_details !== undefined) {
      updates.push(`payment_method_details = $${paramCount}`);
      values.push(payment_method_details);
      paramCount++;
    }

    if (transaction_reference !== undefined) {
      updates.push(`transaction_reference = $${paramCount}`);
      values.push(transaction_reference);
      paramCount++;
    }

    if (payment_date) {
      updates.push(`payment_date = $${paramCount}`);
      values.push(payment_date);
      paramCount++;
    }

    if (notes !== undefined) {
      updates.push(`notes = $${paramCount}`);
      values.push(notes);
      paramCount++;
    }

    if (status) {
      updates.push(`status = $${paramCount}`);
      values.push(status);
      paramCount++;
    }

    if (reconciled !== undefined) {
      updates.push(`reconciled = $${paramCount}`);
      values.push(reconciled);
      paramCount++;
      if (reconciled) {
        updates.push(`reconciled_at = NOW()`);
        updates.push(`reconciled_by = $${paramCount}`);
        values.push(user.id);
        paramCount++;
      }
    }

    updates.push(`updated_at = NOW()`);
    updates.push(`id = $${paramCount}`);
    values.push(id);

    const query = `
      UPDATE payments 
      SET ${updates.join(", ")}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

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
        payment.invoice_id,
        user.id,
        user.fullName || user.email,
        "payment_updated",
        JSON.stringify({ payment_id: id, updates: body }),
      ]
    );

    return NextResponse.json({ payment: result.rows[0] });
  } catch (error) {
    console.error("Payment update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update payment" },
      { status: 500 }
    );
  }
}

// DELETE: Delete payment
export async function DELETE(
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

    // Check if payment exists
    const checkResult = await pool.query(
      `SELECT id, invoice_id, status FROM payments WHERE id = $1`,
      [id]
    );

    if (checkResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    const payment = checkResult.rows[0];

    // Delete payment
    await pool.query(
      `DELETE FROM payments WHERE id = $1`,
      [id]
    );

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
        payment.invoice_id,
        user.id,
        user.fullName || user.email,
        "payment_deleted",
        JSON.stringify({ payment_id: id }),
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Payment deletion error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete payment" },
      { status: 500 }
    );
  }
}