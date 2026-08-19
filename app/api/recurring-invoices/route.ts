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

function calculateTotal(
  items: Array<{
    quantity?: unknown;
    unit_price?: unknown;
    discount_type?: unknown;
    discount_value?: unknown;
    tax_rate?: unknown;
  }>
): number {
  return items.reduce((total, item) => {
    const quantity = toNumber(
      item.quantity,
      1
    );

    const unitPrice = toNumber(
      item.unit_price,
      0
    );

    const discountType =
      item.discount_type;

    const discountValue = toNumber(
      item.discount_value,
      0
    );

    const taxRate = toNumber(
      item.tax_rate,
      0
    );

    const lineSubtotal =
      quantity * unitPrice;

    let discount = 0;

    if (
      discountType === "percentage"
    ) {
      discount =
        lineSubtotal *
        (discountValue / 100);
    } else if (
      discountType === "fixed"
    ) {
      discount = discountValue;
    }

    discount = Math.min(
      Math.max(discount, 0),
      lineSubtotal
    );

    const taxableAmount =
      lineSubtotal - discount;

    const tax =
      taxableAmount *
      (taxRate / 100);

    return (
      total +
      taxableAmount +
      tax
    );
  }, 0);
}

/*
|--------------------------------------------------------------------------
| GET /api/recurring-invoices
|--------------------------------------------------------------------------
*/

export async function GET(
  req: NextRequest
) {
  try {
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

    const { searchParams } =
      new URL(req.url);

    const customerId =
      searchParams.get(
        "customer_id"
      );

    const status =
      searchParams.get("status");

    const frequency =
      searchParams.get(
        "frequency"
      );

    const search =
      searchParams.get("search");

    const page = Math.max(
      1,
      toNumber(
        searchParams.get("page"),
        1
      )
    );

    const limit = Math.min(
      100,
      Math.max(
        1,
        toNumber(
          searchParams.get("limit"),
          20
        )
      )
    );

    const offset =
      (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];

    let parameter = 1;

    if (customerId) {
      conditions.push(
        `ri.customer_id = $${parameter++}`
      );

      values.push(
        customerId
      );
    }

    if (status) {
      conditions.push(
        `ri.status = $${parameter++}`
      );

      values.push(
        status
      );
    }

    if (frequency) {
      conditions.push(
        `ri.frequency = $${parameter++}`
      );

      values.push(
        frequency
      );
    }

    if (search) {
      conditions.push(`
        (
          c.company_name ILIKE $${parameter}
          OR c.contact_name ILIKE $${parameter}
          OR ri.notes ILIKE $${parameter}
        )
      `);

      values.push(
        `%${search}%`
      );

      parameter++;
    }

    const where =
      conditions.length > 0
        ? `WHERE ${conditions.join(
            " AND "
          )}`
        : "";

    const countResult =
      await pool.query(
        `
          SELECT
            COUNT(*)::int AS count

          FROM public.recurring_invoices ri

          INNER JOIN public.customers c
            ON c.id = ri.customer_id

          ${where}
        `,
        values
      );

    const total =
      countResult.rows[0]?.count ??
      0;

    const result =
      await pool.query(
        `
          SELECT
            ri.*,

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
            ) AS customer,

            json_build_object(
              'id', it.id,
              'name', it.name,
              'is_default',
                it.is_default
            ) AS template,

            json_build_object(
              'id', pt.id,
              'name', pt.name,
              'due_days',
                pt.due_days
            ) AS payment_terms

          FROM public.recurring_invoices ri

          INNER JOIN public.customers c
            ON c.id = ri.customer_id

          LEFT JOIN public.invoice_templates it
            ON it.id = ri.template_id

          LEFT JOIN public.payment_terms pt
            ON pt.id =
              ri.payment_terms_id

          ${where}

          ORDER BY
            ri.next_issue_date ASC,
            ri.created_at DESC

          LIMIT $${parameter}
          OFFSET $${parameter + 1}
        `,
        [
          ...values,
          limit,
          offset,
        ]
      );

    return NextResponse.json({
      success: true,

      recurringInvoices:
        result.rows,

      pagination: {
        page,
        limit,
        total,
        totalPages:
          Math.ceil(
            total / limit
          ),
      },
    });
  } catch (error) {
    console.error(
      "GET /api/recurring-invoices:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to fetch recurring invoices",
      },
      {
        status: 500,
      }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/recurring-invoices
|--------------------------------------------------------------------------
*/

export async function POST(
  req: NextRequest
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
    const body =
      await req.json();

    /*
    |--------------------------------------------------------------------------
    | Required fields
    |--------------------------------------------------------------------------
    */

    if (!body.customer_id) {
      return NextResponse.json(
        {
          error:
            "customer_id is required",
        },
        {
          status: 400,
        }
      );
    }

    if (!body.frequency) {
      return NextResponse.json(
        {
          error:
            "frequency is required",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !ALLOWED_FREQUENCIES.includes(
        body.frequency
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid frequency",

          allowed:
            ALLOWED_FREQUENCIES,
        },
        {
          status: 400,
        }
      );
    }

    if (!body.start_date) {
      return NextResponse.json(
        {
          error:
            "start_date is required",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !isValidDate(
        body.start_date
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid start_date",
        },
        {
          status: 400,
        }
      );
    }

    const startDate =
      new Date(
        body.start_date
      );

    /*
    |--------------------------------------------------------------------------
    | End date
    |--------------------------------------------------------------------------
    */

    let endDate:
      Date | null = null;

    if (body.end_date) {
      if (
        !isValidDate(
          body.end_date
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid end_date",
          },
          {
            status: 400,
          }
        );
      }

      endDate =
        new Date(
          body.end_date
        );

      if (
        endDate < startDate
      ) {
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
    }

    /*
    |--------------------------------------------------------------------------
    | Interval
    |--------------------------------------------------------------------------
    */

    const intervalValue =
      toNumber(
        body.interval_value,
        1
      );

    if (
      intervalValue <= 0 ||
      !Number.isInteger(
        intervalValue
      )
    ) {
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
    | Next issue date
    |--------------------------------------------------------------------------
    */

    let nextIssueDate: Date;

    if (body.next_issue_date) {
      if (
        !isValidDate(
          body.next_issue_date
        )
      ) {
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
    } else {
      nextIssueDate =
        new Date(startDate);
    }

    /*
    |--------------------------------------------------------------------------
    | Items
    |--------------------------------------------------------------------------
    */

    if (
      !Array.isArray(
        body.items
      ) ||
      body.items.length === 0
    ) {
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

    const items =
      body.items.map(
        (
          item: Record<
            string,
            unknown
          >,
          index: number
        ) => {
          if (
            !item.description
          ) {
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

          if (
            quantity <= 0
          ) {
            throw new Error(
              `Item ${index + 1} quantity must be greater than zero`
            );
          }

          if (
            unitPrice < 0
          ) {
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

    /*
    |--------------------------------------------------------------------------
    | Calculate informational total
    |--------------------------------------------------------------------------
    */

    const calculatedTotal =
      calculateTotal(items);

    /*
    |--------------------------------------------------------------------------
    | Database validation
    |--------------------------------------------------------------------------
    */

    await client.query(
      "BEGIN"
    );

    const customerResult =
      await client.query(
        `
          SELECT
            id,
            company_name,
            currency

          FROM public.customers

          WHERE id = $1

          AND status != 'blocked'

          LIMIT 1
        `,
        [
          body.customer_id,
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
            "Customer not found or blocked",
        },
        {
          status: 404,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Payment terms
    |--------------------------------------------------------------------------
    */

    let paymentTermsId =
      body.payment_terms_id ||
      null;

    if (
      paymentTermsId
    ) {
      const paymentTermsResult =
        await client.query(
          `
            SELECT
              id,
              name

            FROM public.payment_terms

            WHERE id = $1

            AND is_active = true

            LIMIT 1
          `,
          [
            paymentTermsId,
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

    let templateId =
      body.template_id ||
      null;

    if (templateId) {
      const templateResult =
        await client.query(
          `
            SELECT
              id,
              name

            FROM public.invoice_templates

            WHERE id = $1

            AND is_active = true

            LIMIT 1
          `,
          [
            templateId,
          ]
        );

      if (
        (templateResult.rowCount ?? 0) ===
        0
      ) {
        await client.query(
          "ROLLBACK"
        );

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
    | Product validation
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
              name,
              is_active

            FROM public.products

            WHERE id = $1

            LIMIT 1
          `,
          [
            item.product_id,
          ]
        );

      if (
        (productResult.rowCount ?? 0) ===
        0
      ) {
        await client.query(
          "ROLLBACK"
        );

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
        !productResult.rows[0]
          .is_active
      ) {
        await client.query(
          "ROLLBACK"
        );

        return NextResponse.json(
          {
            error:
              `Product ${item.product_id} is inactive`,
          },
          {
            status: 400
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
      body.currency ||
      customerResult.rows[0]
        .currency ||
      "USD";

    if (
      typeof currency !==
        "string" ||
      currency.length !== 3
    ) {
      await client.query(
        "ROLLBACK"
      );

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
      body.discount_type ||
      null;

    const discountValue =
      toNumber(
        body.discount_value,
        0
      );

    if (
      discountType &&
      ![
        "percentage",
        "fixed",
      ].includes(
        discountType
      )
    ) {
      await client.query(
        "ROLLBACK"
      );

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

    if (
      discountValue < 0
    ) {
      await client.query(
        "ROLLBACK"
      );

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
      body.tax_calculation_method ||
      "exclusive";

    if (
      ![
        "exclusive",
        "inclusive",
      ].includes(
        taxCalculationMethod
      )
    ) {
      await client.query(
        "ROLLBACK"
      );

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
    | Create recurring invoice
    |--------------------------------------------------------------------------
    */

    const result =
      await client.query(
        `
          INSERT INTO public.recurring_invoices (
            customer_id,
            template_id,
            payment_terms_id,

            frequency,
            interval_value,

            start_date,
            end_date,
            next_issue_date,
            last_issue_date,

            currency,

            discount_type,
            discount_value,

            tax_calculation_method,

            items,

            status,

            total_generated,
            total_amount_generated,

            notes,

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
            NULL,

            $9,

            $10,
            $11,

            $12,

            $13,

            'active',

            0,
            0,

            $14,

            $15
          )

          RETURNING *
        `,
        [
          body.customer_id,

          templateId,

          paymentTermsId,

          body.frequency,

          intervalValue,

          startDate,

          endDate,

          nextIssueDate,

          currency,

          discountType,

          discountValue,

          taxCalculationMethod,

          JSON.stringify(items),

          body.notes ||
            null,

          user.id,
        ]
      );

    const recurringInvoice =
      result.rows[0];

    await client.query(
      "COMMIT"
    );

    return NextResponse.json(
      {
        success: true,

        recurringInvoice,

        calculatedTotal,
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
      // Transaction may already be closed.
    }

    console.error(
      "POST /api/recurring-invoices:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create recurring invoice",
      },
      {
        status: 500,
      }
    );
  } finally {
    client.release();
  }
}