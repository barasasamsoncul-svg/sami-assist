import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toDecimal(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10000) / 10000 : fallback;
}

function nullableString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return String(value);
}

function jsonValue(value: unknown, fallback: Record<string, unknown> | unknown[] = {}) {
  if (value === undefined || value === null) {
    return fallback;
  }
  return value;
}

function calculateLineDiscount(
  quantity: number,
  unitPrice: number,
  type: string | null | undefined,
  value: number
): number {
  const gross = quantity * unitPrice;

  if (!type || value <= 0) {
    return 0;
  }

  if (type === "percentage") {
    return gross * (value / 100);
  }

  if (type === "fixed") {
    return Math.min(value, gross);
  }

  return 0;
}

function calculateLine(
  item: {
    quantity: number;
    unitPrice: number;
    discountType?: string | null;
    discountValue?: number;
    taxRate?: number;
  },
  taxMethod: string
) {
  const gross = item.quantity * item.unitPrice;

  const discountAmount = calculateLineDiscount(
    item.quantity,
    item.unitPrice,
    item.discountType,
    item.discountValue ?? 0
  );

  const net = Math.max(0, gross - discountAmount);

  const taxRate = item.taxRate ?? 0;

  let taxAmount = 0;
  let lineTotal = net;

  if (taxMethod === "inclusive") {
    if (taxRate > 0) {
      taxAmount = net - net / (1 + taxRate / 100);
    }
    lineTotal = net;
  } else {
    taxAmount = net * (taxRate / 100);
    lineTotal = net + taxAmount;
  }

  return {
    gross,
    discountAmount,
    net,
    taxAmount,
    lineTotal,
  };
}

function recalculateInvoiceTotals(invoiceId: string, client: any) {
  return client.query(
    `
      WITH item_totals AS (
        SELECT
          COALESCE(SUM(ii.line_total), 0) AS items_total,
          COALESCE(SUM(ii.discount_amount), 0) AS items_discount,
          COALESCE(SUM(ii.tax_amount), 0) AS items_tax
        FROM public.invoice_items ii
        WHERE ii.invoice_id = $1
      )
      UPDATE public.invoices i
      SET
        subtotal = (
          SELECT COALESCE(SUM(ii.quantity * ii.unit_price), 0)
          FROM public.invoice_items ii
          WHERE ii.invoice_id = i.id
        ),
        discount_amount = it.items_discount,
        tax_amount = it.items_tax,
        total_amount = it.items_total,
        amount_due = it.items_total - i.amount_paid,
        updated_at = NOW()
      FROM item_totals it
      WHERE i.id = $1
      RETURNING *
    `,
    [invoiceId]
  );
}

/*
|--------------------------------------------------------------------------
| GET /api/invoices/[id]/items
|--------------------------------------------------------------------------
|
| Returns all items for a specific invoice.
|--------------------------------------------------------------------------
*/

export async function GET(req: NextRequest, { params }: Context) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    // Verify invoice exists
    const invoiceCheck = await pool.query(
      `
        SELECT id, invoice_number, status, tax_calculation_method
        FROM public.invoices
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [id]
    );

    if (invoiceCheck.rows.length === 0) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const invoice = invoiceCheck.rows[0];

    // Get items
    const result = await pool.query(
      `
        SELECT
          ii.id,
          ii.invoice_id,
          ii.product_id,
          ii.description,
          ii.quantity,
          ii.unit_price,
          ii.discount_type,
          ii.discount_value,
          ii.discount_amount,
          ii.tax_rate,
          ii.tax_amount,
          ii.tax_rate_id,
          ii.line_total,
          ii.sort_order,
          ii.metadata,
          ii.created_at,
          ii.updated_at,

          json_build_object(
            'id', p.id,
            'name', p.name,
            'sku', p.sku,
            'unit_price', p.unit_price,
            'category', p.category,
            'is_active', p.is_active
          ) AS product,

          json_build_object(
            'id', tr.id,
            'name', tr.name,
            'rate', tr.rate,
            'tax_type', tr.tax_type
          ) AS tax_rate_details

        FROM public.invoice_items ii

        LEFT JOIN public.products p
          ON p.id = ii.product_id

        LEFT JOIN public.tax_rates tr
          ON tr.id = ii.tax_rate_id

        WHERE ii.invoice_id = $1

        ORDER BY
          ii.sort_order ASC,
          ii.created_at ASC
      `,
      [id]
    );

    // Calculate totals
    const totalsResult = await pool.query(
      `
        SELECT
          COALESCE(SUM(quantity * unit_price), 0) AS subtotal,
          COALESCE(SUM(discount_amount), 0) AS total_discount,
          COALESCE(SUM(tax_amount), 0) AS total_tax,
          COALESCE(SUM(line_total), 0) AS total
        FROM public.invoice_items
        WHERE invoice_id = $1
      `,
      [id]
    );

    const totals = totalsResult.rows[0];

    return NextResponse.json({
      success: true,
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        status: invoice.status,
        tax_calculation_method: invoice.tax_calculation_method,
      },
      items: result.rows,
      totals: {
        subtotal: toDecimal(totals.subtotal),
        total_discount: toDecimal(totals.total_discount),
        total_tax: toDecimal(totals.total_tax),
        total: toDecimal(totals.total),
        item_count: result.rows.length,
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/[id]/items:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch invoice items",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices/[id]/items
|--------------------------------------------------------------------------
|
| Adds a new item to an invoice.
|
| Request body:
| {
|   product_id?: string,
|   description: string,
|   quantity?: number,
|   unit_price?: number,
|   discount_type?: 'percentage'|'fixed',
|   discount_value?: number,
|   tax_rate?: number,
|   tax_rate_id?: string,
|   sort_order?: number,
|   metadata?: object
| }
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest, { params }: Context) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { pool } = await getTenantDatabaseForUser(user.id);

  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Invoice ID is required" },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    const body = await req.json();

    await client.query("BEGIN");

    // Verify invoice exists and is editable
    const invoiceResult = await client.query(
      `
        SELECT
          i.id,
          i.invoice_number,
          i.status,
          i.tax_calculation_method,
          i.currency,
          i.deleted_at
        FROM public.invoices i
        WHERE i.id = $1
        FOR UPDATE
      `,
      [id]
    );

    if (invoiceResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const invoice = invoiceResult.rows[0];

    // Check if invoice is deleted
    if (invoice.deleted_at) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Cannot add items to a deleted invoice" },
        { status: 409 }
      );
    }

    // Check if invoice can be edited
    const nonEditableStatuses = ["paid", "cancelled", "void"];
    if (nonEditableStatuses.includes(invoice.status)) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: `Cannot add items to a ${invoice.status} invoice`,
        },
        { status: 409 }
      );
    }

    // Validate required fields
    const description = body.description;
    if (!description || typeof description !== "string" || !description.trim()) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Item description is required" },
        { status: 400 }
      );
    }

    const quantity = toNumber(body.quantity, 1);
    if (quantity <= 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Quantity must be greater than zero" },
        { status: 400 }
      );
    }

    // Get product if provided
    let product = null;
    let unitPrice = toDecimal(body.unit_price, 0);

    if (body.product_id) {
      const productResult = await client.query(
        `
          SELECT id, name, unit_price, tax_rate_id
          FROM public.products
          WHERE id = $1 AND is_active = true
        `,
        [body.product_id]
      );

      if (productResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Product not found or inactive" },
          { status: 404 }
        );
      }

      product = productResult.rows[0];

      // Use product price if unit_price not provided
      if (body.unit_price === undefined || body.unit_price === null) {
        unitPrice = toDecimal(product.unit_price);
      }
    }

    // Validate discount
    const discountType = nullableString(body.discount_type);
    const discountValue = toDecimal(body.discount_value, 0);

    if (discountType && !["percentage", "fixed"].includes(discountType)) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "discount_type must be 'percentage' or 'fixed'" },
        { status: 400 }
      );
    }

    if (discountValue < 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "discount_value cannot be negative" },
        { status: 400 }
      );
    }

    // Get tax rate
    let taxRateId = body.tax_rate_id || product?.tax_rate_id || null;
    let taxRate = toDecimal(body.tax_rate, 0);

    if (taxRateId) {
      const taxResult = await client.query(
        `
          SELECT id, rate, is_active
          FROM public.tax_rates
          WHERE id = $1
        `,
        [taxRateId]
      );

      if (taxResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Tax rate not found" },
          { status: 404 }
        );
      }

      if (!taxResult.rows[0].is_active) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Tax rate is inactive" },
          { status: 400 }
        );
      }

      taxRate = toDecimal(taxResult.rows[0].rate);
    }

    // Calculate line totals
    const calculated = calculateLine(
      {
        quantity,
        unitPrice,
        discountType,
        discountValue,
        taxRate,
      },
      invoice.tax_calculation_method || "exclusive"
    );

    const sortOrder = toNumber(body.sort_order, 0);

    // Insert item
    const result = await client.query(
      `
        INSERT INTO public.invoice_items (
          invoice_id,
          product_id,
          description,
          quantity,
          unit_price,
          discount_type,
          discount_value,
          discount_amount,
          tax_rate,
          tax_amount,
          tax_rate_id,
          line_total,
          sort_order,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `,
      [
        id,
        body.product_id || null,
        description.trim(),
        quantity,
        unitPrice,
        discountType,
        discountValue,
        calculated.discountAmount,
        taxRate,
        calculated.taxAmount,
        taxRateId,
        calculated.lineTotal,
        sortOrder,
        jsonValue(body.metadata, {}),
      ]
    );

    const item = result.rows[0];

    // Recalculate invoice totals
    await recalculateInvoiceTotals(id, client);

    // Get updated invoice
    const updatedInvoice = await client.query(
      `
        SELECT
          id,
          invoice_number,
          status,
          subtotal,
          discount_amount,
          tax_amount,
          total_amount,
          amount_paid,
          amount_due,
          currency
        FROM public.invoices
        WHERE id = $1
      `,
      [id]
    );

    // Activity log
    await client.query(
      `
        INSERT INTO public.invoice_activity_log (
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
        "item_added",
        jsonValue({
          item_id: item.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total,
        }, {}),
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        success: true,
        item,
        invoice: updatedInvoice.rows[0],
      },
      { status: 201 }
    );
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("POST /api/invoices/[id]/items:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to add invoice item",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

/*
|--------------------------------------------------------------------------
| PATCH /api/invoices/[id]/items
|--------------------------------------------------------------------------
|
| Updates an invoice item.
|
| Query parameter: ?item_id=UUID
|
| Request body: Same as POST
|--------------------------------------------------------------------------
*/

export async function PATCH(req: NextRequest, { params }: Context) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { pool } = await getTenantDatabaseForUser(user.id);

  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Invoice ID is required" },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("item_id");

  if (!itemId) {
    return NextResponse.json(
      { error: "item_id query parameter is required" },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    const body = await req.json();

    await client.query("BEGIN");

    // Verify invoice exists and is editable
    const invoiceResult = await client.query(
      `
        SELECT
          i.id,
          i.status,
          i.tax_calculation_method,
          i.deleted_at
        FROM public.invoices i
        WHERE i.id = $1
        FOR UPDATE
      `,
      [id]
    );

    if (invoiceResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const invoice = invoiceResult.rows[0];

    if (invoice.deleted_at) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Cannot update items on a deleted invoice" },
        { status: 409 }
      );
    }

    const nonEditableStatuses = ["paid", "cancelled", "void"];
    if (nonEditableStatuses.includes(invoice.status)) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: `Cannot update items on a ${invoice.status} invoice`,
        },
        { status: 409 }
      );
    }

    // Get existing item
    const existingResult = await client.query(
      `
        SELECT *
        FROM public.invoice_items
        WHERE id = $1 AND invoice_id = $2
        FOR UPDATE
      `,
      [itemId, id]
    );

    if (existingResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Invoice item not found" },
        { status: 404 }
      );
    }

    const current = existingResult.rows[0];

    // Build update
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Description
    if (body.description !== undefined) {
      if (!body.description || typeof body.description !== "string" || !body.description.trim()) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Description cannot be empty" },
          { status: 400 }
        );
      }
      updates.push(`description = $${paramCount++}`);
      values.push(body.description.trim());
    }

    // Quantity
    if (body.quantity !== undefined) {
      const quantity = toNumber(body.quantity);
      if (quantity <= 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Quantity must be greater than zero" },
          { status: 400 }
        );
      }
      updates.push(`quantity = $${paramCount++}`);
      values.push(quantity);
    }

    // Unit Price
    if (body.unit_price !== undefined) {
      const unitPrice = toDecimal(body.unit_price);
      if (unitPrice < 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "unit_price cannot be negative" },
          { status: 400 }
        );
      }
      updates.push(`unit_price = $${paramCount++}`);
      values.push(unitPrice);
    }

    // Product ID
    if (body.product_id !== undefined) {
      if (body.product_id) {
        const productResult = await client.query(
          `
            SELECT id, name, unit_price, tax_rate_id
            FROM public.products
            WHERE id = $1 AND is_active = true
          `,
          [body.product_id]
        );

        if (productResult.rows.length === 0) {
          await client.query("ROLLBACK");

          return NextResponse.json(
            { error: "Product not found or inactive" },
            { status: 404 }
          );
        }
      }
      updates.push(`product_id = $${paramCount++}`);
      values.push(body.product_id || null);
    }

    // Discount Type
    if (body.discount_type !== undefined) {
      const discountType = nullableString(body.discount_type);
      if (discountType && !["percentage", "fixed"].includes(discountType)) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "discount_type must be 'percentage' or 'fixed'" },
          { status: 400 }
        );
      }
      updates.push(`discount_type = $${paramCount++}`);
      values.push(discountType);
    }

    // Discount Value
    if (body.discount_value !== undefined) {
      const discountValue = toDecimal(body.discount_value);
      if (discountValue < 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "discount_value cannot be negative" },
          { status: 400 }
        );
      }
      updates.push(`discount_value = $${paramCount++}`);
      values.push(discountValue);
    }

    // Tax Rate
    if (body.tax_rate !== undefined) {
      const taxRate = toDecimal(body.tax_rate);
      if (taxRate < 0 || taxRate > 100) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "tax_rate must be between 0 and 100" },
          { status: 400 }
        );
      }
      updates.push(`tax_rate = $${paramCount++}`);
      values.push(taxRate);
    }

    // Tax Rate ID
    if (body.tax_rate_id !== undefined) {
      if (body.tax_rate_id) {
        const taxResult = await client.query(
          `
            SELECT id, rate, is_active
            FROM public.tax_rates
            WHERE id = $1
          `,
          [body.tax_rate_id]
        );

        if (taxResult.rows.length === 0) {
          await client.query("ROLLBACK");

          return NextResponse.json(
            { error: "Tax rate not found" },
            { status: 404 }
          );
        }

        if (!taxResult.rows[0].is_active) {
          await client.query("ROLLBACK");

          return NextResponse.json(
            { error: "Tax rate is inactive" },
            { status: 400 }
          );
        }
      }
      updates.push(`tax_rate_id = $${paramCount++}`);
      values.push(body.tax_rate_id || null);
    }

    // Sort Order
    if (body.sort_order !== undefined) {
      const sortOrder = toNumber(body.sort_order);
      if (!Number.isInteger(sortOrder) || sortOrder < 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "sort_order must be a non-negative integer" },
          { status: 400 }
        );
      }
      updates.push(`sort_order = $${paramCount++}`);
      values.push(sortOrder);
    }

    // Metadata
    if (body.metadata !== undefined) {
      updates.push(`metadata = metadata || $${paramCount++}`);
      values.push(jsonValue(body.metadata, {}));
    }

    if (updates.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    // Get values for recalculation
    const quantity = body.quantity !== undefined ? toNumber(body.quantity) : current.quantity;
    const unitPrice = body.unit_price !== undefined ? toDecimal(body.unit_price) : current.unit_price;
    const discountType = body.discount_type !== undefined ? nullableString(body.discount_type) : current.discount_type;
    const discountValue = body.discount_value !== undefined ? toDecimal(body.discount_value) : current.discount_value;
    const taxRate = body.tax_rate !== undefined ? toDecimal(body.tax_rate) : current.tax_rate;

    // Recalculate line totals
    const calculated = calculateLine(
      {
        quantity,
        unitPrice,
        discountType,
        discountValue,
        taxRate,
      },
      invoice.tax_calculation_method || "exclusive"
    );

    // Add recalculated fields to update
    updates.push(`discount_amount = $${paramCount++}`);
    values.push(calculated.discountAmount);

    updates.push(`tax_amount = $${paramCount++}`);
    values.push(calculated.taxAmount);

    updates.push(`line_total = $${paramCount++}`);
    values.push(calculated.lineTotal);

    updates.push(`updated_at = NOW()`);
    updates.push(`id = $${paramCount}`);
    values.push(itemId);

    const result = await client.query(
      `
        UPDATE public.invoice_items
        SET ${updates.join(", ")}
        WHERE id = $${paramCount}
        RETURNING *
      `,
      values
    );

    // Recalculate invoice totals
    await recalculateInvoiceTotals(id, client);

    // Get updated invoice
    const updatedInvoice = await client.query(
      `
        SELECT
          id,
          invoice_number,
          status,
          subtotal,
          discount_amount,
          tax_amount,
          total_amount,
          amount_paid,
          amount_due,
          currency
        FROM public.invoices
        WHERE id = $1
      `,
      [id]
    );

    // Activity log
    await client.query(
      `
        INSERT INTO public.invoice_activity_log (
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
        "item_updated",
        jsonValue({
          item_id: itemId,
          previous: {
            description: current.description,
            quantity: current.quantity,
            unit_price: current.unit_price,
            line_total: current.line_total,
          },
        }, {}),
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      item: result.rows[0],
      invoice: updatedInvoice.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("PATCH /api/invoices/[id]/items:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update invoice item",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

/*
|--------------------------------------------------------------------------
| DELETE /api/invoices/[id]/items
|--------------------------------------------------------------------------
|
| Removes an item from an invoice.
|
| Query parameter: ?item_id=UUID
|--------------------------------------------------------------------------
*/

export async function DELETE(req: NextRequest, { params }: Context) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { pool } = await getTenantDatabaseForUser(user.id);

  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Invoice ID is required" },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("item_id");

  if (!itemId) {
    return NextResponse.json(
      { error: "item_id query parameter is required" },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Verify invoice exists and is editable
    const invoiceResult = await client.query(
      `
        SELECT
          i.id,
          i.status,
          i.deleted_at,
          i.invoice_number
        FROM public.invoices i
        WHERE i.id = $1
        FOR UPDATE
      `,
      [id]
    );

    if (invoiceResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const invoice = invoiceResult.rows[0];

    if (invoice.deleted_at) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Cannot delete items from a deleted invoice" },
        { status: 409 }
      );
    }

    const nonEditableStatuses = ["paid", "cancelled", "void"];
    if (nonEditableStatuses.includes(invoice.status)) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: `Cannot delete items from a ${invoice.status} invoice`,
        },
        { status: 409 }
      );
    }

    // Get item to delete
    const itemResult = await client.query(
      `
        SELECT *
        FROM public.invoice_items
        WHERE id = $1 AND invoice_id = $2
        FOR UPDATE
      `,
      [itemId, id]
    );

    if (itemResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Invoice item not found" },
        { status: 404 }
      );
    }

    const item = itemResult.rows[0];

    // Prevent deleting last item
    const countResult = await client.query(
      `
        SELECT COUNT(*) > 1 AS has_other_items
        FROM public.invoice_items
        WHERE invoice_id = $1
      `,
      [id]
    );

    if (!countResult.rows[0]?.has_other_items) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Cannot delete the last item from an invoice" },
        { status: 409 }
      );
    }

    // Delete item
    await client.query(
      `
        DELETE FROM public.invoice_items
        WHERE id = $1 AND invoice_id = $2
      `,
      [itemId, id]
    );

    // Recalculate invoice totals
    await recalculateInvoiceTotals(id, client);

    // Get updated invoice
    const updatedInvoice = await client.query(
      `
        SELECT
          id,
          invoice_number,
          status,
          subtotal,
          discount_amount,
          tax_amount,
          total_amount,
          amount_paid,
          amount_due,
          currency
        FROM public.invoices
        WHERE id = $1
      `,
      [id]
    );

    // Activity log
    await client.query(
      `
        INSERT INTO public.invoice_activity_log (
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
        "item_removed",
        jsonValue({
          item_id: itemId,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total,
        }, {}),
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Item removed successfully",
      invoice: updatedInvoice.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("DELETE /api/invoices/[id]/items:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to remove invoice item",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}