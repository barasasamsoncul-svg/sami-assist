import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

const VALID_REMINDER_TYPES = [
  "due_soon",
  "overdue",
  "follow_up",
  "custom",
] as const;

const VALID_STATUSES = [
  "scheduled",
  "sent",
  "failed",
  "cancelled",
] as const;

function isReminderType(
  value: unknown
): value is (typeof VALID_REMINDER_TYPES)[number] {
  return (
    typeof value === "string" &&
    VALID_REMINDER_TYPES.includes(
      value as (typeof VALID_REMINDER_TYPES)[number]
    )
  );
}

function isStatus(
  value: unknown
): value is (typeof VALID_STATUSES)[number] {
  return (
    typeof value === "string" &&
    VALID_STATUSES.includes(
      value as (typeof VALID_STATUSES)[number]
    )
  );
}

function nullableString(
  value: unknown
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return String(value);
}

/*
|--------------------------------------------------------------------------
| GET /api/invoice-reminders
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

    const status =
      searchParams.get("status");

    const reminderType =
      searchParams.get(
        "reminder_type"
      );

    const page = Math.max(
      1,
      Number(
        searchParams.get("page") || 1
      )
    );

    const limit = Math.min(
      100,
      Math.max(
        1,
        Number(
          searchParams.get("limit") ||
            25
        )
      )
    );

    const offset =
      (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];

    let parameterIndex = 1;

    if (invoiceId) {
      conditions.push(
        `r.invoice_id = $${parameterIndex}`
      );

      values.push(invoiceId);
      parameterIndex++;
    }

    if (status) {
      if (!isStatus(status)) {
        return NextResponse.json(
          {
            error:
              "Invalid reminder status",
          },
          {
            status: 400,
          }
        );
      }

      conditions.push(
        `r.status = $${parameterIndex}`
      );

      values.push(status);
      parameterIndex++;
    }

    if (reminderType) {
      if (
        !isReminderType(
          reminderType
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid reminder type",
          },
          {
            status: 400,
          }
        );
      }

      conditions.push(
        `r.reminder_type = $${parameterIndex}`
      );

      values.push(
        reminderType
      );
      parameterIndex++;
    }

    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(
            " AND "
          )}`
        : "";

    const countResult =
      await pool.query(
        `
          SELECT COUNT(*)::integer AS count

          FROM public.invoice_reminders r

          INNER JOIN public.invoices i
            ON i.id = r.invoice_id

          ${whereClause}
        `,
        values
      );

    const total =
      countResult.rows[0]?.count ||
      0;

    const dataValues = [
      ...values,
      limit,
      offset,
    ];

    const result =
      await pool.query(
        `
          SELECT
            r.*,

            json_build_object(
              'id', i.id,
              'invoice_number',
                i.invoice_number,
              'status', i.status,
              'total_amount',
                i.total_amount,
              'amount_paid',
                i.amount_paid,
              'amount_due',
                i.amount_due,
              'currency', i.currency,
              'issue_date',
                i.issue_date,
              'due_date',
                i.due_date
            ) AS invoice,

            json_build_object(
              'id', c.id,
              'company_name',
                c.company_name,
              'contact_name',
                c.contact_name,
              'email', c.email,
              'phone', c.phone
            ) AS customer

          FROM public.invoice_reminders r

          INNER JOIN public.invoices i
            ON i.id = r.invoice_id

          INNER JOIN public.customers c
            ON c.id = i.customer_id

          ${whereClause}

          ORDER BY
            r.scheduled_at ASC NULLS LAST,
            r.created_at DESC

          LIMIT $${parameterIndex}
          OFFSET $${parameterIndex + 1}
        `,
        dataValues
      );

    return NextResponse.json({
      success: true,
      reminders: result.rows,
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
      "GET /api/invoice-reminders:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch invoice reminders",
      },
      {
        status: 500,
      }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/invoice-reminders
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
      reminder_type,
      scheduled_at,
      email_subject,
      email_body,
      email_to,
      email_cc,
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
      !isReminderType(
        reminder_type
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid reminder_type",
        },
        {
          status: 400,
        }
      );
    }

    if (!email_to) {
      return NextResponse.json(
        {
          error:
            "email_to is required",
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
    | Verify invoice
    |--------------------------------------------------------------------------
    */

    const invoiceResult =
      await pool.query(
        `
          SELECT
            i.id,
            i.invoice_number,
            i.status,
            i.due_date,
            c.email,
            c.company_name

          FROM public.invoices i

          INNER JOIN public.customers c
            ON c.id = i.customer_id

          WHERE i.id = $1

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

    const invoice =
      invoiceResult.rows[0];

    if (
      invoice.status ===
        "cancelled" ||
      invoice.status ===
        "void"
    ) {
      return NextResponse.json(
        {
          error:
            "Cannot create a reminder for a cancelled or void invoice",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Validate scheduled date
    |--------------------------------------------------------------------------
    */

    let scheduledAt =
      nullableString(
        scheduled_at
      );

    if (
      !scheduledAt
    ) {
      scheduledAt =
        new Date().toISOString();
    }

    const scheduledDate =
      new Date(
        scheduledAt
      );

    if (
      Number.isNaN(
        scheduledDate.getTime()
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid scheduled_at",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Create reminder
    |--------------------------------------------------------------------------
    */

    const result =
      await pool.query(
        `
          INSERT INTO public.invoice_reminders (
            invoice_id,
            reminder_type,
            scheduled_at,
            email_subject,
            email_body,
            email_to,
            email_cc,
            status
          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            'scheduled'
          )

          RETURNING *
        `,
        [
          invoice_id,
          reminder_type,
          scheduledDate,
          nullableString(
            email_subject
          ),
          nullableString(
            email_body
          ),
          String(email_to),
          nullableString(
            email_cc
          ),
        ]
      );

    /*
    |--------------------------------------------------------------------------
    | Activity log
    |--------------------------------------------------------------------------
    */

    await pool.query(
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
          'reminder_scheduled',
          $4
        )
      `,
      [
        invoice_id,
        user.id,
        user.fullName ||
          user.email,
        {
          reminder_id:
            result.rows[0].id,

          reminder_type,

          scheduled_at:
            scheduledDate,

          email_to:
            String(email_to),
        },
      ]
    );

    return NextResponse.json(
      {
        success: true,
        reminder:
          result.rows[0],
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "POST /api/invoice-reminders:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create invoice reminder",
      },
      {
        status: 500,
      }
    );
  }
}

/*
|--------------------------------------------------------------------------
| PATCH /api/invoice-reminders
|--------------------------------------------------------------------------
*/

export async function PATCH(
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
      id,
      reminder_type,
      scheduled_at,
      email_subject,
      email_body,
      email_to,
      email_cc,
      status,
      error_message,
    } = body;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Reminder ID is required",
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

    const existingResult =
      await pool.query(
        `
          SELECT *

          FROM public.invoice_reminders

          WHERE id = $1

          LIMIT 1
        `,
        [id]
      );

    if (
      (existingResult.rowCount ?? 0) ===
      0
    ) {
      return NextResponse.json(
        {
          error:
            "Invoice reminder not found",
        },
        {
          status: 404,
        }
      );
    }

    const existing =
      existingResult.rows[0];

    if (
      reminder_type !==
        undefined &&
      !isReminderType(
        reminder_type
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid reminder_type",
        },
        {
          status: 400,
        }
      );
    }

    if (
      status !== undefined &&
      !isStatus(status)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid reminder status",
        },
        {
          status: 400,
        }
      );
    }

    let scheduledDate =
      existing.scheduled_at;

    if (
      scheduled_at !==
      undefined
    ) {
      if (
        scheduled_at === null ||
        scheduled_at === ""
      ) {
        scheduledDate = null;
      } else {
        const parsed =
          new Date(
            scheduled_at
          );

        if (
          Number.isNaN(
            parsed.getTime()
          )
        ) {
          return NextResponse.json(
            {
              error:
                "Invalid scheduled_at",
            },
            {
              status: 400,
            }
          );
        }

        scheduledDate =
          parsed;
      }
    }

    const newStatus =
      status !== undefined
        ? status
        : existing.status;

    /*
    |--------------------------------------------------------------------------
    | Prevent editing sent reminders
    |--------------------------------------------------------------------------
    */

    if (
      existing.status ===
        "sent" &&
      newStatus !== "sent"
    ) {
      return NextResponse.json(
        {
          error:
            "A sent reminder cannot be rescheduled",
        },
        {
          status: 400,
        }
      );
    }

    const result =
      await pool.query(
        `
          UPDATE public.invoice_reminders

          SET
            reminder_type =
              COALESCE(
                $1,
                reminder_type
              ),

            scheduled_at = $2,

            email_subject =
              COALESCE(
                $3,
                email_subject
              ),

            email_body =
              COALESCE(
                $4,
                email_body
              ),

            email_to =
              COALESCE(
                $5,
                email_to
              ),

            email_cc =
              COALESCE(
                $6,
                email_cc
              ),

            status = $7,

            error_message =
              CASE
                WHEN $8::text IS NOT NULL
                THEN $8
                ELSE error_message
              END,

            updated_at = NOW()

          WHERE id = $9

          RETURNING *
        `,
        [
          reminder_type ??
            null,

          scheduledDate,

          email_subject ??
            null,

          email_body ??
            null,

          email_to ??
            null,

          email_cc ??
            null,

          newStatus,

          error_message ??
            null,

          id,
        ]
      );

    /*
    |--------------------------------------------------------------------------
    | Activity
    |--------------------------------------------------------------------------
    */

    await pool.query(
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
          'reminder_updated',
          $4
        )
      `,
      [
        existing.invoice_id,
        user.id,
        user.fullName ||
          user.email,
        {
          reminder_id:
            id,

          status:
            newStatus,
        },
      ]
    );

    return NextResponse.json({
      success: true,
      reminder:
        result.rows[0],
    });
  } catch (error) {
    console.error(
      "PATCH /api/invoice-reminders:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update invoice reminder",
      },
      {
        status: 500,
      }
    );
  }
}

/*
|--------------------------------------------------------------------------
| DELETE /api/invoice-reminders
|--------------------------------------------------------------------------
*/

export async function DELETE(
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

    const { searchParams } =
      new URL(req.url);

    const id =
      searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Reminder ID is required",
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

    const existingResult =
      await pool.query(
        `
          SELECT
            id,
            invoice_id,
            status

          FROM public.invoice_reminders

          WHERE id = $1

          LIMIT 1
        `,
        [id]
      );

    if (
      (existingResult.rowCount ?? 0) ===
      0
    ) {
      return NextResponse.json(
        {
          error:
            "Invoice reminder not found",
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
    | We don't physically delete reminders.
    |
    | The schema has a cancelled status, which gives
    | us a proper audit trail.
    |--------------------------------------------------------------------------
    */

    if (
      existing.status ===
      "sent"
    ) {
      return NextResponse.json(
        {
          error:
            "A sent reminder cannot be cancelled",
        },
        {
          status: 400,
        }
      );
    }

    const result =
      await pool.query(
        `
          UPDATE public.invoice_reminders

          SET
            status = 'cancelled',
            updated_at = NOW()

          WHERE id = $1

          RETURNING *
        `,
        [id]
      );

    await pool.query(
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
          'reminder_cancelled',
          $4
        )
      `,
      [
        existing.invoice_id,
        user.id,
        user.fullName ||
          user.email,
        {
          reminder_id:
            id,
        },
      ]
    );

    return NextResponse.json({
      success: true,
      reminder:
        result.rows[0],
    });
  } catch (error) {
    console.error(
      "DELETE /api/invoice-reminders:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to cancel invoice reminder",
      },
      {
        status: 500,
      }
    );
  }
}