import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type RawItem = {
  description?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
  tax_rate?: unknown;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeItems(items: RawItem[]) {
  return items.map((item) => {
    const description = String(item.description ?? "").trim();
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unit_price);
    const taxRate = Number(item.tax_rate ?? 0);

    if (!description) throw new Error("Every invoice item needs a description.");
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantity must be greater than zero.");
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("Unit price cannot be negative.");
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new Error("Tax rate must be between 0 and 100.");

    const subtotal = quantity * unitPrice;
    const taxAmount = subtotal * (taxRate / 100);
    return {
      description,
      quantity,
      unitPrice,
      taxRate,
      taxAmount,
      lineTotal: subtotal + taxAmount,
    };
  });
}

async function completeInvoice(client: any, id: string) {
  const result = await client.query(
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
        FROM invoice_items ii
        WHERE ii.invoice_id = i.id
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
        FROM payments p
        WHERE p.invoice_id = i.id
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

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);

    const result = await pool.query(`
      SELECT
        i.*,
        json_build_object(
          'id', c.id,
          'company_name', c.company_name,
          'contact_name', c.contact_name,
          'email', c.email,
          'phone', c.phone,
          'address', c.address
        ) AS customer
      FROM invoices i
      INNER JOIN customers c ON c.id = i.customer_id
      ORDER BY i.created_at DESC
    `);

    return NextResponse.json({ invoices: result.rows });
  } catch (error) {
    console.error("Invoices GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load invoices" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  let client: any = null;

  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const customerId = String(body.customer_id ?? "").trim();
    const items = Array.isArray(body.items) ? body.items as RawItem[] : [];

    if (!customerId) return NextResponse.json({ error: "Customer is required" }, { status: 400 });
    if (!items.length) return NextResponse.json({ error: "At least one invoice item is required" }, { status: 400 });

    const { pool, business } = await getTenantDatabaseForUser(user.id);
    client = await pool.connect();

    const normalized = normalizeItems(items);
    const subtotal = normalized.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const taxAmount = normalized.reduce((sum, item) => sum + item.taxAmount, 0);
    const totalAmount = subtotal + taxAmount;

    await client.query("BEGIN");

    const customer = await client.query(
      `SELECT id FROM customers WHERE id = $1 LIMIT 1`,
      [customerId],
    );
    if (customer.rowCount !== 1) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`invoice-number:${business.id}`]);

    const countResult = await client.query(`SELECT COUNT(*)::int AS count FROM invoices`);
    const nextNumber = Number(countResult.rows[0]?.count ?? 0) + 1;
    let invoiceNumber = `INV-${String(nextNumber).padStart(4, "0")}`;

    const duplicate = await client.query(`SELECT 1 FROM invoices WHERE invoice_number = $1 LIMIT 1`, [invoiceNumber]);
    if (duplicate.rowCount) {
      const maxResult = await client.query(`
        SELECT COALESCE(MAX(
          CASE
            WHEN invoice_number ~ '^INV-[0-9]+$'
            THEN substring(invoice_number from 5)::int
            ELSE 0
          END
        ), 0) AS max_number
        FROM invoices
      `);
      invoiceNumber = `INV-${String(Number(maxResult.rows[0].max_number) + 1).padStart(4, "0")}`;
    }

    const invoiceResult = await client.query(
      `
      INSERT INTO invoices (
        customer_id, invoice_number, issue_date, due_date, status,
        subtotal, tax_amount, total_amount, amount_paid, amount_due, notes
      )
      VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, 0, $7, $8)
      RETURNING *
      `,
      [
        customerId,
        invoiceNumber,
        body.issue_date || today(),
        body.due_date || null,
        subtotal.toFixed(2),
        taxAmount.toFixed(2),
        totalAmount.toFixed(2),
        String(body.notes ?? "").trim() || null,
      ],
    );

    const invoiceId = invoiceResult.rows[0].id;

    for (const item of normalized) {
      await client.query(
        `
        INSERT INTO invoice_items (
          invoice_id, description, quantity, unit_price,
          tax_rate, tax_amount, line_total
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          invoiceId,
          item.description,
          item.quantity.toFixed(2),
          item.unitPrice.toFixed(2),
          item.taxRate.toFixed(2),
          item.taxAmount.toFixed(2),
          item.lineTotal.toFixed(2),
        ],
      );
    }

    const invoice = await completeInvoice(client, invoiceId);
    await client.query("COMMIT");

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    if (client) {
      try { await client.query("ROLLBACK"); } catch {}
    }
    console.error("Invoice POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create invoice" },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}
