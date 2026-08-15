import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = {
  params: Promise<{ id: string }>;
};

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

export async function GET(
  req: NextRequest,
  context: Context
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);
    const { id } = await context.params;

    const client = await pool.connect();
    try {
      const invoice = await completeInvoice(client, id);
      if (!invoice) {
        return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      }
      return NextResponse.json({ invoice });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Invoice GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load invoice" },
      { status: 500 },
    );
  }
}