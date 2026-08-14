import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type RawItem = {
  description?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
  tax_rate?: unknown;
  discount_type?: 'percentage' | 'fixed' | null;
  discount_value?: unknown;
  product_id?: string | null;
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
    const discountType = item.discount_type || null;
    const discountValue = Number(item.discount_value ?? 0);
    const productId = item.product_id || null;

    if (!description) throw new Error("Every invoice item needs a description.");
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantity must be greater than zero.");
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("Unit price cannot be negative.");
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new Error("Tax rate must be between 0 and 100.");

    // Calculate discount
    let discountAmount = 0;
    if (discountType === 'percentage') {
      discountAmount = (unitPrice * quantity * discountValue) / 100;
    } else if (discountType === 'fixed') {
      discountAmount = discountValue;
    }

    const lineTotalBeforeTax = (unitPrice * quantity) - discountAmount;
    const taxAmount = lineTotalBeforeTax * (taxRate / 100);
    const lineTotal = lineTotalBeforeTax + taxAmount;

    return {
      description,
      quantity,
      unitPrice,
      taxRate,
      discountType,
      discountValue: discountAmount,
      taxAmount,
      lineTotal,
      productId,
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
        'billing_address', c.billing_address,
        'shipping_address', c.shipping_address,
        'tax_id', c.tax_id
      ) AS customer,
      COALESCE((
        SELECT json_agg(
          json_build_object(
            'id', ii.id,
            'description', ii.description,
            'quantity', ii.quantity,
            'unit_price', ii.unit_price,
            'tax_rate', ii.tax_rate,
            'discount_type', ii.discount_type,
            'discount_value', ii.discount_value,
            'discount_amount', ii.discount_amount,
            'tax_amount', ii.tax_amount,
            'line_total', ii.line_total,
            'product_id', ii.product_id
          )
          ORDER BY ii.sort_order ASC
        )
        FROM invoice_items ii
        WHERE ii.invoice_id = i.id
      ), '[]'::json) AS invoice_items,
      COALESCE((
        SELECT json_agg(
          json_build_object(
            'id', p.id,
            'amount', p.amount,
            'currency', p.currency,
            'payment_method', p.payment_method,
            'transaction_reference', p.transaction_reference,
            'payment_date', p.payment_date,
            'status', p.status,
            'notes', p.notes,
            'reconciled', p.reconciled
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

// GET: List all invoices
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
          'billing_address', c.billing_address,
          'shipping_address', c.shipping_address,
          'tax_id', c.tax_id
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

// POST: Create a new invoice
export async function POST(req: Request) {
  let client: any = null;

  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const customerId = String(body.customer_id ?? "").trim();
    const items = Array.isArray(body.items) ? body.items as RawItem[] : [];
    const {
      due_date,
      issue_date,
      notes,
      po_number,
      currency = 'USD',
      payment_terms_id,
      discount_type,
      discount_value,
      tax_calculation_method = 'exclusive',
    } = body;

    if (!customerId) return NextResponse.json({ error: "Customer is required" }, { status: 400 });
    if (!items.length) return NextResponse.json({ error: "At least one invoice item is required" }, { status: 400 });

    const { pool, business } = await getTenantDatabaseForUser(user.id);
    client = await pool.connect();

    const normalized = normalizeItems(items);
    
    // Calculate totals
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;
    let totalAmount = 0;

    for (const item of normalized) {
      const itemSubtotal = item.quantity * item.unitPrice;
      subtotal += itemSubtotal;
      totalDiscount += item.discountValue;
      totalTax += item.taxAmount;
      totalAmount += item.lineTotal;
    }

    // Apply invoice-level discount
    let invoiceDiscountAmount = 0;
    if (discount_type === 'percentage') {
      invoiceDiscountAmount = (subtotal * Number(discount_value || 0)) / 100;
    } else if (discount_type === 'fixed') {
      invoiceDiscountAmount = Number(discount_value || 0);
    }

    const totalAfterDiscount = subtotal - totalDiscount - invoiceDiscountAmount;
    const grandTotal = totalAfterDiscount + totalTax;

    await client.query("BEGIN");

    // Verify customer exists
    const customer = await client.query(
      `SELECT id FROM customers WHERE id = $1 LIMIT 1`,
      [customerId],
    );
    if (customer.rowCount !== 1) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    // Generate invoice number
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

    // Get payment terms display
    let paymentTermsDisplay = null;
    if (payment_terms_id) {
      const termsResult = await client.query(
        `SELECT name FROM payment_terms WHERE id = $1`,
        [payment_terms_id]
      );
      if (termsResult.rows.length > 0) {
        paymentTermsDisplay = termsResult.rows[0].name;
      }
    }

    // Insert invoice
    const invoiceResult = await client.query(
      `
      INSERT INTO invoices (
        customer_id,
        invoice_number,
        issue_date,
        due_date,
        po_number,
        currency,
        payment_terms_id,
        payment_terms_display,
        discount_type,
        discount_value,
        discount_amount,
        tax_calculation_method,
        tax_amount,
        subtotal,
        total_amount,
        amount_due,
        notes,
        status,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'draft', $18)
      RETURNING *
      `,
      [
        customerId,
        invoiceNumber,
        issue_date || today(),
        due_date || null,
        po_number || null,
        currency,
        payment_terms_id || null,
        paymentTermsDisplay,
        discount_type || null,
        Number(discount_value || 0),
        invoiceDiscountAmount,
        tax_calculation_method || 'exclusive',
        totalTax,
        subtotal - totalDiscount - invoiceDiscountAmount,
        grandTotal,
        grandTotal, // amount_due initially equals total_amount
        notes || null,
        user.id,
      ],
    );

    const invoiceId = invoiceResult.rows[0].id;

    // Insert invoice items
    for (let i = 0; i < normalized.length; i++) {
      const item = normalized[i];
      await client.query(
        `
        INSERT INTO invoice_items (
          invoice_id,
          description,
          quantity,
          unit_price,
          tax_rate,
          discount_type,
          discount_value,
          discount_amount,
          tax_amount,
          line_total,
          sort_order,
          product_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
        [
          invoiceId,
          item.description,
          item.quantity,
          item.unitPrice,
          item.taxRate,
          item.discountType,
          item.discountValue,
          item.discountValue,
          item.taxAmount,
          item.lineTotal,
          i,
          item.productId,
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