import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { status } = await req.json();
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    const validStatuses = [
      "draft",
      "pending_approval",
      "sent",
      "viewed",
      "partially_paid",
      "paid",
      "overdue",
      "cancelled",
      "void"
    ];

    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    // Check if invoice exists
    const checkResult = await pool.query(
      `SELECT id, status FROM invoices WHERE id = $1`,
      [id]
    );

    if (checkResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const currentStatus = checkResult.rows[0].status;

    // Prevent invalid status transitions
    if (currentStatus === "paid" && status !== "void") {
      return NextResponse.json(
        { error: "Cannot change status of a paid invoice" },
        { status: 400 }
      );
    }

    if (currentStatus === "cancelled" || currentStatus === "void") {
      return NextResponse.json(
        { error: `Cannot change status of a ${currentStatus} invoice` },
        { status: 400 }
      );
    }

    // Build update object
    const updates: string[] = [`status = $1`, `updated_at = NOW()`];
    const values: any[] = [status];
    let paramCount = 2;

    // Add timestamps based on status
    if (status === "sent") {
      updates.push(`sent_at = NOW()`);
    }
    if (status === "viewed") {
      updates.push(`viewed_at = NOW()`);
    }
    if (status === "pending_approval") {
      updates.push(`approved_at = NOW()`);
    }
    if (status === "paid") {
      updates.push(`payment_date = NOW()`);
    }

    // Handle cancellation
    if (status === "cancelled" || status === "void") {
      updates.push(`cancelled_by = $${paramCount}`);
      values.push(user.id);
      paramCount++;
    }

    updates.push(`id = $${paramCount}`);
    values.push(id);

    const query = `
      UPDATE invoices 
      SET ${updates.join(", ")}
      WHERE id = $${paramCount}
      RETURNING 
        *,
        (
          SELECT row_to_json(c.*) 
          FROM customers c 
          WHERE c.id = invoices.customer_id
        ) as customer
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
        id,
        user.id,
       user.fullName || user.email,
        `status_updated_to_${status}`,
        JSON.stringify({ 
          previous_status: currentStatus,
          new_status: status,
          updated_at: new Date().toISOString() 
        }),
      ]
    );

    return NextResponse.json({ invoice: result.rows[0] });
  } catch (error) {
    console.error("Status update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update status" },
      { status: 500 }
    );
  }
}