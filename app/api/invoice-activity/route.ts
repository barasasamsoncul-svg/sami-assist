import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

const VALID_ACTIONS = [
  "created",
  "updated",
  "sent",
  "viewed",
  "paid",
  "cancelled",
  "voided",
  "reminder_sent",
  "reminder_scheduled",
  "reminder_updated",
  "reminder_cancelled",
  "payment_recorded",
  "payment_updated",
  "payment_refunded",
  "credit_note_created",
  "credit_note_applied",
  "approved",
  "attachment_added",
  "attachment_removed",
] as const;

function isValidAction(
  value: string
): boolean {
  return VALID_ACTIONS.includes(
    value as (typeof VALID_ACTIONS)[number]
  );
}

/*
|--------------------------------------------------------------------------
| GET /api/invoice-activity
|--------------------------------------------------------------------------
|
| Returns invoice activity/audit history.
|
| Supported filters:
|
| ?invoice_id=UUID
| ?user_id=UUID
| ?action=created
| ?page=1
| ?limit=50
|
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

    const invoiceId =
      searchParams.get(
        "invoice_id"
      );

    const userId =
      searchParams.get(
        "user_id"
      );

    const action =
      searchParams.get(
        "action"
      );

    const pageValue =
      Number(
        searchParams.get(
          "page"
        ) || "1"
      );

    const limitValue =
      Number(
        searchParams.get(
          "limit"
        ) || "50"
      );

    const page =
      Number.isFinite(
        pageValue
      )
        ? Math.max(
            1,
            Math.floor(pageValue)
          )
        : 1;

    const limit =
      Number.isFinite(
        limitValue
      )
        ? Math.min(
            100,
            Math.max(
              1,
              Math.floor(limitValue)
            )
          )
        : 50;

    const offset =
      (page - 1) * limit;

    if (
      action &&
      !isValidAction(action)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid activity action",
        },
        {
          status: 400,
        }
      );
    }

    const conditions: string[] = [];
    const values: unknown[] = [];

    let parameterIndex = 1;

    if (invoiceId) {
      conditions.push(
        `a.invoice_id = $${parameterIndex}`
      );

      values.push(invoiceId);
      parameterIndex++;
    }

    if (userId) {
      conditions.push(
        `a.user_id = $${parameterIndex}`
      );

      values.push(userId);
      parameterIndex++;
    }

    if (action) {
      conditions.push(
        `a.action = $${parameterIndex}`
      );

      values.push(action);
      parameterIndex++;
    }

    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(
            " AND "
          )}`
        : "";

    /*
    |--------------------------------------------------------------------------
    | Count
    |--------------------------------------------------------------------------
    */

    const countResult =
      await pool.query(
        `
          SELECT
            COUNT(*)::integer AS count

          FROM public.invoice_activity_log a

          ${whereClause}
        `,
        values
      );

    const total =
      countResult.rows[0]?.count ??
      0;

    /*
    |--------------------------------------------------------------------------
    | Activity records
    |--------------------------------------------------------------------------
    */

    const result =
      await pool.query(
        `
          SELECT
            a.id,
            a.invoice_id,
            a.user_id,
            a.user_name,
            a.action,
            a.details,
            a.ip_address,
            a.user_agent,
            a.created_at,

            i.invoice_number,
            i.status AS invoice_status,
            i.total_amount,
            i.currency,

            c.id AS customer_id,
            c.company_name AS customer_name

          FROM public.invoice_activity_log a

          INNER JOIN public.invoices i
            ON i.id = a.invoice_id

          INNER JOIN public.customers c
            ON c.id = i.customer_id

          ${whereClause}

          ORDER BY
            a.created_at DESC

          LIMIT $${parameterIndex}
          OFFSET $${parameterIndex + 1}
        `,
        [
          ...values,
          limit,
          offset,
        ]
      );

    return NextResponse.json({
      success: true,

      activities:
        result.rows,

      pagination: {
        page,
        limit,
        total,
        totalPages:
          total > 0
            ? Math.ceil(
                total / limit
              )
            : 0,
      },
    });
  } catch (error) {
    console.error(
      "GET /api/invoice-activity:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch invoice activity",
      },
      {
        status: 500,
      }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/invoice-activity
|--------------------------------------------------------------------------
|
| Creates an audit entry.
|
| This is useful for actions that happen outside the invoice APIs,
| such as sending an invoice from another service.
|
|--------------------------------------------------------------------------
*/

export async function POST(
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

    const body =
      await req.json();

    const {
      invoice_id,
      action,
      details,
      ip_address,
      user_agent,
    } = body;

    if (!invoice_id) {
      return NextResponse.json(
        {
          error:
            "invoice_id is required",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !action ||
      typeof action !== "string"
    ) {
      return NextResponse.json(
        {
          error:
            "action is required",
        },
        {
          status: 400,
        }
      );
    }

    if (!isValidAction(action)) {
      return NextResponse.json(
        {
          error:
            "Invalid activity action",
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

    /*
    |--------------------------------------------------------------------------
    | Verify invoice belongs to this tenant
    |--------------------------------------------------------------------------
    */

    const invoiceResult =
      await pool.query(
        `
          SELECT
            id,
            invoice_number

          FROM public.invoices

          WHERE id = $1

          LIMIT 1
        `,
        [invoice_id]
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

    /*
    |--------------------------------------------------------------------------
    | Ensure details is JSON-compatible
    |--------------------------------------------------------------------------
    */

    let safeDetails:
      | Record<string, unknown>
      | null = null;

    if (
      details !== undefined &&
      details !== null
    ) {
      if (
        typeof details !==
          "object" ||
        Array.isArray(details)
      ) {
        return NextResponse.json(
          {
            error:
              "details must be a JSON object",
          },
          {
            status: 400,
          }
        );
      }

      safeDetails =
        details as Record<
          string,
          unknown
        >;
    }

    /*
    |--------------------------------------------------------------------------
    | Create activity
    |--------------------------------------------------------------------------
    */

    const result =
      await pool.query(
        `
          INSERT INTO public.invoice_activity_log (
            invoice_id,
            user_id,
            user_name,
            action,
            details,
            ip_address,
            user_agent
          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7
          )

          RETURNING *
        `,
        [
          invoice_id,
          user.id,
          user.fullName ||
            user.email,
          action,
          safeDetails,
          ip_address ||
            null,
          user_agent ||
            null,
        ]
      );

    return NextResponse.json(
      {
        success: true,
        activity:
          result.rows[0],
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "POST /api/invoice-activity:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create invoice activity",
      },
      {
        status: 500,
      }
    );
  }
}