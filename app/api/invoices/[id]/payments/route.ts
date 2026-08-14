import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = { params: Promise<{ id: string }> };

async function refreshInvoice(client: any, invoiceId: string) {
  const invoiceResult = await client.query(
    `SELECT id, total_amount, amount_paid, amount_due, status FROM invoices WHERE id = $1 FOR UPDATE`,
    [invoiceId],
  );

  if (invoiceResult.rowCount !== 1) return null;

  const invoice = invoiceResult.rows[0];
  const paymentResult = await client.query(
    `
    SELECT COALESCE(SUM(amount), 0) AS paid
    FROM payments
    WHERE invoice_id = $1
      AND status = 'completed'
    `,
    [invoiceId],
  );

  const paid = Number(paymentResult.rows[0].paid || 0);
  const total = Number(invoice.total_amount || 0);
  const due = Math.max(total - paid, 0);

  let status = invoice.status;
  if (status !== "cancelled" && status !== "void") {
    if (due <= 0) status = "paid";
    else if (paid > 0) status = "partially_paid";
    else if (status === "paid" || status === "partially_paid") status = "sent";
  }

  await client.query(
    `
    UPDATE invoices
    SET amount_paid = $2,
        amount_due = $3,
        status = $4,
        payment_date = CASE WHEN $4 = 'paid' THEN NOW() ELSE payment_date END,
        updated_at = NOW()
    WHERE id = $1
    `,
    [invoiceId, paid, due, status],
  );

  return { paid, due, status };
}

// GET: Get all payments for an invoice
export async function GET(req: Request, context: Context) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);
    const { id } = await context.params;

    const result = await pool.query(
      `SELECT 
        id,
        invoice_id,
        amount,
        currency,
        payment_method,
        payment_method_details,
        transaction_reference,
        payment_date,
        status,
        reconciled,
        reconciled_at,
        notes,
        created_at,
        updated_at
      FROM payments 
      WHERE invoice_id = $1 
      ORDER BY payment_date DESC`,
      [id],
    );

    return NextResponse.json({ payments: result.rows });
  } catch (error) {
    console.error("Payments fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load payments" },
      { status: 500 },
    );
  }
}

// POST: Record payment for an invoice
export async function POST(req: Request, context: Context) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pool } = await getTenantDatabaseForUser(user.id);
  const { id } = await context.params;
  const client = await pool.connect();

  try {
    const body = await req.json();

    const amount = Number(body.amount);
    const method = String(body.payment_method || "other");
    const reference = String(body.transaction_reference ?? "").trim() || null;
    const notes = String(body.notes ?? "").trim() || null;
    const currency = String(body.currency || "USD");
    const paymentDate = body.payment_date || null;

    if (!Number.isFinite(amount) || amount <= 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Payment amount must be greater than zero." }, { status: 400 });
    }

    await client.query("BEGIN");

    const invoice = await client.query(
      `SELECT id, total_amount, amount_paid, amount_due, status FROM invoices WHERE id = $1 FOR UPDATE`,
      [id],
    );

    if (invoice.rowCount !== 1) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (invoice.rows[0].status === "cancelled" || invoice.rows[0].status === "void") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Cannot record payment for cancelled or voided invoice." }, { status: 400 });
    }

    const due = Number(invoice.rows[0].amount_due);
    if (amount > due + 0.005) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: `Payment exceeds the outstanding balance of ${due.toFixed(2)}.` },
        { status: 400 },
      );
    }

    // Insert payment with B2B fields
    await client.query(
      `
      INSERT INTO payments (
        invoice_id,
        amount,
        currency,
        payment_method,
        transaction_reference,
        payment_date,
        status,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()), 'completed', $7)
      `,
      [id, amount, currency, method, reference, paymentDate, notes],
    );

    const totals = await refreshInvoice(client, id);
    await client.query("COMMIT");

    return NextResponse.json({ success: true, totals }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Payment POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record payment" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}