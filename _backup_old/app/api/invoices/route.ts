import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

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

function jsonValue(
  value: unknown,
  fallback: Record<string, unknown> | unknown[] = {}
) {
  if (value === undefined || value === null) {
    return fallback;
  }
  return value;
}

function calculateDiscount(
  subtotal: number,
  type: string | null | undefined,
  value: number
): number {
  if (!type || value <= 0) {
    return 0;
  }

  if (type === "percentage") {
    return subtotal * (value / 100);
  }

  if (type === "fixed") {
    return Math.min(value, subtotal);
  }

  return 0;
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
    taxAmount = net - net / (1 + taxRate / 100);
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

function buildInvoiceNumber(
  prefix: string,
  number: number,
  padding: number,
  format: string,
  date: Date = new Date()
) {
  const padded = String(number).padStart(padding, "0");

  let result = format
    .replaceAll("{prefix}", prefix)
    .replaceAll("{number}", padded)
    .replaceAll("{year}", String(date.getFullYear()))
    .replaceAll("{month}", String(date.getMonth() + 1).padStart(2, "0"))
    .replaceAll("{day}", String(date.getDate()).padStart(2, "0"));

  // Fiscal year (July to June)
  const fiscalYear = date.getMonth() >= 6 
    ? date.getFullYear() + 1 
    : date.getFullYear();
  result = result.replaceAll("{fiscal_year}", String(fiscalYear));

  return result;
}

function getFiscalYear(date: Date): number {
  return date.getMonth() >= 6 ? date.getFullYear() + 1 : date.getFullYear();
}

function getFiscalPeriod(date: Date): number {
  // July = 1, August = 2, ..., June = 12
  return ((date.getMonth() - 6 + 12) % 12) + 1;
}

/*
|--------------------------------------------------------------------------
| GET /api/invoices
|--------------------------------------------------------------------------
|
| Supports:
|
| ?page=1
| ?limit=20
| ?status=paid
| ?customer_id=...
| ?search=...
| ?from_date=...
| ?to_date=...
| ?sort=created_at
| ?order=desc
| ?include_deleted=false
|
|--------------------------------------------------------------------------
*/

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const { searchParams } = new URL(req.url);

    const page = Math.max(1, toNumber(searchParams.get("page"), 1));
    const limit = Math.min(100, Math.max(1, toNumber(searchParams.get("limit"), 20)));
    const offset = (page - 1) * limit;

    const status = searchParams.get("status");
    const customerId = searchParams.get("customer_id");
    const search = searchParams.get("search");
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date");
    const includeDeleted = searchParams.get("include_deleted") === "true";
    const fiscalYear = searchParams.get("fiscal_year");
    const fiscalPeriod = searchParams.get("fiscal_period");
    const currency = searchParams.get("currency");
    const minAmount = searchParams.get("min_amount");
    const maxAmount = searchParams.get("max_amount");

    const sortParam = searchParams.get("sort") || "created_at";
    const orderParam = searchParams.get("order") || "desc";

    const allowedSorts = new Set([
      "created_at",
      "updated_at",
      "issue_date",
      "due_date",
      "invoice_number",
      "total_amount",
      "amount_due",
      "status",
      "payment_date",
    ]);

    const sort = allowedSorts.has(sortParam) ? sortParam : "created_at";
    const order = orderParam.toLowerCase() === "asc" ? "ASC" : "DESC";

    const conditions: string[] = [];
    const values: unknown[] = [];

    let parameter = 1;

    // Only show non-deleted by default
    if (!includeDeleted) {
      conditions.push(`i.deleted_at IS NULL`);
    }

    if (status) {
      conditions.push(`i.status = $${parameter++}`);
      values.push(status);
    }

    if (customerId) {
      conditions.push(`i.customer_id = $${parameter++}`);
      values.push(customerId);
    }

    if (search) {
      conditions.push(`
        (
          i.invoice_number ILIKE $${parameter}
          OR c.company_name ILIKE $${parameter}
          OR c.contact_name ILIKE $${parameter}
          OR c.email ILIKE $${parameter}
        )
      `);
      values.push(`%${search}%`);
      parameter++;
    }

    if (fromDate) {
      conditions.push(`i.issue_date >= $${parameter++}`);
      values.push(fromDate);
    }

    if (toDate) {
      conditions.push(`i.issue_date <= $${parameter++}`);
      values.push(toDate);
    }

    if (fiscalYear) {
      conditions.push(`i.fiscal_year = $${parameter++}`);
      values.push(Number(fiscalYear));
    }

    if (fiscalPeriod) {
      conditions.push(`i.fiscal_period = $${parameter++}`);
      values.push(Number(fiscalPeriod));
    }

    if (currency) {
      conditions.push(`i.currency = $${parameter++}`);
      values.push(currency);
    }

    if (minAmount) {
      conditions.push(`i.total_amount >= $${parameter++}`);
      values.push(Number(minAmount));
    }

    if (maxAmount) {
      conditions.push(`i.total_amount <= $${parameter++}`);
      values.push(Number(maxAmount));
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM public.invoices i
        INNER JOIN public.customers c
          ON c.id = i.customer_id
        ${where}
      `,
      values
    );

    const total = countResult.rows[0]?.count ?? 0;

    const dataValues = [...values, limit, offset];

    const invoicesResult = await pool.query(
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
            'tax_id', c.tax_id,
            'currency', c.currency
          ) AS customer,

          (
            SELECT COUNT(*)
            FROM public.invoice_items ii
            WHERE ii.invoice_id = i.id
          )::int AS item_count,

          (
            SELECT COUNT(*)
            FROM public.payments p
            WHERE p.invoice_id = i.id
            AND p.status = 'completed'
          )::int AS payment_count,

          (
            SELECT COALESCE(SUM(amount), 0)
            FROM public.payments p
            WHERE p.invoice_id = i.id
            AND p.status = 'completed'
          )::numeric AS total_paid

        FROM public.invoices i

        INNER JOIN public.customers c
          ON c.id = i.customer_id

        ${where}

        ORDER BY i.${sort} ${order}

        LIMIT $${parameter}
        OFFSET $${parameter + 1}
      `,
      dataValues
    );

    return NextResponse.json({
      success: true,
      invoices: invoicesResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/invoices:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch invoices",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices
|--------------------------------------------------------------------------
|
| Creates:
|
| 1. Invoice
| 2. Invoice line items
| 3. Activity log
| 4. Status history entry
|
| Everything happens inside ONE transaction.
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { pool } = await getTenantDatabaseForUser(user.id);

  const client = await pool.connect();

  try {
    const body = await req.json();

    /*
    |--------------------------------------------------------------------------
    | Required fields
    |--------------------------------------------------------------------------
    */

    if (!body.customer_id) {
      return NextResponse.json(
        {
          error: "customer_id is required",
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        {
          error: "At least one invoice item is required",
        },
        { status: 400 }
      );
    }

    await client.query("BEGIN");

    /*
    |--------------------------------------------------------------------------
    | Customer
    |--------------------------------------------------------------------------
    */

    const customerResult = await client.query(
      `
        SELECT
          id,
          currency,
          payment_terms_id,
          credit_limit
        FROM public.customers
        WHERE id = $1
        AND status != 'blocked'
        AND deleted_at IS NULL
      `,
      [body.customer_id]
    );

    if ((customerResult.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: "Customer not found or blocked",
        },
        { status: 404 }
      );
    }

    const customer = customerResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Settings
    |--------------------------------------------------------------------------
    */

    const settingsResult = await client.query(
      `
        SELECT *
        FROM public.invoice_settings
        ORDER BY created_at ASC
        LIMIT 1
      `
    );

    const settings = settingsResult.rows[0] || {};

    /*
    |--------------------------------------------------------------------------
    | Invoice values
    |--------------------------------------------------------------------------
    */

    const currency = body.currency || customer.currency || settings.default_currency || "KES";

    const taxMethod = body.tax_calculation_method || settings.default_tax_calculation || "exclusive";

    const discountType = nullableString(body.discount_type);
    const discountValue = toDecimal(body.discount_value);
    const shippingCost = toDecimal(body.shipping_cost);

    /*
    |--------------------------------------------------------------------------
    | Process line items
    |--------------------------------------------------------------------------
    */

    const processedItems: Array<{
      productId: string | null;
      description: string;
      quantity: number;
      unitPrice: number;
      discountType: string | null;
      discountValue: number;
      discountAmount: number;
      taxRate: number;
      taxRateId: string | null;
      taxAmount: number;
      lineTotal: number;
      sortOrder: number;
      metadata: unknown;
    }> = [];

    let subtotal = 0;
    let lineDiscountTotal = 0;
    let lineTaxTotal = 0;

    for (let index = 0; index < body.items.length; index++) {
      const item = body.items[index];

      let product = null;

      if (item.product_id) {
        const productResult = await client.query(
          `
            SELECT
              id,
              name,
              description,
              unit_price,
              tax_rate_id
            FROM public.products
            WHERE id = $1
            AND is_active = true
          `,
          [item.product_id]
        );

        if ((productResult.rowCount ?? 0) === 0) {
          throw new Error(`Product ${item.product_id} not found or inactive`);
        }

        product = productResult.rows[0];
      }

      const description = item.description || product?.name || "Item";

      const quantity = toNumber(item.quantity, 1);

      if (quantity <= 0) {
        throw new Error(`Invalid quantity for item ${index + 1}`);
      }

      const unitPrice = toDecimal(item.unit_price ?? product?.unit_price, 0);

      const itemDiscountType = nullableString(item.discount_type);
      const itemDiscountValue = toDecimal(item.discount_value);

      let taxRateId = item.tax_rate_id ?? product?.tax_rate_id ?? null;

      let taxRate = toNumber(item.tax_rate);

      // If a tax_rate_id was supplied, use the actual tax rate from the database
      if (taxRateId) {
        const taxResult = await client.query(
          `
            SELECT
              id,
              rate
            FROM public.tax_rates
            WHERE id = $1
            AND is_active = true
          `,
          [taxRateId]
        );

        if ((taxResult.rowCount ?? 0) === 0) {
          throw new Error(`Tax rate ${taxRateId} not found or inactive`);
        }

        taxRate = toNumber(taxResult.rows[0].rate);
      }

      const calculated = calculateLine(
        {
          quantity,
          unitPrice,
          discountType: itemDiscountType,
          discountValue: itemDiscountValue,
          taxRate,
        },
        taxMethod
      );

      subtotal += calculated.gross;
      lineDiscountTotal += calculated.discountAmount;
      lineTaxTotal += calculated.taxAmount;

      processedItems.push({
        productId: item.product_id ?? product?.id ?? null,
        description,
        quantity,
        unitPrice,
        discountType: itemDiscountType,
        discountValue: itemDiscountValue,
        discountAmount: calculated.discountAmount,
        taxRate,
        taxRateId,
        taxAmount: calculated.taxAmount,
        lineTotal: calculated.lineTotal,
        sortOrder: Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : index,
        metadata: jsonValue(item.metadata, {}),
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Invoice-level discount
    |--------------------------------------------------------------------------
    */

    const subtotalAfterLineDiscount = Math.max(0, subtotal - lineDiscountTotal);

    const invoiceDiscount = calculateDiscount(
      subtotalAfterLineDiscount,
      discountType,
      discountValue
    );

    /*
    |--------------------------------------------------------------------------
    | Tax
    |--------------------------------------------------------------------------
    */

    let taxAmount = lineTaxTotal;

    // For invoice-level discount, recalculate tax proportionally
    if (invoiceDiscount > 0 && subtotalAfterLineDiscount > 0) {
      const taxReduction = lineTaxTotal * (invoiceDiscount / subtotalAfterLineDiscount);
      taxAmount = Math.max(0, lineTaxTotal - taxReduction);
    }

    /*
    |--------------------------------------------------------------------------
    | Shipping tax
    |--------------------------------------------------------------------------
    */

    const shippingTaxRate = toNumber(body.shipping_tax_rate);
    const shippingTax = shippingCost * (shippingTaxRate / 100);

    /*
    |--------------------------------------------------------------------------
    | Rounding adjustment
    |--------------------------------------------------------------------------
    */

    const roundingAdjustment = toDecimal(body.rounding_adjustment, 0);

    /*
    |--------------------------------------------------------------------------
    | Totals
    |--------------------------------------------------------------------------
    */

    let totalAmount = 0;

    if (taxMethod === "inclusive") {
      totalAmount = Math.max(0, subtotalAfterLineDiscount - invoiceDiscount) + shippingCost;
    } else {
      totalAmount = Math.max(0, subtotalAfterLineDiscount - invoiceDiscount) +
        taxAmount +
        shippingCost +
        shippingTax;
    }

    // Apply rounding adjustment
    const roundedTotal = totalAmount + roundingAdjustment;
    totalAmount = Number(totalAmount.toFixed(4));
    const finalRoundedTotal = Number(roundedTotal.toFixed(4));

    /*
    |--------------------------------------------------------------------------
    | Dates
    |--------------------------------------------------------------------------
    */

    const issueDate = body.issue_date || new Date().toISOString().slice(0, 10);
    const issueDateObj = new Date(issueDate);

    let dueDate = body.due_date || null;

    /*
    |--------------------------------------------------------------------------
    | Payment terms
    |--------------------------------------------------------------------------
    */

    const paymentTermsId = body.payment_terms_id ||
      customer.payment_terms_id ||
      settings.default_payment_terms_id ||
      null;

    let paymentTermsDisplay = body.payment_terms_display || null;

    if (paymentTermsId) {
      const paymentTermsResult = await client.query(
        `
          SELECT
            id,
            name,
            due_days
          FROM public.payment_terms
          WHERE id = $1
          AND is_active = true
        `,
        [paymentTermsId]
      );

      if ((paymentTermsResult.rowCount ?? 0) > 0) {
        const terms = paymentTermsResult.rows[0];
        paymentTermsDisplay = terms.name;

        if (!body.due_date) {
          const date = new Date(`${issueDate}T00:00:00Z`);
          date.setUTCDate(date.getUTCDate() + Number(terms.due_days || 0));
          dueDate = date.toISOString().slice(0, 10);
        }
      }
    }

    // If still no due date, use default_due_days
    if (!dueDate) {
      const defaultDueDays = toNumber(settings.default_due_days, 30);
      const date = new Date(`${issueDate}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + defaultDueDays);
      dueDate = date.toISOString().slice(0, 10);
    }

    /*
    |--------------------------------------------------------------------------
    | Fiscal year and period
    |--------------------------------------------------------------------------
    */

    const fiscalYear = getFiscalYear(issueDateObj);
    const fiscalPeriod = getFiscalPeriod(issueDateObj);

    /*
    |--------------------------------------------------------------------------
    | Invoice status
    |--------------------------------------------------------------------------
    */

    const status = body.status || (settings.require_approval ? "pending_approval" : "draft");

    /*
    |--------------------------------------------------------------------------
    | Generate invoice number
    |--------------------------------------------------------------------------
    */

    let invoiceNumber = body.invoice_number || null;

    if (!invoiceNumber) {
      const settingsLock = await client.query(
        `
          SELECT
            id,
            invoice_prefix,
            invoice_next_number,
            invoice_number_padding,
            invoice_number_format,
            invoice_sequence_reset_frequency,
            invoice_sequence_last_reset
          FROM public.invoice_settings
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE
        `
      );

      const lockedSettings = settingsLock.rows[0];

      if (!lockedSettings) {
        throw new Error("Invoice settings not found");
      }

      let nextNumber = Number(lockedSettings.invoice_next_number || 1);

      // Check if sequence should be reset
      const resetFreq = lockedSettings.invoice_sequence_reset_frequency || 'never';
      const lastReset = lockedSettings.invoice_sequence_last_reset;
      const currentDate = new Date();
      let shouldReset = false;

      if (resetFreq !== 'never') {
        if (resetFreq === 'yearly' && (!lastReset || new Date(lastReset).getFullYear() !== currentDate.getFullYear())) {
          shouldReset = true;
        } else if (resetFreq === 'quarterly' && (!lastReset || 
          Math.floor((new Date(lastReset).getMonth()) / 3) !== Math.floor(currentDate.getMonth() / 3) ||
          new Date(lastReset).getFullYear() !== currentDate.getFullYear())) {
          shouldReset = true;
        } else if (resetFreq === 'monthly' && (!lastReset ||
          new Date(lastReset).getMonth() !== currentDate.getMonth() ||
          new Date(lastReset).getFullYear() !== currentDate.getFullYear())) {
          shouldReset = true;
        }
      }

      if (shouldReset) {
        nextNumber = 1;
        await client.query(
          `
            UPDATE public.invoice_settings
            SET
              invoice_next_number = 2,
              invoice_sequence_last_reset = $1,
              updated_at = NOW()
            WHERE id = $2
          `,
          [currentDate.toISOString().slice(0, 10), lockedSettings.id]
        );
      }

      invoiceNumber = buildInvoiceNumber(
        lockedSettings.invoice_prefix || "INV-",
        nextNumber,
        Number(lockedSettings.invoice_number_padding || 6),
        lockedSettings.invoice_number_format || "{prefix}{number}",
        issueDateObj
      );

      if (!shouldReset) {
        await client.query(
          `
            UPDATE public.invoice_settings
            SET
              invoice_next_number = $1,
              updated_at = NOW()
            WHERE id = $2
          `,
          [nextNumber + 1, lockedSettings.id]
        );
      }
    }

    // Make sure invoice number is unique
    const existingNumber = await client.query(
      `
        SELECT id
        FROM public.invoices
        WHERE invoice_number = $1
      `,
      [invoiceNumber]
    );

    if ((existingNumber.rowCount ?? 0) > 0) {
      throw new Error(`Invoice number ${invoiceNumber} already exists`);
    }

    /*
    |--------------------------------------------------------------------------
    | Create invoice
    |--------------------------------------------------------------------------
    */

    const invoiceResult = await client.query(
      `
        INSERT INTO public.invoices (
          customer_id,
          invoice_number,
          issue_date,
          due_date,
          status,
          subtotal,
          discount_type,
          discount_value,
          discount_amount,
          tax_calculation_method,
          tax_amount,
          shipping_cost,
          shipping_tax,
          rounding_adjustment,
          rounded_total,
          total_amount,
          amount_paid,
          amount_due,
          po_number,
          currency,
          exchange_rate,
          payment_terms_id,
          payment_terms_display,
          fiscal_year,
          fiscal_period,
          template_id,
          created_by,
          notes,
          internal_notes,
          footer_text,
          attachments,
          metadata
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, 0, $16,
          $17, $18, $19,
          $20, $21,
          $22, $23,
          $24,
          $25,
          $26, $27, $28,
          $29, $30
        )
        RETURNING *
      `,
      [
        body.customer_id,
        invoiceNumber,
        issueDate,
        dueDate,
        status,
        subtotalAfterLineDiscount,
        discountType,
        discountValue,
        invoiceDiscount,
        taxMethod,
        taxAmount,
        shippingCost,
        shippingTax,
        roundingAdjustment,
        finalRoundedTotal,
        totalAmount,
        nullableString(body.po_number),
        currency,
        toNumber(body.exchange_rate, 1),
        paymentTermsId,
        paymentTermsDisplay,
        fiscalYear,
        fiscalPeriod,
        body.template_id || settings.default_template_id || null,
        user.id,
        nullableString(body.notes),
        nullableString(body.internal_notes),
        nullableString(body.footer_text),
        jsonValue(body.attachments, []),
        jsonValue(body.metadata, {}),
      ]
    );

    const invoice = invoiceResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Create invoice items
    |--------------------------------------------------------------------------
    */

    for (const item of processedItems) {
      await client.query(
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
          VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14
          )
        `,
        [
          invoice.id,
          item.productId,
          item.description,
          item.quantity,
          item.unitPrice,
          item.discountType,
          item.discountValue,
          item.discountAmount,
          item.taxRate,
          item.taxAmount,
          item.taxRateId,
          item.lineTotal,
          item.sortOrder,
          item.metadata,
        ]
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Status history
    |--------------------------------------------------------------------------
    */

    await client.query(
      `
        INSERT INTO public.invoice_status_history (
          invoice_id,
          to_status,
          changed_by,
          reason
        )
        VALUES (
          $1, $2, $3, $4
        )
      `,
      [
        invoice.id,
        status,
        user.id,
        'Invoice created',
      ]
    );

    /*
    |--------------------------------------------------------------------------
    | Activity log
    |--------------------------------------------------------------------------
    */

    await client.query(
      `
        INSERT INTO public.invoice_activity_log (
          invoice_id,
          user_id,
          user_name,
          action,
          details
        )
        VALUES (
          $1, $2, $3, 'created', $4
        )
      `,
      [
        invoice.id,
        user.id,
        user.fullName || user.email,
        {
          invoice_number: invoice.invoice_number,
          status: invoice.status,
          total_amount: invoice.total_amount,
          item_count: processedItems.length,
        },
      ]
    );

    /*
    |--------------------------------------------------------------------------
    | Create event for webhooks
    |--------------------------------------------------------------------------
    */

    await client.query(
      `
        INSERT INTO public.invoice_events (
          invoice_id,
          event_type,
          payload
        )
        VALUES (
          $1, 'created', $2
        )
      `,
      [
        invoice.id,
        {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          customer_id: invoice.customer_id,
          total_amount: invoice.total_amount,
          status: invoice.status,
          created_by: user.id,
          created_at: invoice.created_at,
        },
      ]
    );

    await client.query("COMMIT");

    /*
    |--------------------------------------------------------------------------
    | Return complete invoice with items
    |--------------------------------------------------------------------------
    */

    const completeResult = await pool.query(
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
            'tax_id', c.tax_id,
            'currency', c.currency,
            'credit_limit', c.credit_limit
          ) AS customer,

          COALESCE(
            (
              SELECT json_agg(
                ii
                ORDER BY ii.sort_order ASC
              )
              FROM public.invoice_items ii
              WHERE ii.invoice_id = i.id
            ),
            '[]'::json
          ) AS items,

          (
            SELECT json_agg(
              json_build_object(
                'status', sh.to_status,
                'changed_at', sh.changed_at,
                'changed_by', sh.changed_by,
                'reason', sh.reason
              )
              ORDER BY sh.changed_at DESC
            )
            FROM public.invoice_status_history sh
            WHERE sh.invoice_id = i.id
          ) AS status_history

        FROM public.invoices i

        INNER JOIN public.customers c
          ON c.id = i.customer_id

        WHERE i.id = $1
      `,
      [invoice.id]
    );

    return NextResponse.json(
      {
        success: true,
        invoice: completeResult.rows[0],
      },
      { status: 201 }
    );
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("POST /api/invoices:", error);

    const message = error instanceof Error ? error.message : "Failed to create invoice";

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}