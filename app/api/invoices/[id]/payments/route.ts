import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = { params: Promise<{ id: string }> };

async function refreshInvoice(pool: any, invoiceId: string) {
  const invoiceResult = await pool.query(
    `SELECT id, total_amount, amount_paid, amount_due, status FROM invoices WHERE id = $1 FOR UPDATE`,
    [invoiceId],
  );

  if (invoiceResult.rowCount !== 1) return null;

  const invoice = invoiceResult.rows[0];
  const paymentResult = await pool.query(
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
  if (status !== "cancelled") {
    if (due <= 0) status = "paid";
    else if (paid > 0) status = "partial";
    else if (status === "paid" || status === "partial") status = "sent";
  }

  await pool.query(
    `
    UPDATE invoices
    SET amount_paid = $2,
        amount_due = $3,
        status = $4,
        updated_at = NOW()
    WHERE id = $1
    `,
    [invoiceId, paid.toFixed(2), due.toFixed(2), status],
  );

  return { paid, due, status };
}

export async function GET(_req: Request, context: Context) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);
    const { id } = await context.params;

    const result = await pool.query(
      `SELECT * FROM payments WHERE invoice_id = $1 ORDER BY payment_date DESC`,
      [id],
    );

    return NextResponse.json({ payments: result.rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load payments" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request, context: Context) {
  const client = await (async () => {
    const user = await getAuthenticatedUser();
    if (!user) return null;
    const { pool } = await getTenantDatabaseForUser(user.id);
    return pool.connect();
  })();

  try {
    if (!client) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);
    const { id } = await context.params;
    const body = await req.json();

    const amount = Number(body.amount);
    const method = String(body.payment_method || "other");
    const reference = String(body.transaction_reference ?? "").trim() || null;
    const notes = String(body.notes ?? "").trim() || null;

    if (!Number.isFinite(amount) || amount <= 0) {
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

    if (invoice.rows[0].status === "cancelled") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Cancelled invoices cannot receive payments." }, { status: 400 });
    }

    const due = Number(invoice.rows[0].amount_due);
    if (amount > due + 0.005) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: `Payment exceeds the outstanding balance of ${due.toFixed(2)}.` }, { status: 400 });
    }

    await client.query(
      `
      INSERT INTO payments (
        invoice_id, amount, payment_method,
        transaction_reference, payment_date, status, notes
      )
      VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()), 'completed', $6)
      `,
      [id, amount.toFixed(2), method, reference, body.payment_date || null, notes],
    );

    const totals = await refreshInvoice(client, id);
    await client.query("COMMIT");

    return NextResponse.json({ success: true, totals }, { status: 201 });
  } catch (error) {
    try { await client?.query("ROLLBACK"); } catch {}
    console.error("Payment POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record payment" },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}
