import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

const ALLOWED_FREQUENCIES = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "biannual",
  "yearly",
];

const ALLOWED_STATUSES = [
  "active",
  "paused",
  "completed",
  "cancelled",
];

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isValidDate(value: unknown): boolean {
  if (!value || typeof value !== "string") {
    return false;
  }

  const date = new Date(value);

  return !Number.isNaN(date.getTime());
}

function calculateItemsTotal(
  items: Array<{
    quantity?: unknown;
    unit_price?: unknown;
    discount_type?: unknown;
    discount_value?: unknown;
    tax_rate?: unknown;
  }>
): number {
  return items.reduce((total, item) => {
    const quantity = toNumber(item.quantity, 1);
    const unitPrice = toNumber(item.unit_price, 0);

    const discountType = item.discount_type;
    const discountValue = toNumber(
      item.discount_value,
      0
    );

    const taxRate = toNumber(item.tax_rate, 0);

    const subtotal = quantity * unitPrice;

    let discount = 0;

    if (discountType === "percentage") {
      discount = subtotal * (discountValue / 100);
    } else if (discountType === "fixed") {
      discount = discountValue;
    }

    discount = Math.min(
      Math.max(discount, 0),
      subtotal
    );

    const taxableAmount = subtotal - discount;

    const tax =
      taxableAmount * (taxRate / 100);

    return total + taxableAmount + tax;
  }, 0);
}

async function getRecurringInvoice(
  pool: Awaited<
    ReturnType<typeof getTenantDatabaseForUser>
  >["pool"],
  id: string
) {
  const result = await pool.query(
    `
      SELECT
        ri.*,

        json_build_object(
          'id', c.id,
          'company_name', c.company_name,
          'contact_name', c.contact_name,
          'email', c.email,
          'phone', c.phone,
          'currency', c.currency
        ) AS customer,

        CASE
          WHEN it.id IS NULL THEN NULL
          ELSE json_build_object(
            'id', it.id,
            'name', it.name,
            'is_default', it.is_default
          )
        END AS template,

        CASE
          WHEN pt.id IS NULL THEN NULL
          ELSE json_build_object(
            'id', pt.id,
            'name', pt.name,
            'due_days', pt.due_days
          )
        END AS payment_terms

      FROM public.recurring_invoices ri

      INNER JOIN public.customers c
        ON c.id = ri.customer_id

      LEFT JOIN public.invoice_templates it
        ON it.id = ri.template_id

      LEFT JOIN public.payment_terms pt
        ON pt.id = ri.payment_terms_id

      WHERE ri.id = $1

      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] ?? null;
}

/*
|--------------------------------------------------------------------------
| GET /api/recurring-invoices/[id]
|--------------------------------------------------------------------------
*/

export async function GET(
  _req: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const user = await getAuthenticatedUser();

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
      await getTenantDatabaseForUser(user.id);

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error: "Recurring invoice ID is required",
        },
        {
          status: 400,
        }
      );
    }

    const recurringInvoice =
      await getRecurringInvoice(pool, id);

    if (!recurringInvoice) {
      return NextResponse.json(
        {
          error: "Recurring invoice not found",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      success: true,
      recurringInvoice,
    });
  } catch (error) {
    console.error(
      "GET /api/recurring-invoices/[id]:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to fetch recurring invoice",
      },
      {
        status: 500,
      }
    );
  }
}

/*
|--------------------------------------------------------------------------
| PATCH /api/recurring-invoices/[id]
|--------------------------------------------------------------------------
*/

export async function PATCH(
  req: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const user = await getAuthenticatedUser();

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
    await getTenantDatabaseForUser(user.id);

  const client = await pool.connect();

  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error: "Recurring invoice ID is required",
        },
        {
          status: 400,
        }
      );
    }

    const body = await req.json();

    await client.query("BEGIN");

    /*
    |--------------------------------------------------------------------------
    | Lock existing recurring invoice
    |--------------------------------------------------------------------------
    */

    const existingResult = await client.query(
      `
        SELECT *
        FROM public.recurring_invoices
        WHERE id = $1
        FOR UPDATE
      `,
      [id]
    );

    if ((existingResult.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: "Recurring invoice not found",
        },
        {
          status: 404,
        }
      );
    }

    const existing = existingResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Completed / cancelled records
    |--------------------------------------------------------------------------
    |
    | A cancelled or completed schedule should not be edited back into
    | an arbitrary state. It can only be explicitly reactivated.
    |--------------------------------------------------------------------------
    */

    if (
      existing.status === "cancelled" &&
      body.status !== "active"
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "A cancelled recurring invoice can only be reactivated by setting status to active",
        },
        {
          status: 409,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Frequency
    |--------------------------------------------------------------------------
    */

    const frequency =
      body.frequency ??
      existing.frequency;

    if (
      !ALLOWED_FREQUENCIES.includes(
        frequency
      )
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: "Invalid frequency",
          allowed: ALLOWED_FREQUENCIES,
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Interval
    |--------------------------------------------------------------------------
    */

    const intervalValue =
      body.interval_value ??
      existing.interval_value;

    const normalizedInterval =
      toNumber(intervalValue, 1);

    if (
      normalizedInterval <= 0 ||
      !Number.isInteger(
        normalizedInterval
      )
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "interval_value must be a positive whole number",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Dates
    |--------------------------------------------------------------------------
    */

    const startDateValue =
      body.start_date ??
      existing.start_date;

    if (!isValidDate(startDateValue)) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: "Invalid start_date",
        },
        {
          status: 400,
        }
      );
    }

    const startDate =
      new Date(startDateValue);

    let endDate =
      existing.end_date;

    if (
      body.end_date !== undefined
    ) {
      if (
        body.end_date === null ||
        body.end_date === ""
      ) {
        endDate = null;
      } else {
        if (
          !isValidDate(
            body.end_date
          )
        ) {
          await client.query("ROLLBACK");

          return NextResponse.json(
            {
              error: "Invalid end_date",
            },
            {
              status: 400,
            }
          );
        }

        endDate =
          new Date(body.end_date);
      }
    }

    if (
      endDate &&
      new Date(endDate) < startDate
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "end_date cannot be before start_date",
        },
        {
          status: 400,
        }
      );
    }

    let nextIssueDate =
      existing.next_issue_date;

    if (
      body.next_issue_date !== undefined
    ) {
      if (
        !isValidDate(
          body.next_issue_date
        )
      ) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error:
              "Invalid next_issue_date",
          },
          {
            status: 400,
          }
        );
      }

      nextIssueDate =
        new Date(
          body.next_issue_date
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Customer
    |--------------------------------------------------------------------------
    */

    const customerId =
      body.customer_id ??
      existing.customer_id;

    const customerResult =
      await client.query(
        `
          SELECT
            id,
            company_name,
            currency,
            status

          FROM public.customers

          WHERE id = $1

          LIMIT 1
        `,
        [customerId]
      );

    if ((customerResult.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: "Customer not found",
        },
        {
          status: 404,
        }
      );
    }

    if (
      customerResult.rows[0].status ===
      "blocked"
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "Cannot use a blocked customer",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Payment terms
    |--------------------------------------------------------------------------
    */

    const paymentTermsId =
      body.payment_terms_id !== undefined
        ? body.payment_terms_id
        : existing.payment_terms_id;

    if (paymentTermsId) {
      const paymentTermsResult =
        await client.query(
          `
            SELECT id
            FROM public.payment_terms
            WHERE id = $1
              AND is_active = true
            LIMIT 1
          `,
          [paymentTermsId]
        );

      if (
        (paymentTermsResult.rowCount ?? 0) ===
        0
      ) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error:
              "Payment terms not found or inactive",
          },
          {
            status: 404,
          }
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Template
    |--------------------------------------------------------------------------
    */

    const templateId =
      body.template_id !== undefined
        ? body.template_id
        : existing.template_id;

    if (templateId) {
      const templateResult =
        await client.query(
          `
            SELECT id
            FROM public.invoice_templates
            WHERE id = $1
              AND is_active = true
            LIMIT 1
          `,
          [templateId]
        );

      if (
        (templateResult.rowCount ?? 0) ===
        0
      ) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error:
              "Invoice template not found or inactive",
          },
          {
            status: 404,
          }
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Items
    |--------------------------------------------------------------------------
    */

    let items = existing.items;

    if (body.items !== undefined) {
      if (
        !Array.isArray(body.items) ||
        body.items.length === 0
      ) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error:
              "At least one invoice item is required",
          },
          {
            status: 400,
          }
        );
      }

      items = body.items.map(
        (
          item: Record<
            string,
            unknown
          >,
          index: number
        ) => {
          if (!item.description) {
            throw new Error(
              `Item ${index + 1} requires a description`
            );
          }

          const quantity =
            toNumber(
              item.quantity,
              1
            );

          const unitPrice =
            toNumber(
              item.unit_price,
              0
            );

          const taxRate =
            toNumber(
              item.tax_rate,
              0
            );

          if (quantity <= 0) {
            throw new Error(
              `Item ${index + 1} quantity must be greater than zero`
            );
          }

          if (unitPrice < 0) {
            throw new Error(
              `Item ${index + 1} unit price cannot be negative`
            );
          }

          if (
            taxRate < 0 ||
            taxRate > 100
          ) {
            throw new Error(
              `Item ${index + 1} tax rate must be between 0 and 100`
            );
          }

          return {
            description:
              String(
                item.description
              ),

            quantity,

            unit_price:
              unitPrice,

            discount_type:
              item.discount_type ||
              null,

            discount_value:
              toNumber(
                item.discount_value,
                0
              ),

            tax_rate:
              taxRate,

            product_id:
              item.product_id ||
              null,

            metadata:
              item.metadata ||
              {},
          };
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Validate products referenced by items
    |--------------------------------------------------------------------------
    */

    for (const item of items) {
      if (!item.product_id) {
        continue;
      }

      const productResult =
        await client.query(
          `
            SELECT
              id,
              is_active

            FROM public.products

            WHERE id = $1

            LIMIT 1
          `,
          [item.product_id]
        );

      if (
        (productResult.rowCount ?? 0) ===
        0
      ) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error:
              `Product ${item.product_id} not found`,
          },
          {
            status: 404,
          }
        );
      }

      if (
        !productResult.rows[0].is_active
      ) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error:
              `Product ${item.product_id} is inactive`,
          },
          {
            status: 400,
          }
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Currency
    |--------------------------------------------------------------------------
    */

    const currency =
      body.currency ??
      existing.currency ??
      customerResult.rows[0].currency ??
      "USD";

    if (
      typeof currency !== "string" ||
      currency.length !== 3
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "currency must be a 3-letter currency code",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Discount
    |--------------------------------------------------------------------------
    */

    const discountType =
      body.discount_type !== undefined
        ? body.discount_type
        : existing.discount_type;

    const discountValue =
      body.discount_value !== undefined
        ? toNumber(
            body.discount_value,
            0
          )
        : toNumber(
            existing.discount_value,
            0
          );

    if (
      discountType &&
      ![
        "percentage",
        "fixed",
      ].includes(discountType)
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "discount_type must be percentage or fixed",
        },
        {
          status: 400,
        }
      );
    }

    if (discountValue < 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "discount_value cannot be negative",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Tax calculation method
    |--------------------------------------------------------------------------
    */

    const taxCalculationMethod =
      body.tax_calculation_method ??
      existing.tax_calculation_method ??
      "exclusive";

    if (
      ![
        "exclusive",
        "inclusive",
      ].includes(
        taxCalculationMethod
      )
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "tax_calculation_method must be exclusive or inclusive",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Status
    |--------------------------------------------------------------------------
    */

    const status =
      body.status ??
      existing.status;

    if (
      !ALLOWED_STATUSES.includes(
        status
      )
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: "Invalid status",
          allowed: ALLOWED_STATUSES,
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Update
    |--------------------------------------------------------------------------
    */

    const result = await client.query(
      `
        UPDATE public.recurring_invoices

        SET
          customer_id = $1,
          template_id = $2,
          payment_terms_id = $3,

          frequency = $4,
          interval_value = $5,

          start_date = $6,
          end_date = $7,
          next_issue_date = $8,

          currency = $9,

          discount_type = $10,
          discount_value = $11,

          tax_calculation_method = $12,

          items = $13,

          status = $14,

          notes = $15,

          updated_at = NOW()

        WHERE id = $16

        RETURNING *
      `,
      [
        customerId,
        templateId,
        paymentTermsId,

        frequency,
        normalizedInterval,

        startDate,
        endDate,
        nextIssueDate,

        currency,

        discountType,
        discountValue,

        taxCalculationMethod,

        JSON.stringify(items),

        status,

        body.notes !== undefined
          ? body.notes
          : existing.notes,

        id,
      ]
    );

    const updated =
      result.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Activity log
    |--------------------------------------------------------------------------
    |
    | There is no recurring-invoice activity table in the schema.
    | We therefore do not insert a fake invoice activity record here.
    |--------------------------------------------------------------------------
    */

    await client.query("COMMIT");

    const fullRecord =
      await getRecurringInvoice(
        pool,
        updated.id
      );

    return NextResponse.json({
      success: true,

      recurringInvoice:
        fullRecord,

      calculatedTotal:
        calculateItemsTotal(
          items
        ),
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback errors.
    }

    console.error(
      "PATCH /api/recurring-invoices/[id]:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update recurring invoice",
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
| DELETE /api/recurring-invoices/[id]
|--------------------------------------------------------------------------
|
| We do NOT physically delete the recurring schedule.
|
| Instead, it becomes cancelled so the historical schedule remains
| available for accounting/audit purposes.
|--------------------------------------------------------------------------
*/

export async function DELETE(
  _req: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const user = await getAuthenticatedUser();

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
    await getTenantDatabaseForUser(user.id);

  const client = await pool.connect();

  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error: "Recurring invoice ID is required",
        },
        {
          status: 400,
        }
      );
    }

    await client.query("BEGIN");

    const result = await client.query(
      `
        UPDATE public.recurring_invoices

        SET
          status = 'cancelled',
          updated_at = NOW()

        WHERE id = $1

        RETURNING *
      `,
      [id]
    );

    if ((result.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: "Recurring invoice not found",
        },
        {
          status: 404,
        }
      );
    }

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,

      recurringInvoice:
        result.rows[0],
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback errors.
    }

    console.error(
      "DELETE /api/recurring-invoices/[id]:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to cancel recurring invoice",
      },
      {
        status: 500,
      }
    );
  } finally {
    client.release();
  }
}