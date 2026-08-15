import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type RawItem = {
  description?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
  tax_rate?: unknown;
  discount_type?: "percentage" | "fixed" | null;
  discount_value?: unknown;
  product_id?: string | null;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeItems(items: RawItem[]) {
  return items.map((item) => {
    const description = String(item.description ?? "").trim();
    const quantity = toNumber(item.quantity);
    const unitPrice = toNumber(item.unit_price);
    const taxRate = toNumber(item.tax_rate);
    const discountType = item.discount_type || null;
    const discountValue = toNumber(item.discount_value);
    const productId = item.product_id || null;

    if (!description) {
      throw new Error("Every invoice item needs a description.");
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Quantity must be greater than zero.");
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error("Unit price cannot be negative.");
    }

    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      throw new Error("Tax rate must be between 0 and 100.");
    }

    if (discountValue < 0) {
      throw new Error("Discount cannot be negative.");
    }

    const grossAmount = quantity * unitPrice;

    let discountAmount = 0;

    if (discountType === "percentage") {
      if (discountValue > 100) {
        throw new Error("Percentage discount cannot exceed 100%.");
      }

      discountAmount = (grossAmount * discountValue) / 100;
    } else if (discountType === "fixed") {
      discountAmount = discountValue;

      if (discountAmount > grossAmount) {
        discountAmount = grossAmount;
      }
    }

    const taxableAmount = Math.max(0, grossAmount - discountAmount);
    const taxAmount = taxableAmount * (taxRate / 100);
    const lineTotal = taxableAmount + taxAmount;

    return {
      description,
      quantity,
      unitPrice,
      taxRate,
      discountType,
      discountValue,
      discountAmount,
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
        'website', c.website,
        'billing_address', c.billing_address,
        'shipping_address', c.shipping_address,
        'tax_id', c.tax_id,
        'tax_id_type', c.tax_id_type,
        'registration_number', c.registration_number,
        'currency', c.currency,
        'customer_type', c.customer_type,
        'industry', c.industry
      ) AS customer,

      COALESCE(
        (
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
              'product_id', ii.product_id,
              'sort_order', ii.sort_order
            )
            ORDER BY ii.sort_order ASC, ii.created_at ASC
          )
          FROM invoice_items ii
          WHERE ii.invoice_id = i.id
        ),
        '[]'::json
      ) AS invoice_items,

      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', p.id,
              'amount', p.amount,
              'currency', p.currency,
              'exchange_rate', p.exchange_rate,
              'payment_method', p.payment_method,
              'payment_method_details', p.payment_method_details,
              'transaction_reference', p.transaction_reference,
              'payment_date', p.payment_date,
              'status', p.status,
              'reconciled', p.reconciled,
              'reconciled_at', p.reconciled_at,
              'notes', p.notes
            )
            ORDER BY p.payment_date DESC
          )
          FROM payments p
          WHERE p.invoice_id = i.id
        ),
        '[]'::json
      ) AS payments

    FROM invoices i
    INNER JOIN customers c ON c.id = i.customer_id
    WHERE i.id = $1
    LIMIT 1
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

// GET /api/invoices
export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

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
          'website', c.website,
          'billing_address', c.billing_address,
          'shipping_address', c.shipping_address,
          'tax_id', c.tax_id,
          'tax_id_type', c.tax_id_type,
          'registration_number', c.registration_number,
          'currency', c.currency,
          'customer_type', c.customer_type,
          'industry', c.industry
        ) AS customer

      FROM invoices i
      INNER JOIN customers c
        ON c.id = i.customer_id

      ORDER BY i.created_at DESC
    `);

    return NextResponse.json({
      invoices: result.rows,
    });
  } catch (error) {
    console.error("Invoices GET error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load invoices",
      },
      { status: 500 },
    );
  }
}

// POST /api/invoices
export async function POST(req: Request) {
  let client: any = null;

  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await req.json();

    const customerId = String(
      body.customer_id ?? "",
    ).trim();

    const items = Array.isArray(body.items)
      ? (body.items as RawItem[])
      : [];

    const {
      due_date,
      issue_date,
      notes,
      internal_notes,
      po_number,
      currency = "USD",
      payment_terms_id,
      discount_type,
      discount_value,
      tax_calculation_method = "exclusive",
      shipping_cost = 0,
      shipping_tax = 0,
    } = body;

    if (!customerId) {
      return NextResponse.json(
        { error: "Customer is required" },
        { status: 400 },
      );
    }

    if (!items.length) {
      return NextResponse.json(
        {
          error:
            "At least one invoice item is required",
        },
        { status: 400 },
      );
    }

    if (
      discount_type &&
      discount_type !== "percentage" &&
      discount_type !== "fixed"
    ) {
      return NextResponse.json(
        {
          error:
            "Invoice discount type must be percentage or fixed.",
        },
        { status: 400 },
      );
    }

    const invoiceDiscountValue = toNumber(
      discount_value,
    );

    if (invoiceDiscountValue < 0) {
      return NextResponse.json(
        {
          error: "Invoice discount cannot be negative.",
        },
        { status: 400 },
      );
    }

    if (
      discount_type === "percentage" &&
      invoiceDiscountValue > 100
    ) {
      return NextResponse.json(
        {
          error:
            "Invoice percentage discount cannot exceed 100%.",
        },
        { status: 400 },
      );
    }

    const shippingCost = toNumber(shipping_cost);
    const shippingTax = toNumber(shipping_tax);

    if (shippingCost < 0 || shippingTax < 0) {
      return NextResponse.json(
        {
          error:
            "Shipping cost and shipping tax cannot be negative.",
        },
        { status: 400 },
      );
    }

    const { pool, business } =
      await getTenantDatabaseForUser(user.id);

    client = await pool.connect();

    const normalized = normalizeItems(items);

    /*
     * ---------------------------------------------------------
     * CALCULATE ITEM TOTALS
     * ---------------------------------------------------------
     */

    let subtotal = 0;
    let lineDiscountTotal = 0;
    let lineTaxTotal = 0;

    for (const item of normalized) {
      subtotal += item.quantity * item.unitPrice;
      lineDiscountTotal += item.discountAmount;
      lineTaxTotal += item.taxAmount;
    }

    /*
     * ---------------------------------------------------------
     * INVOICE-LEVEL DISCOUNT
     * ---------------------------------------------------------
     *
     * Important:
     * The invoice discount is calculated AFTER line discounts.
     * This prevents the discount from being applied twice.
     */

    const subtotalAfterLineDiscount =
      Math.max(
        0,
        subtotal - lineDiscountTotal,
      );

    let invoiceDiscountAmount = 0;

    if (discount_type === "percentage") {
      invoiceDiscountAmount =
        (subtotalAfterLineDiscount *
          invoiceDiscountValue) /
        100;
    } else if (discount_type === "fixed") {
      invoiceDiscountAmount = Math.min(
        invoiceDiscountValue,
        subtotalAfterLineDiscount,
      );
    }

    const taxableSubtotal =
      Math.max(
        0,
        subtotalAfterLineDiscount -
          invoiceDiscountAmount,
      );

    /*
     * ---------------------------------------------------------
     * TAX CALCULATION
     * ---------------------------------------------------------
     *
     * Line tax is calculated from each item's own tax rate.
     *
     * The invoice-level discount reduces the taxable subtotal.
     * We allocate the invoice discount proportionally across
     * taxable lines when calculating the final tax.
     */

    let finalTaxAmount = lineTaxTotal;

    if (
      subtotalAfterLineDiscount > 0 &&
      invoiceDiscountAmount > 0
    ) {
      const discountRatio =
        invoiceDiscountAmount /
        subtotalAfterLineDiscount;

      const taxReduction =
        lineTaxTotal * discountRatio;

      finalTaxAmount = Math.max(
        0,
        lineTaxTotal - taxReduction,
      );
    }

    /*
     * Inclusive tax:
     *
     * The API currently stores tax_amount separately and
     * expects total_amount to include it. For exclusive tax,
     * tax is added to the taxable subtotal.
     *
     * For inclusive tax, the supplied line calculations already
     * contain tax in line_total, so avoid adding it twice.
     */

    let totalBeforeShipping: number;

    if (
      tax_calculation_method === "inclusive"
    ) {
      totalBeforeShipping =
        taxableSubtotal;
    } else {
      totalBeforeShipping =
        taxableSubtotal +
        finalTaxAmount;
    }

    const grandTotal =
      Math.max(
        0,
        totalBeforeShipping +
          shippingCost +
          shippingTax,
      );

    /*
     * ---------------------------------------------------------
     * TRANSACTION
     * ---------------------------------------------------------
     */

    await client.query("BEGIN");

    /*
     * Verify customer.
     */

    const customerResult =
      await client.query(
        `
        SELECT id
        FROM customers
        WHERE id = $1
        LIMIT 1
        `,
        [customerId],
      );

    if (customerResult.rowCount !== 1) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    /*
     * ---------------------------------------------------------
     * GENERATE INVOICE NUMBER
     * ---------------------------------------------------------
     */

    await client.query(
      `
      SELECT pg_advisory_xact_lock(
        hashtext($1)
      )
      `,
      [`invoice-number:${business.id}`],
    );

    /*
     * Prefer invoice_settings when available.
     */

    const settingsResult =
      await client.query(`
        SELECT
          invoice_prefix,
          invoice_next_number,
          invoice_number_padding,
          invoice_number_format
        FROM invoice_settings
        ORDER BY created_at ASC
        LIMIT 1
      `);

    let invoiceNumber: string;

    if (settingsResult.rows.length > 0) {
      const settings =
        settingsResult.rows[0];

      const prefix =
        settings.invoice_prefix || "INV-";

      let nextNumber =
        Number(
          settings.invoice_next_number || 1,
        );

      const padding =
        Number(
          settings.invoice_number_padding || 6,
        );

      const format =
        settings.invoice_number_format ||
        "{prefix}{number}";

      invoiceNumber =
        format
          .replace(
            "{prefix}",
            prefix,
          )
          .replace(
            "{number}",
            String(nextNumber).padStart(
              padding,
              "0",
            ),
          );

      /*
       * Make absolutely sure the generated number
       * is unique.
       */

      let exists = await client.query(
        `
        SELECT 1
        FROM invoices
        WHERE invoice_number = $1
        LIMIT 1
        `,
        [invoiceNumber],
      );

      while (exists.rowCount) {
        nextNumber++;

        invoiceNumber =
          format
            .replace(
              "{prefix}",
              prefix,
            )
            .replace(
              "{number}",
              String(nextNumber).padStart(
                padding,
                "0",
              ),
            );

        exists = await client.query(
          `
          SELECT 1
          FROM invoices
          WHERE invoice_number = $1
          LIMIT 1
          `,
          [invoiceNumber],
        );
      }

      await client.query(
        `
        UPDATE invoice_settings
        SET invoice_next_number = $1
        WHERE id = $2
        `,
        [
          nextNumber + 1,
          settingsResult.rows[0].id,
        ],
      );
    } else {
      /*
       * Fallback for tenants without settings.
       */

      const maxResult =
        await client.query(`
          SELECT COALESCE(
            MAX(
              CASE
                WHEN invoice_number ~ '^INV-[0-9]+$'
                THEN substring(
                  invoice_number
                  FROM 5
                )::int
                ELSE 0
              END
            ),
            0
          ) AS max_number
          FROM invoices
        `);

      const nextNumber =
        Number(
          maxResult.rows[0]?.max_number ?? 0,
        ) + 1;

      invoiceNumber =
        `INV-${String(nextNumber).padStart(
          6,
          "0",
        )}`;
    }

    /*
     * ---------------------------------------------------------
     * PAYMENT TERMS
     * ---------------------------------------------------------
     */

    let paymentTermsDisplay:
      | string
      | null = null;

    if (payment_terms_id) {
      const termsResult =
        await client.query(
          `
          SELECT name
          FROM payment_terms
          WHERE id = $1
          LIMIT 1
          `,
          [payment_terms_id],
        );

      if (termsResult.rows.length > 0) {
        paymentTermsDisplay =
          termsResult.rows[0].name;
      }
    }

    /*
     * ---------------------------------------------------------
     * INSERT INVOICE
     * ---------------------------------------------------------
     */

    const invoiceResult =
      await client.query(
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
          shipping_cost,
          shipping_tax,
          total_amount,
          amount_paid,
          amount_due,
          notes,
          internal_notes,
          status,
          created_by
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          0,
          $18,
          $19,
          $20,
          'draft',
          $21
        )

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
          invoiceDiscountValue,
          invoiceDiscountAmount,

          tax_calculation_method ||
            "exclusive",

          finalTaxAmount,

          /*
           * subtotal is the original subtotal
           * before invoice-level discount.
           */
          subtotal,

          shippingCost,
          shippingTax,

          grandTotal,

          /*
           * amount_due initially equals total.
           */
          grandTotal,

          notes || null,
          internal_notes || null,

          user.id,
        ],
      );

    const invoiceId =
      invoiceResult.rows[0].id;

    /*
     * ---------------------------------------------------------
     * INSERT INVOICE ITEMS
     * ---------------------------------------------------------
     */

    for (
      let i = 0;
      i < normalized.length;
      i++
    ) {
      const item =
        normalized[i];

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

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12
        )
        `,
        [
          invoiceId,
          item.description,
          item.quantity,
          item.unitPrice,
          item.taxRate,

          item.discountType,

          /*
           * Store the original discount value here.
           *
           * Example:
           * 10% discount → discount_value = 10
           * KSh 500 fixed → discount_value = 500
           */
          item.discountValue,

          /*
           * Store the actual monetary discount here.
           */
          item.discountAmount,

          item.taxAmount,
          item.lineTotal,
          i,
          item.productId,
        ],
      );
    }

    /*
     * ---------------------------------------------------------
     * ACTIVITY LOG
     * ---------------------------------------------------------
     */

    await client.query(
      `
      INSERT INTO invoice_activity_log (
        invoice_id,
        user_id,
        action,
        details
      )
      VALUES (
        $1,
        $2,
        'created',
        $3::jsonb
      )
      `,
      [
        invoiceId,
        user.id,
        JSON.stringify({
          invoice_number:
            invoiceNumber,
          customer_id:
            customerId,
          total_amount:
            grandTotal,
        }),
      ],
    );

    /*
     * ---------------------------------------------------------
     * RETURN COMPLETE INVOICE
     * ---------------------------------------------------------
     */

    const invoice =
      await completeInvoice(
        client,
        invoiceId,
      );

    await client.query("COMMIT");

    return NextResponse.json(
      { invoice },
      { status: 201 },
    );
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }

    console.error(
      "Invoice POST error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create invoice",
      },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}
