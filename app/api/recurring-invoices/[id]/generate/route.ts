import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatInvoiceNumber(
  prefix: string,
  number: number,
  padding: number,
  format: string
): string {
  const paddedNumber = String(number).padStart(
    Math.max(0, padding),
    "0"
  );

  return format
    .replace("{prefix}", prefix)
    .replace("{number}", paddedNumber);
}

function calculateNextIssueDate(
  currentDate: Date,
  frequency: string,
  interval: number
): Date {
  const next = new Date(currentDate);

  switch (frequency) {
    case "daily":
      next.setDate(
        next.getDate() + interval
      );
      break;

    case "weekly":
      next.setDate(
        next.getDate() + 7 * interval
      );
      break;

    case "biweekly":
      next.setDate(
        next.getDate() + 14 * interval
      );
      break;

    case "monthly":
      next.setMonth(
        next.getMonth() + interval
      );
      break;

    case "quarterly":
      next.setMonth(
        next.getMonth() + 3 * interval
      );
      break;

    case "biannual":
      next.setMonth(
        next.getMonth() + 6 * interval
      );
      break;

    case "yearly":
      next.setFullYear(
        next.getFullYear() + interval
      );
      break;

    default:
      throw new Error(
        `Unsupported frequency: ${frequency}`
      );
  }

  return next;
}

function calculateLine(
  item: Record<string, unknown>
) {
  const quantity = toNumber(
    item.quantity,
    1
  );

  const unitPrice = toNumber(
    item.unit_price,
    0
  );

  const discountType =
    item.discount_type || null;

  const discountValue = toNumber(
    item.discount_value,
    0
  );

  const taxRate = toNumber(
    item.tax_rate,
    0
  );

  const gross =
    quantity * unitPrice;

  let discountAmount = 0;

  if (
    discountType === "percentage"
  ) {
    discountAmount =
      gross *
      (discountValue / 100);
  } else if (
    discountType === "fixed"
  ) {
    discountAmount =
      discountValue;
  }

  discountAmount = Math.min(
    Math.max(discountAmount, 0),
    gross
  );

  const lineTotal =
    gross - discountAmount;

  const taxAmount =
    lineTotal *
    (taxRate / 100);

  return {
    quantity,
    unitPrice,
    discountType,
    discountValue,
    discountAmount:
      roundMoney(discountAmount),
    taxRate,
    taxAmount:
      roundMoney(taxAmount),
    lineTotal:
      roundMoney(lineTotal),
  };
}

/*
|--------------------------------------------------------------------------
| POST /api/recurring-invoices/[id]/generate
|--------------------------------------------------------------------------
*/

export async function POST(
  _req: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const user =
    await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
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
    const { id } =
      await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Recurring invoice ID is required",
        },
        {
          status: 400,
        }
      );
    }

    await client.query(
      "BEGIN"
    );

    /*
    |--------------------------------------------------------------------------
    | Lock recurring schedule
    |--------------------------------------------------------------------------
    */

    const recurringResult =
      await client.query(
        `
          SELECT
            *

          FROM public.recurring_invoices

          WHERE id = $1

          FOR UPDATE
        `,
        [id]
      );

    if (
      (recurringResult.rowCount ?? 0) ===
      0
    ) {
      await client.query(
        "ROLLBACK"
      );

      return NextResponse.json(
        {
          error:
            "Recurring invoice not found",
        },
        {
          status: 404,
        }
      );
    }

    const recurring =
      recurringResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Status validation
    |--------------------------------------------------------------------------
    */

    if (
      recurring.status !==
      "active"
    ) {
      await client.query(
        "ROLLBACK"
      );

      return NextResponse.json(
        {
          error:
            `Recurring invoice is ${recurring.status} and cannot generate an invoice`,
        },
        {
          status: 409,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | End-date validation
    |--------------------------------------------------------------------------
    */

    const issueDate =
      new Date(
        recurring.next_issue_date
      );

    if (
      recurring.end_date &&
      issueDate >
        new Date(
          recurring.end_date
        )
    ) {
      await client.query(
        `
          UPDATE public.recurring_invoices

          SET
            status = 'completed',
            updated_at = NOW()

          WHERE id = $1
        `,
        [id]
      );

      await client.query(
        "COMMIT"
      );

      return NextResponse.json(
        {
          success: true,
          generated: false,
          message:
            "Recurring invoice schedule has completed because the next issue date is after the end date.",
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Customer
    |--------------------------------------------------------------------------
    */

    const customerResult =
      await client.query(
        `
          SELECT
            *

          FROM public.customers

          WHERE id = $1

          FOR SHARE
        `,
        [
          recurring.customer_id,
        ]
      );

    if (
      (customerResult.rowCount ?? 0) ===
      0
    ) {
      await client.query(
        "ROLLBACK"
      );

      return NextResponse.json(
        {
          error:
            "Customer no longer exists",
        },
        {
          status: 404,
        }
      );
    }

    const customer =
      customerResult.rows[0];

    if (
      customer.status ===
      "blocked"
    ) {
      await client.query(
        "ROLLBACK"
      );

      return NextResponse.json(
        {
          error:
            "Cannot generate an invoice for a blocked customer",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Items
    |--------------------------------------------------------------------------
    */

    if (
      !Array.isArray(
        recurring.items
      ) ||
      recurring.items.length === 0
    ) {
      await client.query(
        "ROLLBACK"
      );

      return NextResponse.json(
        {
          error:
            "Recurring invoice contains no items",
        },
        {
          status: 400,
        }
      );
    }

    const sourceItems =
      recurring.items as Array<
        Record<string, unknown>
      >;

    /*
    |--------------------------------------------------------------------------
    | Calculate invoice totals
    |--------------------------------------------------------------------------
    */

    let subtotal = 0;
    let lineDiscountTotal = 0;
    let lineTaxTotal = 0;

    const calculatedItems =
      sourceItems.map(
        (item) => {
          const calculated =
            calculateLine(item);

          subtotal +=
            calculated.lineTotal +
            calculated.discountAmount;

          lineDiscountTotal +=
            calculated.discountAmount;

          lineTaxTotal +=
            calculated.taxAmount;

          return {
            item,
            calculated,
          };
        }
      );

    subtotal =
      roundMoney(subtotal);

    lineDiscountTotal =
      roundMoney(
        lineDiscountTotal
      );

    lineTaxTotal =
      roundMoney(
        lineTaxTotal
      );

    /*
    |--------------------------------------------------------------------------
    | Invoice-level discount
    |--------------------------------------------------------------------------
    */

    const discountType =
      recurring.discount_type ||
      null;

    const discountValue =
      toNumber(
        recurring.discount_value,
        0
      );

    let invoiceDiscount = 0;

    const lineNet =
      roundMoney(
        subtotal -
          lineDiscountTotal
      );

    if (
      discountType ===
      "percentage"
    ) {
      invoiceDiscount =
        lineNet *
        (discountValue / 100);
    } else if (
      discountType ===
      "fixed"
    ) {
      invoiceDiscount =
        discountValue;
    }

    invoiceDiscount =
      Math.min(
        Math.max(
          invoiceDiscount,
          0
        ),
        lineNet
      );

    invoiceDiscount =
      roundMoney(
        invoiceDiscount
      );

    /*
    |--------------------------------------------------------------------------
    | Tax calculation
    |--------------------------------------------------------------------------
    */

    const taxMethod =
      recurring.tax_calculation_method ||
      "exclusive";

    let taxAmount =
      lineTaxTotal;

    if (
      invoiceDiscount > 0
    ) {
      const discountRatio =
        lineNet > 0
          ? invoiceDiscount /
            lineNet
          : 0;

      taxAmount =
        lineTaxTotal *
        (1 - discountRatio);
    }

    taxAmount =
      roundMoney(
        taxAmount
      );

    /*
    |--------------------------------------------------------------------------
    | Final totals
    |--------------------------------------------------------------------------
    */

    const finalSubtotal =
      roundMoney(
        lineNet -
          invoiceDiscount
      );

    let totalAmount = 0;

    if (
      taxMethod ===
      "inclusive"
    ) {
      totalAmount =
        finalSubtotal;
    } else {
      totalAmount =
        finalSubtotal +
        taxAmount;
    }

    totalAmount =
      roundMoney(
        totalAmount
      );

    /*
    |--------------------------------------------------------------------------
    | Payment terms
    |--------------------------------------------------------------------------
    */

    let paymentTerms = null;

    if (
      recurring.payment_terms_id
    ) {
      const paymentTermsResult =
        await client.query(
          `
            SELECT
              id,
              name,
              due_days

            FROM public.payment_terms

            WHERE id = $1
              AND is_active = true

            LIMIT 1
          `,
          [
            recurring.payment_terms_id,
          ]
        );

      if (
        (paymentTermsResult.rowCount ?? 0) ===
        0
      ) {
        await client.query(
          "ROLLBACK"
        );

        return NextResponse.json(
          {
            error:
              "Recurring invoice payment terms no longer exist or are inactive",
          },
          {
            status: 400,
          }
        );
      }

      paymentTerms =
        paymentTermsResult.rows[0];
    }

    /*
    |--------------------------------------------------------------------------
    | Due date
    |--------------------------------------------------------------------------
    */

    let dueDate:
      Date | null = null;

    if (paymentTerms) {
      dueDate =
        new Date(issueDate);

      dueDate.setDate(
        dueDate.getDate() +
          Number(
            paymentTerms.due_days
          )
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Invoice settings
    |--------------------------------------------------------------------------
    |
    | There should normally be one settings row per tenant.
    |--------------------------------------------------------------------------
    */

    const settingsResult =
      await client.query(
        `
          SELECT
            *

          FROM public.invoice_settings

          ORDER BY created_at ASC

          LIMIT 1

          FOR UPDATE
        `
      );

    if (
      (settingsResult.rowCount ?? 0) ===
      0
    ) {
      await client.query(
        "ROLLBACK"
      );

      return NextResponse.json(
        {
          error:
            "Invoice settings have not been configured",
        },
        {
          status: 400,
        }
      );
    }

    const settings =
      settingsResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Invoice number
    |--------------------------------------------------------------------------
    */

    const prefix =
      settings.invoice_prefix ||
      "INV-";

    const nextNumber =
      Number(
        settings.invoice_next_number ||
          1
      );

    const padding =
      Number(
        settings.invoice_number_padding ||
          6
      );

    const numberFormat =
      settings.invoice_number_format ||
      "{prefix}{number}";

    const invoiceNumber =
      formatInvoiceNumber(
        prefix,
        nextNumber,
        padding,
        numberFormat
      );

    /*
    |--------------------------------------------------------------------------
    | Ensure invoice number is unique
    |--------------------------------------------------------------------------
    */

    const duplicateResult =
      await client.query(
        `
          SELECT id

          FROM public.invoices

          WHERE invoice_number = $1

          LIMIT 1
        `,
        [invoiceNumber]
      );

    if (
      (duplicateResult.rowCount ?? 0) >
      0
    ) {
      await client.query(
        "ROLLBACK"
      );

      return NextResponse.json(
        {
          error:
            `Invoice number ${invoiceNumber} already exists`,
        },
        {
          status: 409,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Create invoice
    |--------------------------------------------------------------------------
    */

    const invoiceResult =
      await client.query(
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

            total_amount,
            amount_paid,
            amount_due,

            currency,

            payment_terms_id,
            payment_terms_display,

            template_id,

            created_by,

            notes
          )

          VALUES (
            $1,
            $2,

            $3,
            $4,

            'draft',

            $5,

            $6,
            $7,
            $8,

            $9,
            $10,

            0,
            0,

            $11,
            0,
            $11,

            $12,

            $13,
            $14,

            $15,

            $16,

            $17
          )

          RETURNING *
        `,
        [
          recurring.customer_id,

          invoiceNumber,

          issueDate,
          dueDate,

          subtotal,

          discountType,
          discountValue,
          invoiceDiscount,

          taxMethod,
          taxAmount,

          totalAmount,

          recurring.currency ||
            customer.currency ||
            "USD",

          recurring.payment_terms_id ||
            null,

          paymentTerms?.name ||
            null,

          recurring.template_id ||
            null,

          user.id,

          recurring.notes ||
            null,
        ]
      );

    const invoice =
      invoiceResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Create invoice items
    |--------------------------------------------------------------------------
    */

    for (
      let index = 0;
      index <
      calculatedItems.length;
      index++
    ) {
      const {
        item,
        calculated,
      } =
        calculatedItems[index];

      /*
      | If an invoice-level discount exists,
      | distribute it proportionally across lines.
      */

      const rawLineNet =
        calculated.lineTotal;

      const discountShare =
        lineNet > 0
          ? invoiceDiscount *
            (rawLineNet /
              lineNet)
          : 0;

      const finalLineTotal =
        roundMoney(
          Math.max(
            0,
            rawLineNet -
              discountShare
          )
        );

      let finalTax =
        calculated.taxAmount;

      if (
        invoiceDiscount >
        0
      ) {
        const ratio =
          rawLineNet > 0
            ? discountShare /
              rawLineNet
            : 0;

        finalTax =
          calculated.taxAmount *
          (1 - ratio);
      }

      finalTax =
        roundMoney(
          finalTax
        );

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
          invoice.id,

          item.product_id ||
            null,

          String(
            item.description
          ),

          calculated.quantity,

          calculated.unitPrice,

          calculated.discountType,

          calculated.discountValue,

          roundMoney(
            calculated.discountAmount +
              discountShare
          ),

          calculated.taxRate,

          finalTax,

          item.tax_rate_id ||
            null,

          finalLineTotal,

          index,

          item.metadata ||
            {},
        ]
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Update invoice number sequence
    |--------------------------------------------------------------------------
    */

    await client.query(
      `
        UPDATE public.invoice_settings

        SET
          invoice_next_number =
            $1,

          updated_at = NOW()

        WHERE id = $2
      `,
      [
        nextNumber + 1,
        settings.id,
      ]
    );

    /*
    |--------------------------------------------------------------------------
    | Calculate next schedule date
    |--------------------------------------------------------------------------
    */

    const nextIssueDate =
      calculateNextIssueDate(
        issueDate,
        recurring.frequency,
        Number(
          recurring.interval_value ||
            1
        )
      );

    let newRecurringStatus =
      "active";

    if (
      recurring.end_date &&
      nextIssueDate >
        new Date(
          recurring.end_date
        )
    ) {
      newRecurringStatus =
        "completed";
    }

    /*
    |--------------------------------------------------------------------------
    | Update recurring schedule
    |--------------------------------------------------------------------------
    */

    await client.query(
      `
        UPDATE public.recurring_invoices

        SET
          last_issue_date = $1,

          next_issue_date = $2,

          status = $3,

          total_generated =
            COALESCE(
              total_generated,
              0
            ) + 1,

          total_amount_generated =
            COALESCE(
              total_amount_generated,
              0
            ) + $4,

          updated_at = NOW()

        WHERE id = $5
      `,
      [
        issueDate,

        nextIssueDate,

        newRecurringStatus,

        totalAmount,

        id,
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
          $1,
          $2,
          $3,
          'created',
          $4
        )
      `,
      [
        invoice.id,

        user.id,

        user.fullName ||
          user.email,

        {
          source:
            "recurring_invoice",

          recurring_invoice_id:
            id,

          invoice_number:
            invoiceNumber,

          generated_amount:
            totalAmount,

          issue_date:
            issueDate,

          next_issue_date:
            nextIssueDate,
        },
      ]
    );

    await client.query(
      "COMMIT"
    );

    /*
    |--------------------------------------------------------------------------
    | Return generated invoice
    |--------------------------------------------------------------------------
    */

    const generatedInvoiceResult =
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
                c.phone
            ) AS customer

          FROM public.invoices i

          INNER JOIN public.customers c
            ON c.id = i.customer_id

          WHERE i.id = $1

          LIMIT 1
        `,
        [invoice.id]
      );

    return NextResponse.json(
      {
        success: true,

        generated: true,

        invoice:
          generatedInvoiceResult
            .rows[0],

        recurringInvoice: {
          id: recurring.id,

          last_issue_date:
            issueDate,

          next_issue_date:
            nextIssueDate,

          status:
            newRecurringStatus,

          total_generated:
            Number(
              recurring.total_generated ||
                0
            ) + 1,

          total_amount_generated:
            roundMoney(
              Number(
                recurring.total_amount_generated ||
                  0
              ) +
                totalAmount
            ),
        },
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    try {
      await client.query(
        "ROLLBACK"
      );
    } catch {
      // Ignore rollback errors.
    }

    console.error(
      "POST /api/recurring-invoices/[id]/generate:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate invoice",
      },
      {
        status: 500,
      }
    );
  } finally {
    client.release();
  }
}