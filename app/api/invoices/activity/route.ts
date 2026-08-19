import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

/*
|--------------------------------------------------------------------------
| Types
|--------------------------------------------------------------------------
*/

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
  "credit_note_issued",
  "credit_note_updated",
  "credit_note_applied",
  "credit_note_voided",
  "approved",
  "attachment_added",
  "attachment_removed",
  "status_updated_to_draft",
  "status_updated_to_pending_approval",
  "status_updated_to_sent",
  "status_updated_to_viewed",
  "status_updated_to_partially_paid",
  "status_updated_to_paid",
  "status_updated_to_overdue",
  "status_updated_to_cancelled",
  "status_updated_to_void",
  "notification_requested",
  "invoice_archived",
  "invoice_restored",
] as const;

type ValidAction = typeof VALID_ACTIONS[number];

function isValidAction(value: string): boolean {
  return VALID_ACTIONS.includes(value as ValidAction);
}

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return String(value);
}

/*
|--------------------------------------------------------------------------
| GET /api/invoices/activity
|--------------------------------------------------------------------------
|
| Returns invoice activity/audit history.
|
| Supported filters:
|
| ?invoice_id=UUID
| ?user_id=UUID
| ?action=created
| ?from_date=2026-01-01
| ?to_date=2026-12-31
| ?page=1
| ?limit=50
|
|--------------------------------------------------------------------------
*/

export async function GET(req: NextRequest) {
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

    const { pool } = await getTenantDatabaseForUser(user.id);

    const { searchParams } = new URL(req.url);

    const invoiceId = searchParams.get("invoice_id");
    const userId = searchParams.get("user_id");
    const action = searchParams.get("action");
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date");
    const search = searchParams.get("search");

    const pageValue = Number(searchParams.get("page") || "1");
    const limitValue = Number(searchParams.get("limit") || "50");

    const page = Number.isFinite(pageValue) ? Math.max(1, Math.floor(pageValue)) : 1;
    const limit = Number.isFinite(limitValue) ? Math.min(100, Math.max(1, Math.floor(limitValue))) : 50;
    const offset = (page - 1) * limit;

    if (action && !isValidAction(action)) {
      return NextResponse.json(
        {
          error: "Invalid activity action",
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
      conditions.push(`a.invoice_id = $${parameterIndex}`);
      values.push(invoiceId);
      parameterIndex++;
    }

    if (userId) {
      conditions.push(`a.user_id = $${parameterIndex}`);
      values.push(userId);
      parameterIndex++;
    }

    if (action) {
      conditions.push(`a.action = $${parameterIndex}`);
      values.push(action);
      parameterIndex++;
    }

    if (fromDate) {
      conditions.push(`a.created_at >= $${parameterIndex}`);
      values.push(fromDate);
      parameterIndex++;
    }

    if (toDate) {
      conditions.push(`a.created_at <= $${parameterIndex}::date + INTERVAL '1 day'`);
      values.push(toDate);
      parameterIndex++;
    }

    if (search) {
      conditions.push(`
        (
          a.action ILIKE $${parameterIndex}
          OR a.user_name ILIKE $${parameterIndex}
          OR i.invoice_number ILIKE $${parameterIndex}
          OR c.company_name ILIKE $${parameterIndex}
        )
      `);
      values.push(`%${search}%`);
      parameterIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    /*
    |--------------------------------------------------------------------------
    | Count
    |--------------------------------------------------------------------------
    */

    const countResult = await pool.query(
      `
        SELECT COUNT(*)::integer AS count
        FROM public.invoice_activity_log a
        ${whereClause}
      `,
      values
    );

    const total = countResult.rows[0]?.count ?? 0;

    /*
    |--------------------------------------------------------------------------
    | Activity records with enhanced details
    |--------------------------------------------------------------------------
    */

    const result = await pool.query(
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
          i.amount_due,
          i.currency,

          c.id AS customer_id,
          c.company_name AS customer_name,

          CASE
            WHEN a.user_id IS NOT NULL THEN (
              SELECT row_to_json(u)
              FROM (
                SELECT
                  id,
                  full_name,
                  email
                FROM public.users
                WHERE id = a.user_id
              ) u
            )
            ELSE NULL
          END AS user_details

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
      [...values, limit, offset]
    );

    /*
    |--------------------------------------------------------------------------
    | Get action summary statistics
    |--------------------------------------------------------------------------
    */

    const summaryResult = await pool.query(
      `
        SELECT
          action,
          COUNT(*)::integer AS count
        FROM public.invoice_activity_log
        ${invoiceId ? `WHERE invoice_id = $1` : ''}
        GROUP BY action
        ORDER BY count DESC
        LIMIT 20
      `,
      invoiceId ? [invoiceId] : []
    );

    return NextResponse.json({
      success: true,
      activities: result.rows,
      summary: summaryResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/activity:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch invoice activity",
      },
      {
        status: 500,
      }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices/activity
|--------------------------------------------------------------------------
|
| Creates an audit entry.
|
| This is useful for actions that happen outside the invoice APIs,
| such as sending an invoice from another service.
|
| Request body:
| {
|   invoice_id: string,
|   action: string,
|   details?: object,
|   ip_address?: string,
|   user_agent?: string
| }
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest) {
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

    const body = await req.json();

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
          error: "invoice_id is required",
        },
        {
          status: 400,
        }
      );
    }

    if (!action || typeof action !== "string") {
      return NextResponse.json(
        {
          error: "action is required",
        },
        {
          status: 400,
        }
      );
    }

    if (!isValidAction(action)) {
      return NextResponse.json(
        {
          error: `Invalid activity action. Must be one of: ${VALID_ACTIONS.join(", ")}`,
        },
        {
          status: 400,
        }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    /*
    |--------------------------------------------------------------------------
    | Verify invoice belongs to this tenant
    |--------------------------------------------------------------------------
    */

    const invoiceResult = await pool.query(
      `
        SELECT
          id,
          invoice_number,
          status,
          customer_id
        FROM public.invoices
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1
      `,
      [invoice_id]
    );

    if ((invoiceResult.rowCount ?? 0) === 0) {
      return NextResponse.json(
        {
          error: "Invoice not found",
        },
        {
          status: 404,
        }
      );
    }

    const invoice = invoiceResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Ensure details is JSON-compatible
    |--------------------------------------------------------------------------
    */

    let safeDetails: Record<string, unknown> | null = null;

    if (details !== undefined && details !== null) {
      if (typeof details !== "object" || Array.isArray(details)) {
        return NextResponse.json(
          {
            error: "details must be a JSON object",
          },
          {
            status: 400,
          }
        );
      }

      safeDetails = details as Record<string, unknown>;
    }

    /*
    |--------------------------------------------------------------------------
    | Create activity
    |--------------------------------------------------------------------------
    */

    const result = await pool.query(
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
          $1, $2, $3, $4, $5, $6, $7
        )
        RETURNING *
      `,
      [
        invoice_id,
        user.id,
        user.fullName || user.email,
        action,
        safeDetails,
        nullableString(ip_address),
        nullableString(user_agent),
      ]
    );

    /*
    |--------------------------------------------------------------------------
    | Create event for webhooks for important actions
    |--------------------------------------------------------------------------
    */

    const webhookActions = [
      "created",
      "sent",
      "paid",
      "cancelled",
      "voided",
      "credit_note_applied",
    ];

    if (webhookActions.includes(action)) {
      await pool.query(
        `
          INSERT INTO public.invoice_events (
            invoice_id,
            event_type,
            payload
          )
          VALUES ($1, $2, $3)
        `,
        [
          invoice_id,
          action === "created" ? "invoice_created" :
          action === "sent" ? "invoice_sent" :
          action === "paid" ? "invoice_paid" :
          action === "cancelled" ? "invoice_cancelled" :
          action === "voided" ? "invoice_voided" :
          "activity_logged",
          {
            activity_id: result.rows[0].id,
            invoice_id: invoice_id,
            invoice_number: invoice.invoice_number,
            action: action,
            details: safeDetails,
            user_id: user.id,
            user_name: user.fullName || user.email,
            created_at: new Date().toISOString(),
          },
        ]
      );
    }

    return NextResponse.json(
      {
        success: true,
        activity: result.rows[0],
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error("POST /api/invoices/activity:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create invoice activity",
      },
      {
        status: 500,
      }
    );
  }
}