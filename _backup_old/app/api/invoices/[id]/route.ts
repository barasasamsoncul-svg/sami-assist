import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

/*
|--------------------------------------------------------------------------
| Types
|--------------------------------------------------------------------------
*/

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
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

function calculateDiscount(subtotal: number, type: string | null | undefined, value: number): number {
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

function getFiscalYear(date: Date): number {
  return date.getMonth() >= 6 ? date.getFullYear() + 1 : date.getFullYear();
}

function getFiscalPeriod(date: Date): number {
  // July = 1, August = 2, ..., June = 12
  return ((date.getMonth() - 6 + 12) % 12) + 1;
}

/*
|--------------------------------------------------------------------------
| GET /api/invoices/[id]
|--------------------------------------------------------------------------
|
| Returns:
| - Invoice
| - Customer
| - Items
| - Payments
| - Credit notes
| - Reminders
| - Activity
| - Status history
| - Events
|--------------------------------------------------------------------------
*/

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const invoiceResult = await pool.query(
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
            'credit_limit', c.credit_limit,
            'customer_type', c.customer_type,
            'industry', c.industry,
            'status', c.status
          ) AS customer,

          (
            SELECT row_to_json(t)
            FROM (
              SELECT
                pt.id,
                pt.name,
                pt.description,
                pt.due_days,
                pt.discount_percentage,
                pt.discount_days
              FROM public.payment_terms pt
              WHERE pt.id = i.payment_terms_id
            ) t
          ) AS payment_terms,

          (
            SELECT row_to_json(t)
            FROM (
              SELECT
                it.id,
                it.name,
                it.is_default,
                it.primary_color,
                it.secondary_color,
                it.logo_url,
                it.font_family,
                it.show_payment_instructions,
                it.show_bank_details,
                it.show_tax_breakdown,
                it.show_discount,
                it.show_shipping,
                it.show_po_number,
                it.header_text,
                it.footer_text,
                it.payment_instructions,
                it.bank_details,
                it.terms_and_conditions
              FROM public.invoice_templates it
              WHERE it.id = i.template_id
            ) t
          ) AS template,

          (
            SELECT row_to_json(s)
            FROM (
              SELECT
                s.company_name,
                s.company_logo_url,
                s.company_address,
                s.company_email,
                s.company_phone,
                s.company_tax_id,
                s.company_website,
                s.brand_primary_color,
                s.brand_secondary_color,
                s.brand_accent_color,
                s.invoice_font_family
              FROM public.invoice_settings s
              LIMIT 1
            ) s
          ) AS company_settings

        FROM public.invoices i

        INNER JOIN public.customers c
          ON c.id = i.customer_id

        WHERE i.id = $1
          AND i.deleted_at IS NULL
      `,
      [id]
    );

    if ((invoiceResult.rowCount ?? 0) === 0) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const invoice = invoiceResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Items
    |--------------------------------------------------------------------------
    */

    const itemsResult = await pool.query(
      `
        SELECT
          ii.*,

          CASE
            WHEN p.id IS NULL THEN NULL
            ELSE json_build_object(
              'id', p.id,
              'name', p.name,
              'sku', p.sku,
              'description', p.description,
              'unit_price', p.unit_price,
              'category', p.category,
              'is_active', p.is_active
            )
          END AS product,

          CASE
            WHEN tr.id IS NULL THEN NULL
            ELSE json_build_object(
              'id', tr.id,
              'name', tr.name,
              'rate', tr.rate,
              'tax_type', tr.tax_type
            )
          END AS tax_rate_details

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

    /*
    |--------------------------------------------------------------------------
    | Payments
    |--------------------------------------------------------------------------
    */

    const paymentsResult = await pool.query(
      `
        SELECT *
        FROM public.payments
        WHERE invoice_id = $1
        ORDER BY payment_date DESC
      `,
      [id]
    );

    /*
    |--------------------------------------------------------------------------
    | Payment Allocations
    |--------------------------------------------------------------------------
    */

    const allocationsResult = await pool.query(
      `
        SELECT
          pa.*,
          ii.description AS item_description
        FROM public.payment_allocations pa
        LEFT JOIN public.invoice_items ii
          ON ii.id = pa.invoice_item_id
        WHERE pa.payment_id IN (
          SELECT id FROM public.payments WHERE invoice_id = $1
        )
        ORDER BY pa.created_at DESC
      `,
      [id]
    );

    /*
    |--------------------------------------------------------------------------
    | Credit notes
    |--------------------------------------------------------------------------
    */

    const creditNotesResult = await pool.query(
      `
        SELECT *
        FROM public.credit_notes
        WHERE invoice_id = $1
        ORDER BY issue_date DESC
      `,
      [id]
    );

    /*
    |--------------------------------------------------------------------------
    | Reminders
    |--------------------------------------------------------------------------
    */

    const remindersResult = await pool.query(
      `
        SELECT *
        FROM public.invoice_reminders
        WHERE invoice_id = $1
        ORDER BY scheduled_at DESC NULLS LAST, created_at DESC
      `,
      [id]
    );

    /*
    |--------------------------------------------------------------------------
    | Activity
    |--------------------------------------------------------------------------
    */

    const activityResult = await pool.query(
      `
        SELECT *
        FROM public.invoice_activity_log
        WHERE invoice_id = $1
        ORDER BY created_at DESC
      `,
      [id]
    );

    /*
    |--------------------------------------------------------------------------
    | Status History
    |--------------------------------------------------------------------------
    */

    const statusHistoryResult = await pool.query(
      `
        SELECT *
        FROM public.invoice_status_history
        WHERE invoice_id = $1
        ORDER BY changed_at DESC
      `,
      [id]
    );

    /*
    |--------------------------------------------------------------------------
    | Events
    |--------------------------------------------------------------------------
    */

    const eventsResult = await pool.query(
      `
        SELECT *
        FROM public.invoice_events
        WHERE invoice_id = $1
        ORDER BY created_at DESC
      `,
      [id]
    );

    return NextResponse.json({
      success: true,
      invoice: {
        ...invoice,
        items: itemsResult.rows,
        payments: paymentsResult.rows,
        payment_allocations: allocationsResult.rows,
        credit_notes: creditNotesResult.rows,
        reminders: remindersResult.rows,
        activity: activityResult.rows,
        status_history: statusHistoryResult.rows,
        events: eventsResult.rows,
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/[id]:", error);

    return NextResponse.json(
      { error: "Failed to fetch invoice" },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| PATCH /api/invoices/[id]
|--------------------------------------------------------------------------
|
| Updates invoice information.
|
| If `items` is provided, existing items are
| replaced inside the same transaction.
|--------------------------------------------------------------------------
*/

export async function PATCH(req: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json(
      { error: "Invoice ID is required" },
      { status: 400 }
    );
  }

  const { pool } = await getTenantDatabaseForUser(user.id);

  const client = await pool.connect();

  try {
    const body = await req.json();

    await client.query("BEGIN");

    /*
    |--------------------------------------------------------------------------
    | Existing invoice
    |--------------------------------------------------------------------------
    */

    const existingResult = await client.query(
      `
        SELECT *
        FROM public.invoices
        WHERE id = $1
        FOR UPDATE
      `,
      [id]
    );

    if ((existingResult.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const existing = existingResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Prevent modification of finalized invoices
    |--------------------------------------------------------------------------
    */

    const finalizedStatuses = ["paid", "cancelled", "void"];

    if (
      finalizedStatuses.includes(existing.status) &&
      body.status !== "cancelled" &&
      body.status !== "void"
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: "This invoice cannot be edited because it is finalized.",
        },
        { status: 409 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Basic invoice fields
    |--------------------------------------------------------------------------
    */

    const customerId = body.customer_id ?? existing.customer_id;

    const issueDate = body.issue_date ?? existing.issue_date;
    const issueDateObj = new Date(issueDate);

    const dueDate = body.due_date ?? existing.due_date;

    const currency = body.currency ?? existing.currency;

    const exchangeRate = toDecimal(body.exchange_rate ?? existing.exchange_rate, 1);

    const taxMethod = body.tax_calculation_method ?? existing.tax_calculation_method ?? "exclusive";

    const discountType = body.discount_type !== undefined
      ? nullableString(body.discount_type)
      : existing.discount_type;

    const discountValue = body.discount_value !== undefined
      ? toDecimal(body.discount_value)
      : toDecimal(existing.discount_value);

    const shippingCost = body.shipping_cost !== undefined
      ? toDecimal(body.shipping_cost)
      : toDecimal(existing.shipping_cost);

    const roundingAdjustment = body.rounding_adjustment !== undefined
      ? toDecimal(body.rounding_adjustment)
      : toDecimal(existing.rounding_adjustment ?? 0);

    /*
    |--------------------------------------------------------------------------
    | Customer validation
    |--------------------------------------------------------------------------
    */

    const customerResult = await client.query(
      `
        SELECT
          id,
          currency,
          payment_terms_id
        FROM public.customers
        WHERE id = $1
          AND status != 'blocked'
          AND deleted_at IS NULL
      `,
      [customerId]
    );

    if ((customerResult.rowCount ?? 0) === 0) {
      throw new Error("Customer not found or blocked");
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
    | Recalculate items only if provided
    |--------------------------------------------------------------------------
    */

    let subtotal = toDecimal(existing.subtotal);
    let discountAmount = toDecimal(existing.discount_amount);
    let taxAmount = toDecimal(existing.tax_amount);
    let shippingTax = toDecimal(existing.shipping_tax);
    let totalAmount = toDecimal(existing.total_amount);

    if (Array.isArray(body.items)) {
      if (body.items.length === 0) {
        throw new Error("Invoice must contain at least one item");
      }

      /*
      |--------------------------------------------------------------------------
      | Delete old items
      |--------------------------------------------------------------------------
      */

      await client.query(
        `
          DELETE FROM public.invoice_items
          WHERE invoice_id = $1
        `,
        [id]
      );

      subtotal = 0;
      discountAmount = 0;
      taxAmount = 0;

      /*
      |--------------------------------------------------------------------------
      | Create new items
      |--------------------------------------------------------------------------
      */

      for (let index = 0; index < body.items.length; index++) {
        const item = body.items[index];

        let product = null;

        if (item.product_id) {
          const productResult = await client.query(
            `
              SELECT
                id,
                name,
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

        const quantity = toNumber(item.quantity, 1);

        if (quantity <= 0) {
          throw new Error(`Invalid quantity for item ${index + 1}`);
        }

        const unitPrice = toDecimal(item.unit_price ?? product?.unit_price, 0);

        const itemDiscountType = nullableString(item.discount_type);
        const itemDiscountValue = toDecimal(item.discount_value);

        const taxRateId = item.tax_rate_id ?? product?.tax_rate_id ?? null;

        let taxRate = toNumber(item.tax_rate);

        if (taxRateId) {
          const taxResult = await client.query(
            `
              SELECT rate
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
        discountAmount += calculated.discountAmount;
        taxAmount += calculated.taxAmount;

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
            id,
            item.product_id ?? product?.id ?? null,
            item.description || product?.name || "Item",
            quantity,
            unitPrice,
            itemDiscountType,
            itemDiscountValue,
            calculated.discountAmount,
            taxRate,
            calculated.taxAmount,
            taxRateId,
            calculated.lineTotal,
            Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : index,
            item.metadata ?? {},
          ]
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Invoice-level discount
      |--------------------------------------------------------------------------
      */

      const subtotalAfterLineDiscount = Math.max(0, subtotal - discountAmount);

      const invoiceDiscount = calculateDiscount(
        subtotalAfterLineDiscount,
        discountType,
        discountValue
      );

      discountAmount = invoiceDiscount;

      /*
      |--------------------------------------------------------------------------
      | Shipping tax
      |--------------------------------------------------------------------------
      */

      const shippingTaxRate = toNumber(body.shipping_tax_rate);
      shippingTax = shippingCost * (shippingTaxRate / 100);

      /*
      |--------------------------------------------------------------------------
      | Total with rounding
      |--------------------------------------------------------------------------
      */

      let calculatedTotal = 0;

      if (taxMethod === "inclusive") {
        calculatedTotal = Math.max(0, subtotalAfterLineDiscount - invoiceDiscount) + shippingCost;
      } else {
        calculatedTotal = Math.max(0, subtotalAfterLineDiscount - invoiceDiscount) +
          taxAmount +
          shippingCost +
          shippingTax;
      }

      totalAmount = Number(calculatedTotal.toFixed(4));
      const roundedTotal = totalAmount + roundingAdjustment;
      const finalRoundedTotal = Number(roundedTotal.toFixed(4));

      // Store both for reference
    }

    /*
    |--------------------------------------------------------------------------
    | Payment balance
    |--------------------------------------------------------------------------
    |
    | Never trust amount_paid from the client.
    | Recalculate it from completed payments.
    |--------------------------------------------------------------------------
    */

    const paymentResult = await client.query(
      `
        SELECT COALESCE(SUM(amount), 0) AS amount_paid
        FROM public.payments
        WHERE invoice_id = $1
          AND status = 'completed'
      `,
      [id]
    );

    const amountPaid = toDecimal(paymentResult.rows[0]?.amount_paid);
    const amountDue = Math.max(0, totalAmount - amountPaid);

    /*
    |--------------------------------------------------------------------------
    | Status
    |--------------------------------------------------------------------------
    */

    let status = body.status ?? existing.status;

    if (body.status === undefined) {
      if (amountPaid >= totalAmount && totalAmount > 0) {
        status = "paid";
      } else if (amountPaid > 0) {
        status = "partially_paid";
      } else if (
        dueDate &&
        new Date(dueDate) < new Date() &&
        !["draft", "cancelled", "void"].includes(existing.status)
      ) {
        status = "overdue";
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Cancellation
    |--------------------------------------------------------------------------
    */

    let cancelledBy = existing.cancelled_by;
    let cancelledReason = existing.cancelled_reason;

    if (status === "cancelled" && existing.status !== "cancelled") {
      cancelledBy = user.id;
      cancelledReason = body.cancelled_reason || body.reason || existing.cancelled_reason || null;
    }

    /*
    |--------------------------------------------------------------------------
    | Update invoice
    |--------------------------------------------------------------------------
    */

    const updatedResult = await client.query(
      `
        UPDATE public.invoices

        SET
          customer_id = $1,

          issue_date = $2,
          due_date = $3,

          status = $4,

          subtotal = $5,

          discount_type = $6,
          discount_value = $7,
          discount_amount = $8,

          tax_calculation_method = $9,
          tax_amount = $10,

          shipping_cost = $11,
          shipping_tax = $12,

          rounding_adjustment = $13,
          rounded_total = $14,

          total_amount = $15,
          amount_paid = $16,
          amount_due = $17,

          po_number = $18,
          currency = $19,
          exchange_rate = $20,

          fiscal_year = $21,
          fiscal_period = $22,

          payment_terms_id = COALESCE($23, payment_terms_id),
          payment_terms_display = COALESCE($24, payment_terms_display),

          template_id = COALESCE($25, template_id),

          cancelled_by = $26,
          cancelled_reason = $27,

          notes = $28,
          internal_notes = $29,
          footer_text = $30,

          attachments = $31,
          metadata = $32,

          payment_date = CASE
            WHEN $16 >= $15 THEN COALESCE(
              (
                SELECT MAX(payment_date)::DATE
                FROM public.payments
                WHERE invoice_id = $34
                  AND status = 'completed'
              ),
              payment_date,
              CURRENT_DATE
            )
            ELSE NULL
          END,

          updated_at = NOW()

        WHERE id = $34

        RETURNING *
      `,
      [
        customerId,

        issueDate,
        dueDate,

        status,

        Math.max(0, subtotal - discountAmount),

        discountType,
        discountValue,
        discountAmount,

        taxMethod,
        taxAmount,

        shippingCost,
        shippingTax,

        roundingAdjustment,
        totalAmount + roundingAdjustment,

        totalAmount,
        amountPaid,
        amountDue,

        nullableString(body.po_number ?? existing.po_number),

        currency,
        exchangeRate,

        fiscalYear,
        fiscalPeriod,

        body.payment_terms_id ?? null,

        body.payment_terms_display ?? null,

        body.template_id ?? null,

        cancelledBy,
        cancelledReason,

        nullableString(body.notes ?? existing.notes),

        nullableString(body.internal_notes ?? existing.internal_notes),

        nullableString(body.footer_text ?? existing.footer_text),

        body.attachments ?? existing.attachments ?? [],

        body.metadata ?? existing.metadata ?? {},

        id, // For the payment_date subquery
      ]
    );

    const updatedInvoice = updatedResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Status History
    |--------------------------------------------------------------------------
    */

    if (status !== existing.status) {
      await client.query(
        `
          INSERT INTO public.invoice_status_history (
            invoice_id,
            from_status,
            to_status,
            changed_by,
            reason
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          id,
          existing.status,
          status,
          user.id,
          body.status_reason || null,
        ]
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Activity action
    |--------------------------------------------------------------------------
    */

    let action = "updated";
    let actionDetails: Record<string, unknown> = {
      previous_status: existing.status,
      new_status: status,
      amount_paid: amountPaid,
      amount_due: amountDue,
      total_amount: totalAmount,
      items_replaced: Array.isArray(body.items),
    };

    if (status === "cancelled") {
      action = "cancelled";
      actionDetails.reason = cancelledReason;
    } else if (status === "void") {
      action = "voided";
      actionDetails.reason = body.reason || "Invoice voided";
    } else if (status === "sent" && existing.status !== "sent") {
      action = "sent";
    }

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
        action,
        actionDetails,
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
        VALUES ($1, $2, $3)
      `,
      [
        id,
        status !== existing.status ? 'status_changed' : 'updated',
        {
          invoice_id: id,
          invoice_number: updatedInvoice.invoice_number,
          previous_status: existing.status,
          new_status: status,
          customer_id: updatedInvoice.customer_id,
          total_amount: updatedInvoice.total_amount,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
      ]
    );

    await client.query("COMMIT");

    /*
    |--------------------------------------------------------------------------
    | Return updated invoice
    |--------------------------------------------------------------------------
    */

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
            'billing_address', c.billing_address,
            'shipping_address', c.shipping_address,
            'tax_id', c.tax_id
          ) AS customer,

          COALESCE(
            (
              SELECT json_agg(ii ORDER BY ii.sort_order)
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
                'changed_by', sh.changed_by
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
      [id]
    );

    return NextResponse.json({
      success: true,
      invoice: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("PATCH /api/invoices/[id]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update invoice",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

/*
|--------------------------------------------------------------------------
| DELETE /api/invoices/[id]
|--------------------------------------------------------------------------
|
| We do NOT physically delete invoices.
|
| Invoices are financial records. DELETE therefore
| performs a VOID operation.
|--------------------------------------------------------------------------
*/

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const { pool } = await getTenantDatabaseForUser(user.id);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const invoiceResult = await client.query(
        `
          SELECT *
          FROM public.invoices
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if ((invoiceResult.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Invoice not found" },
          { status: 404 }
        );
      }

      const invoice = invoiceResult.rows[0];

      if (invoice.status === "paid") {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error: "A paid invoice cannot be voided. Create a credit note instead.",
          },
          { status: 409 }
        );
      }

      if (invoice.status === "void") {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Invoice is already voided" },
          { status: 409 }
        );
      }

      const reason = body.reason || "Invoice voided";

      const updatedResult = await client.query(
        `
          UPDATE public.invoices

          SET
            status = 'void',

            cancelled_by = $1,
            cancelled_reason = $2,

            deleted_at = NOW(),
            deleted_by = $1,

            updated_at = NOW()

          WHERE id = $3

          RETURNING *
        `,
        [user.id, reason, id]
      );

      /*
      |--------------------------------------------------------------------------
      | Status History
      |--------------------------------------------------------------------------
      */

      await client.query(
        `
          INSERT INTO public.invoice_status_history (
            invoice_id,
            from_status,
            to_status,
            changed_by,
            reason
          )
          VALUES ($1, $2, 'void', $3, $4)
        `,
        [id, invoice.status, user.id, reason]
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
          VALUES ($1, $2, $3, 'voided', $4)
        `,
        [
          id,
          user.id,
          user.fullName || user.email,
          {
            reason,
            previous_status: invoice.status,
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
          VALUES ($1, 'voided', $2)
        `,
        [
          id,
          {
            invoice_id: id,
            invoice_number: invoice.invoice_number,
            previous_status: invoice.status,
            reason: reason,
            voided_by: user.id,
            voided_at: new Date().toISOString(),
          },
        ]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        message: "Invoice voided successfully",
        invoice: updatedResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("DELETE /api/invoices/[id]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to void invoice",
      },
      { status: 500 }
    );
  }
}