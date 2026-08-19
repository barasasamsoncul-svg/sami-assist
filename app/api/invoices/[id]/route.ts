import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

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

function toNumber(
  value: unknown,
  fallback = 0
): number {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function nullableString(
  value: unknown
): string | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  return String(value);
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
  const gross =
    item.quantity *
    item.unitPrice;

  let discountAmount = 0;

  if (
    item.discountType ===
    "percentage"
  ) {
    discountAmount =
      gross *
      ((item.discountValue ?? 0) /
        100);
  } else if (
    item.discountType === "fixed"
  ) {
    discountAmount =
      Math.min(
        item.discountValue ?? 0,
        gross
      );
  }

  const net =
    Math.max(
      0,
      gross - discountAmount
    );

  const taxRate =
    item.taxRate ?? 0;

  let taxAmount = 0;
  let lineTotal = net;

  if (
    taxMethod === "inclusive"
  ) {
    if (taxRate > 0) {
      taxAmount =
        net -
        net /
          (1 + taxRate / 100);
    }

    lineTotal = net;
  } else {
    taxAmount =
      net *
      (taxRate / 100);

    lineTotal =
      net + taxAmount;
  }

  return {
    gross,
    discountAmount,
    net,
    taxAmount,
    lineTotal,
  };
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
|--------------------------------------------------------------------------
*/

export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const user =
      await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error:
            "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const { id } =
      await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Invoice ID is required",
        },
        {
          status: 400,
        }
      );
    }

    const { pool } =
      await getTenantDatabaseForUser(
        user.id
      );

    const invoiceResult =
      await pool.query(
        `
          SELECT
            i.*,

            json_build_object(
              'id', c.id,
              'company_name',
                c.company_name,
              'contact_name',
                c.contact_name,
              'email',
                c.email,
              'phone',
                c.phone,
              'website',
                c.website,
              'billing_address',
                c.billing_address,
              'shipping_address',
                c.shipping_address,
              'tax_id',
                c.tax_id,
              'tax_id_type',
                c.tax_id_type,
              'registration_number',
                c.registration_number,
              'currency',
                c.currency,
              'credit_limit',
                c.credit_limit,
              'customer_type',
                c.customer_type,
              'industry',
                c.industry,
              'status',
                c.status
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
                WHERE pt.id =
                  i.payment_terms_id
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
                WHERE it.id =
                  i.template_id
              ) t
            ) AS template

          FROM public.invoices i

          INNER JOIN public.customers c
            ON c.id = i.customer_id

          WHERE i.id = $1
        `,
        [id]
      );

    if (
      (invoiceResult.rowCount ?? 0) ===
      0
    ) {
      return NextResponse.json(
        {
          error:
            "Invoice not found",
        },
        {
          status: 404,
        }
      );
    }

    const invoice =
      invoiceResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Items
    |--------------------------------------------------------------------------
    */

    const itemsResult =
      await pool.query(
        `
          SELECT
            ii.*,

            CASE
              WHEN p.id IS NULL
              THEN NULL
              ELSE json_build_object(
                'id', p.id,
                'name', p.name,
                'sku', p.sku,
                'description',
                  p.description,
                'unit_price',
                  p.unit_price,
                'category',
                  p.category,
                'is_active',
                  p.is_active
              )
            END AS product,

            CASE
              WHEN tr.id IS NULL
              THEN NULL
              ELSE json_build_object(
                'id', tr.id,
                'name', tr.name,
                'rate', tr.rate,
                'tax_type',
                  tr.tax_type
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

    const paymentsResult =
      await pool.query(
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
    | Credit notes
    |--------------------------------------------------------------------------
    */

    const creditNotesResult =
      await pool.query(
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

    const remindersResult =
      await pool.query(
        `
          SELECT *
          FROM public.invoice_reminders
          WHERE invoice_id = $1
          ORDER BY
            scheduled_at DESC NULLS LAST,
            created_at DESC
        `,
        [id]
      );

    /*
    |--------------------------------------------------------------------------
    | Activity
    |--------------------------------------------------------------------------
    */

    const activityResult =
      await pool.query(
        `
          SELECT *
          FROM public.invoice_activity_log
          WHERE invoice_id = $1
          ORDER BY created_at DESC
        `,
        [id]
      );

    return NextResponse.json({
      success: true,

      invoice: {
        ...invoice,

        items:
          itemsResult.rows,

        payments:
          paymentsResult.rows,

        credit_notes:
          creditNotesResult.rows,

        reminders:
          remindersResult.rows,

        activity:
          activityResult.rows,
      },
    });
  } catch (error) {
    console.error(
      "GET /api/invoices/[id]:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to fetch invoice",
      },
      {
        status: 500,
      }
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

export async function PATCH(
  req: NextRequest,
  context: RouteContext
) {
  const user =
    await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Unauthorized",
      },
      {
        status: 401,
      }
    );
  }

  const { id } =
    await context.params;

  if (!id) {
    return NextResponse.json(
      {
        error:
          "Invoice ID is required",
      },
      {
        status: 400,
      }
    );
  }

  const { pool } =
    await getTenantDatabaseForUser(
      user.id
    );

  const client =
    await pool.connect();

  try {
    const body =
      await req.json();

    await client.query(
      "BEGIN"
    );

    /*
    |--------------------------------------------------------------------------
    | Existing invoice
    |--------------------------------------------------------------------------
    */

    const existingResult =
      await client.query(
        `
          SELECT *
          FROM public.invoices
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

    if (
      (existingResult.rowCount ?? 0) ===
      0
    ) {
      await client.query(
        "ROLLBACK"
      );

      return NextResponse.json(
        {
          error:
            "Invoice not found",
        },
        {
          status: 404,
        }
      );
    }

    const existing =
      existingResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Prevent modification of finalized invoices
    |--------------------------------------------------------------------------
    */

    const finalizedStatuses = [
      "paid",
      "cancelled",
      "void",
    ];

    if (
      finalizedStatuses.includes(
        existing.status
      ) &&
      body.status !== "cancelled" &&
      body.status !== "void"
    ) {
      await client.query(
        "ROLLBACK"
      );

      return NextResponse.json(
        {
          error:
            "This invoice cannot be edited because it is finalized.",
        },
        {
          status: 409,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Basic invoice fields
    |--------------------------------------------------------------------------
    */

    const customerId =
      body.customer_id ??
      existing.customer_id;

    const issueDate =
      body.issue_date ??
      existing.issue_date;

    const dueDate =
      body.due_date ??
      existing.due_date;

    const currency =
      body.currency ??
      existing.currency;

    const exchangeRate =
      toNumber(
        body.exchange_rate ??
          existing.exchange_rate,
        1
      );

    const taxMethod =
      body.tax_calculation_method ??
      existing.tax_calculation_method ??
      "exclusive";

    const discountType =
      body.discount_type !==
      undefined
        ? nullableString(
            body.discount_type
          )
        : existing.discount_type;

    const discountValue =
      body.discount_value !==
      undefined
        ? toNumber(
            body.discount_value
          )
        : toNumber(
            existing.discount_value
          );

    const shippingCost =
      body.shipping_cost !==
      undefined
        ? toNumber(
            body.shipping_cost
          )
        : toNumber(
            existing.shipping_cost
          );

    /*
    |--------------------------------------------------------------------------
    | Customer validation
    |--------------------------------------------------------------------------
    */

    const customerResult =
      await client.query(
        `
          SELECT
            id,
            currency,
            payment_terms_id
          FROM public.customers
          WHERE id = $1
          AND status != 'blocked'
        `,
        [customerId]
      );

    if (
      (customerResult.rowCount ?? 0) ===
      0
    ) {
      throw new Error(
        "Customer not found or blocked"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Recalculate items only if provided
    |--------------------------------------------------------------------------
    */

    let subtotal =
      toNumber(
        existing.subtotal
      );

    let discountAmount =
      toNumber(
        existing.discount_amount
      );

    let taxAmount =
      toNumber(
        existing.tax_amount
      );

    let shippingTax =
      toNumber(
        existing.shipping_tax
      );

    let totalAmount =
      toNumber(
        existing.total_amount
      );

    if (
      Array.isArray(
        body.items
      )
    ) {
      if (
        body.items.length === 0
      ) {
        throw new Error(
          "Invoice must contain at least one item"
        );
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

      for (
        let index = 0;
        index < body.items.length;
        index++
      ) {
        const item =
          body.items[index];

        let product = null;

        if (
          item.product_id
        ) {
          const productResult =
            await client.query(
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
              [
                item.product_id,
              ]
            );

          if (
            (productResult.rowCount ??
              0) === 0
          ) {
            throw new Error(
              `Product ${item.product_id} not found or inactive`
            );
          }

          product =
            productResult.rows[0];
        }

        const quantity =
          toNumber(
            item.quantity,
            1
          );

        if (
          quantity <= 0
        ) {
          throw new Error(
            `Invalid quantity for item ${index + 1}`
          );
        }

        const unitPrice =
          toNumber(
            item.unit_price ??
              product?.unit_price,
            0
          );

        const itemDiscountType =
          nullableString(
            item.discount_type
          );

        const itemDiscountValue =
          toNumber(
            item.discount_value
          );

        const taxRateId =
          item.tax_rate_id ??
          product?.tax_rate_id ??
          null;

        let taxRate =
          toNumber(
            item.tax_rate
          );

        if (
          taxRateId
        ) {
          const taxResult =
            await client.query(
              `
                SELECT
                  rate
                FROM public.tax_rates
                WHERE id = $1
                AND is_active = true
              `,
              [
                taxRateId,
              ]
            );

          if (
            (taxResult.rowCount ??
              0) === 0
          ) {
            throw new Error(
              `Tax rate ${taxRateId} not found or inactive`
            );
          }

          taxRate =
            toNumber(
              taxResult.rows[0].rate
            );
        }

        const calculated =
          calculateLine(
            {
              quantity,
              unitPrice,
              discountType:
                itemDiscountType,
              discountValue:
                itemDiscountValue,
              taxRate,
            },
            taxMethod
          );

        subtotal +=
          calculated.gross;

        discountAmount +=
          calculated.discountAmount;

        taxAmount +=
          calculated.taxAmount;

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

              $14
            )
          `,
          [
            id,
            item.product_id ??
              product?.id ??
              null,

            item.description ||
              product?.name ||
              "Item",

            quantity,
            unitPrice,

            itemDiscountType,
            itemDiscountValue,
            calculated.discountAmount,

            taxRate,
            calculated.taxAmount,
            taxRateId,

            calculated.lineTotal,

            Number.isFinite(
              Number(
                item.sort_order
              )
            )
              ? Number(
                  item.sort_order
                )
              : index,

            item.metadata ??
              {},
          ]
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Invoice-level discount
      |--------------------------------------------------------------------------
      */

      const subtotalAfterLineDiscount =
        Math.max(
          0,
          subtotal -
            discountAmount
        );

      const invoiceDiscount =
        calculateDiscount(
          subtotalAfterLineDiscount,
          discountType,
          discountValue
        );

      discountAmount =
        invoiceDiscount;

      /*
      |--------------------------------------------------------------------------
      | Shipping tax
      |--------------------------------------------------------------------------
      */

      const shippingTaxRate =
        toNumber(
          body.shipping_tax_rate
        );

      shippingTax =
        shippingCost *
        (shippingTaxRate / 100);

      /*
      |--------------------------------------------------------------------------
      | Total
      |--------------------------------------------------------------------------
      */

      if (
        taxMethod ===
        "inclusive"
      ) {
        totalAmount =
          Math.max(
            0,
            subtotalAfterLineDiscount -
              invoiceDiscount
          ) +
          shippingCost;
      } else {
        totalAmount =
          Math.max(
            0,
            subtotalAfterLineDiscount -
              invoiceDiscount
          ) +
          taxAmount +
          shippingCost +
          shippingTax;
      }

      totalAmount =
        Number(
          totalAmount.toFixed(2)
        );
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

    const paymentResult =
      await client.query(
        `
          SELECT
            COALESCE(
              SUM(amount),
              0
            ) AS amount_paid
          FROM public.payments
          WHERE invoice_id = $1
          AND status = 'completed'
        `,
        [id]
      );

    const amountPaid =
      toNumber(
        paymentResult.rows[0]
          ?.amount_paid
      );

    const amountDue =
      Math.max(
        0,
        totalAmount -
          amountPaid
      );

    /*
    |--------------------------------------------------------------------------
    | Status
    |--------------------------------------------------------------------------
    */

    let status =
      body.status ??
      existing.status;

    if (
      body.status ===
      undefined
    ) {
      if (
        amountPaid >=
        totalAmount
      ) {
        status = "paid";
      } else if (
        amountPaid > 0
      ) {
        status =
          "partially_paid";
      } else if (
        dueDate &&
        new Date(
          dueDate
        ) <
          new Date() &&
        ![
          "draft",
          "cancelled",
          "void",
        ].includes(
          existing.status
        )
      ) {
        status =
          "overdue";
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Cancellation
    |--------------------------------------------------------------------------
    */

    let cancelledBy =
      existing.cancelled_by;

    let cancelledReason =
      existing.cancelled_reason;

    if (
      status ===
        "cancelled" &&
      existing.status !==
        "cancelled"
    ) {
      cancelledBy =
        user.id;

      cancelledReason =
        body.cancelled_reason ||
        body.reason ||
        existing.cancelled_reason ||
        null;
    }

    /*
    |--------------------------------------------------------------------------
    | Update invoice
    |--------------------------------------------------------------------------
    */

    const updatedResult =
      await client.query(
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

            total_amount = $13,
            amount_paid = $14,
            amount_due = $15,

            po_number = $16,
            currency = $17,
            exchange_rate = $18,

            payment_terms_id =
              COALESCE(
                $19,
                payment_terms_id
              ),

            payment_terms_display =
              COALESCE(
                $20,
                payment_terms_display
              ),

            template_id =
              COALESCE(
                $21,
                template_id
              ),

            cancelled_by = $22,
            cancelled_reason = $23,

            notes = $24,
            internal_notes = $25,
            footer_text = $26,

            attachments = $27,
            metadata = $28,

            payment_date =
              CASE
                WHEN $14 >= $13
                THEN COALESCE(
                  payment_date,
                  CURRENT_DATE
                )
                ELSE NULL
              END,

            updated_at = NOW()

          WHERE id = $29

          RETURNING *
        `,
        [
          customerId,

          issueDate,
          dueDate,

          status,

          Math.max(
            0,
            subtotal -
              discountAmount
          ),

          discountType,
          discountValue,
          discountAmount,

          taxMethod,
          taxAmount,

          shippingCost,
          shippingTax,

          totalAmount,
          amountPaid,
          amountDue,

          nullableString(
            body.po_number ??
              existing.po_number
          ),

          currency,
          exchangeRate,

          body.payment_terms_id ??
            null,

          body.payment_terms_display ??
            null,

          body.template_id ??
            null,

          cancelledBy,
          cancelledReason,

          nullableString(
            body.notes ??
              existing.notes
          ),

          nullableString(
            body.internal_notes ??
              existing.internal_notes
          ),

          nullableString(
            body.footer_text ??
              existing.footer_text
          ),

          body.attachments ??
            existing.attachments ??
            [],

          body.metadata ??
            existing.metadata ??
            {},

          id,
        ]
      );

    const updatedInvoice =
      updatedResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Activity action
    |--------------------------------------------------------------------------
    */

    let action =
      "updated";

    if (
      status === "cancelled"
    ) {
      action =
        "cancelled";
    } else if (
      status === "void"
    ) {
      action =
        "voided";
    } else if (
      status === "sent"
    ) {
      action =
        "sent";
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
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5
        )
      `,
      [
        id,
        user.id,
        user.fullName ||
          user.email,
        action,
        {
          previous_status:
            existing.status,

          new_status:
            status,

          amount_paid:
            amountPaid,

          amount_due:
            amountDue,

          total_amount:
            totalAmount,

          items_replaced:
            Array.isArray(
              body.items
            ),
        },
      ]
    );

    await client.query(
      "COMMIT"
    );

    /*
    |--------------------------------------------------------------------------
    | Return updated invoice
    |--------------------------------------------------------------------------
    */

    const result =
      await pool.query(
        `
          SELECT
            i.*,

            json_build_object(
              'id', c.id,
              'company_name',
                c.company_name,
              'contact_name',
                c.contact_name,
              'email',
                c.email,
              'phone',
                c.phone,
              'billing_address',
                c.billing_address,
              'shipping_address',
                c.shipping_address,
              'tax_id',
                c.tax_id
            ) AS customer,

            COALESCE(
              (
                SELECT json_agg(
                  ii
                  ORDER BY ii.sort_order
                )
                FROM public.invoice_items ii
                WHERE ii.invoice_id = i.id
              ),
              '[]'::json
            ) AS items

          FROM public.invoices i

          INNER JOIN public.customers c
            ON c.id = i.customer_id

          WHERE i.id = $1
        `,
        [id]
      );

    return NextResponse.json({
      success: true,
      invoice:
        result.rows[0],
    });
  } catch (error) {
    await client.query(
      "ROLLBACK"
    );

    console.error(
      "PATCH /api/invoices/[id]:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update invoice",
      },
      {
        status: 500,
      }
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

export async function DELETE(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const user =
      await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error:
            "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const { id } =
      await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Invoice ID is required",
        },
        {
          status: 400,
        }
      );
    }

    const body =
      await req
        .json()
        .catch(() => ({}));

    const { pool } =
      await getTenantDatabaseForUser(
        user.id
      );

    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN"
      );

      const invoiceResult =
        await client.query(
          `
            SELECT *
            FROM public.invoices
            WHERE id = $1
            FOR UPDATE
          `,
          [id]
        );

      if (
        (invoiceResult.rowCount ??
          0) === 0
      ) {
        await client.query(
          "ROLLBACK"
        );

        return NextResponse.json(
          {
            error:
              "Invoice not found",
          },
          {
            status: 404,
          }
        );
      }

      const invoice =
        invoiceResult.rows[0];

      if (
        invoice.status ===
        "paid"
      ) {
        await client.query(
          "ROLLBACK"
        );

        return NextResponse.json(
          {
            error:
              "A paid invoice cannot be voided. Create a credit note instead.",
          },
          {
            status: 409,
          }
        );
      }

      if (
        invoice.status ===
        "void"
      ) {
        await client.query(
          "ROLLBACK"
        );

        return NextResponse.json(
          {
            error:
              "Invoice is already voided",
          },
          {
            status: 409,
          }
        );
      }

      const reason =
        body.reason ||
        "Invoice voided";

      const updatedResult =
        await client.query(
          `
            UPDATE public.invoices

            SET
              status = 'void',

              cancelled_by = $1,
              cancelled_reason = $2,

              updated_at = NOW()

            WHERE id = $3

            RETURNING *
          `,
          [
            user.id,
            reason,
            id,
          ]
        );

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
            $1,
            $2,
            $3,
            'voided',
            $4
          )
        `,
        [
          id,
          user.id,
          user.fullName ||
            user.email,
          {
            reason,
            previous_status:
              invoice.status,
          },
        ]
      );

      await client.query(
        "COMMIT"
      );

      return NextResponse.json({
        success: true,

        message:
          "Invoice voided successfully",

        invoice:
          updatedResult.rows[0],
      });
    } catch (error) {
      await client.query(
        "ROLLBACK"
      );

      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(
      "DELETE /api/invoices/[id]:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to void invoice",
      },
      {
        status: 500,
      }
    );
  }
}