import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = { params: Promise<{ id: string }> };

async function getInvoice(pool: any, id: string) {
  const result = await pool.query(
    `
    SELECT
      i.*,
      json_build_object(
        'id', c.id,
        'company_name', c.company_name,
        'contact_name', c.contact_name,
        'email', c.email,
        'phone', c.phone,
        'address', c.address
      ) AS customer,
      COALESCE((
        SELECT json_agg(
          json_build_object(
            'id', ii.id,
            'description', ii.description,
            'quantity', ii.quantity,
            'unit_price', ii.unit_price,
            'tax_rate', ii.tax_rate,
            'tax_amount', ii.tax_amount,
            'line_total', ii.line_total
          )
          ORDER BY ii.created_at ASC
        )
        FROM invoice_items ii WHERE ii.invoice_id = i.id
      ), '[]'::json) AS invoice_items,
      COALESCE((
        SELECT json_agg(
          json_build_object(
            'id', p.id,
            'amount', p.amount,
            'payment_method', p.payment_method,
            'transaction_reference', p.transaction_reference,
            'payment_date', p.payment_date,
            'status', p.status,
            'notes', p.notes,
            'created_at', p.created_at
          )
          ORDER BY p.payment_date DESC
        )
        FROM payments p WHERE p.invoice_id = i.id
      ), '[]'::json) AS payments
    FROM invoices i
    INNER JOIN customers c ON c.id = i.customer_id
    WHERE i.id = $1
    LIMIT 1
    `,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function GET(_req: Request, context: Context) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);
    const { id } = await context.params;
    const invoice = await getInvoice(pool, id);

    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    return NextResponse.json({ invoice });
  } catch (error) {
    console.error("Invoice detail GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load invoice" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request, context: Context) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);
    const { id } = await context.params;
    const body = await req.json();

    const current = await getInvoice(pool, id);
    if (!current) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const allowed = new Set(["draft", "sent", "partial", "paid", "cancelled"]);
    const requestedStatus = body.status == null ? current.status : String(body.status);

    if (!allowed.has(requestedStatus)) {
      return NextResponse.json({ error: "Invalid invoice status" }, { status: 400 });
    }

    if (current.status === "paid" && requestedStatus !== "paid") {
      return NextResponse.json({ error: "A paid invoice cannot be moved back to another status." }, { status: 400 });
    }

    if (requestedStatus === "paid" && Number(current.amount_due) > 0) {
      return NextResponse.json({ error: "An invoice cannot be marked paid while it has an outstanding balance." }, { status: 400 });
    }

    const dueDate = body.due_date === undefined ? current.due_date : body.due_date || null;
    const notes = body.notes === undefined ? current.notes : String(body.notes ?? "").trim() || null;

    const result = await pool.query(
      `
      UPDATE invoices
      SET status = $2, due_date = $3, notes = $4, updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [id, requestedStatus, dueDate, notes],
    );

    return NextResponse.json({ invoice: await getInvoice(pool, result.rows[0].id) });
  } catch (error) {
    console.error("Invoice PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update invoice" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, context: Context) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);
    const { id } = await context.params;

    const invoice = await getInvoice(pool, id);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
    if (payments.length > 0 || Number(invoice.amount_paid) > 0) {
      return NextResponse.json(
        { error: "This invoice has payments and cannot be deleted. Cancel it instead." },
        { status: 409 },
      );
    }

    await pool.query(`DELETE FROM invoices WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Invoice DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete invoice" },
      { status: 500 },
    );
  }
}
