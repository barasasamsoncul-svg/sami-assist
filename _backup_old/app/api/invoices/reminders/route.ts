import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

/*
|--------------------------------------------------------------------------
| Types & Validation
|--------------------------------------------------------------------------
*/

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

function isReminderType(value: unknown): value is (typeof VALID_REMINDER_TYPES)[number] {
  return typeof value === "string" && VALID_REMINDER_TYPES.includes(value as any);
}

function isStatus(value: unknown): value is (typeof VALID_STATUSES)[number] {
  return typeof value === "string" && VALID_STATUSES.includes(value as any);
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
  if (value === null || value === undefined || value === "") {
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

/*
|--------------------------------------------------------------------------
| GET /api/invoices/reminders
|--------------------------------------------------------------------------
|
| Returns all invoice reminders.
|
| Supports:
| ?invoice_id=UUID
| ?status=scheduled|sent|failed|cancelled
| ?reminder_type=due_soon|overdue|follow_up|custom
| ?from_date=2026-01-01
| ?to_date=2026-12-31
| ?page=1
| ?limit=25
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

    const invoiceId = searchParams.get("invoice_id");
    const status = searchParams.get("status");
    const reminderType = searchParams.get("reminder_type");
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date");

    const page = Math.max(1, toNumber(searchParams.get("page"), 1));
    const limit = Math.min(100, Math.max(1, toNumber(searchParams.get("limit"), 25)));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];

    let parameterIndex = 1;

    if (invoiceId) {
      conditions.push(`r.invoice_id = $${parameterIndex}`);
      values.push(invoiceId);
      parameterIndex++;
    }

    if (status) {
      if (!isStatus(status)) {
        return NextResponse.json(
          {
            error: `Invalid reminder status. Must be one of: ${VALID_STATUSES.join(", ")}`,
          },
          { status: 400 }
        );
      }
      conditions.push(`r.status = $${parameterIndex}`);
      values.push(status);
      parameterIndex++;
    }

    if (reminderType) {
      if (!isReminderType(reminderType)) {
        return NextResponse.json(
          {
            error: `Invalid reminder type. Must be one of: ${VALID_REMINDER_TYPES.join(", ")}`,
          },
          { status: 400 }
        );
      }
      conditions.push(`r.reminder_type = $${parameterIndex}`);
      values.push(reminderType);
      parameterIndex++;
    }

    if (fromDate) {
      conditions.push(`r.scheduled_at >= $${parameterIndex}`);
      values.push(fromDate);
      parameterIndex++;
    }

    if (toDate) {
      conditions.push(`r.scheduled_at <= $${parameterIndex}::date + INTERVAL '1 day'`);
      values.push(toDate);
      parameterIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count
    const countResult = await pool.query(
      `
        SELECT COUNT(*)::integer AS count
        FROM public.invoice_reminders r
        INNER JOIN public.invoices i ON i.id = r.invoice_id
        ${whereClause}
      `,
      values
    );

    const total = countResult.rows[0]?.count || 0;

    // Get reminders
    const dataValues = [...values, limit, offset];

    const result = await pool.query(
      `
        SELECT
          r.*,

          json_build_object(
            'id', i.id,
            'invoice_number', i.invoice_number,
            'status', i.status,
            'total_amount', i.total_amount,
            'amount_paid', i.amount_paid,
            'amount_due', i.amount_due,
            'currency', i.currency,
            'issue_date', i.issue_date,
            'due_date', i.due_date,
            'deleted_at', i.deleted_at
          ) AS invoice,

          json_build_object(
            'id', c.id,
            'company_name', c.company_name,
            'contact_name', c.contact_name,
            'email', c.email,
            'phone', c.phone,
            'billing_address', c.billing_address
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
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/reminders:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch invoice reminders",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices/reminders
|--------------------------------------------------------------------------
|
| Creates a new reminder for an invoice.
|
| Request body:
| {
|   invoice_id: string,
|   reminder_type: 'due_soon'|'overdue'|'follow_up'|'custom',
|   scheduled_at?: string,
|   email_subject?: string,
|   email_body?: string,
|   email_to: string,
|   email_cc?: string,
|   metadata?: object
| }
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();

    const {
      invoice_id,
      reminder_type,
      scheduled_at,
      email_subject,
      email_body,
      email_to,
      email_cc,
      metadata,
    } = body;

    if (!invoice_id) {
      return NextResponse.json(
        { error: "invoice_id is required" },
        { status: 400 }
      );
    }

    if (!isReminderType(reminder_type)) {
      return NextResponse.json(
        {
          error: `Invalid reminder_type. Must be one of: ${VALID_REMINDER_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (!email_to) {
      return NextResponse.json(
        { error: "email_to is required" },
        { status: 400 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      /*
      |--------------------------------------------------------------------------
      | Verify invoice
      |--------------------------------------------------------------------------
      */

      const invoiceResult = await client.query(
        `
          SELECT
            i.id,
            i.invoice_number,
            i.status,
            i.due_date,
            i.deleted_at,
            c.email AS customer_email,
            c.company_name
          FROM public.invoices i
          INNER JOIN public.customers c ON c.id = i.customer_id
          WHERE i.id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [invoice_id]
      );

      if ((invoiceResult.rowCount ?? 0) === 0) {
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
          { error: "Cannot create a reminder for a deleted invoice" },
          { status: 409 }
        );
      }

      if (invoice.status === "cancelled" || invoice.status === "void") {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Cannot create a reminder for a cancelled or void invoice" },
          { status: 400 }
        );
      }

      if (invoice.status === "paid") {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Cannot create a reminder for a paid invoice" },
          { status: 400 }
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Validate scheduled date
      |--------------------------------------------------------------------------
      */

      let scheduledAt = nullableString(scheduled_at);

      if (!scheduledAt) {
        // Default to now if not provided
        scheduledAt = new Date().toISOString();
      }

      const scheduledDate = new Date(scheduledAt);

      if (Number.isNaN(scheduledDate.getTime())) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Invalid scheduled_at" },
          { status: 400 }
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Create reminder
      |--------------------------------------------------------------------------
      */

      const result = await client.query(
        `
          INSERT INTO public.invoice_reminders (
            invoice_id,
            reminder_type,
            scheduled_at,
            email_subject,
            email_body,
            email_to,
            email_cc,
            status,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled', $8)
          RETURNING *
        `,
        [
          invoice_id,
          reminder_type,
          scheduledDate,
          nullableString(email_subject),
          nullableString(email_body),
          String(email_to),
          nullableString(email_cc),
          jsonValue(metadata, {}),
        ]
      );

      /*
      |--------------------------------------------------------------------------
      | Update invoice reminder tracking
      |--------------------------------------------------------------------------
      */

      await client.query(
        `
          UPDATE public.invoices
          SET
            reminder_count = reminder_count + 1,
            next_reminder_at = $1,
            updated_at = NOW()
          WHERE id = $2
        `,
        [scheduledDate, invoice_id]
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
          VALUES ($1, $2, $3, 'reminder_scheduled', $4)
        `,
        [
          invoice_id,
          user.id,
          user.fullName || user.email,
          jsonValue({
            reminder_id: result.rows[0].id,
            reminder_type,
            scheduled_at: scheduledDate,
            email_to: String(email_to),
          }, {}),
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
          VALUES ($1, 'reminder_scheduled', $2)
        `,
        [
          invoice_id,
          jsonValue({
            reminder_id: result.rows[0].id,
            reminder_type,
            scheduled_at: scheduledDate,
            email_to: String(email_to),
            invoice_number: invoice.invoice_number,
            created_by: user.id,
          }, {}),
        ]
      );

      await client.query("COMMIT");

      return NextResponse.json(
        {
          success: true,
          reminder: result.rows[0],
        },
        { status: 201 }
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("POST /api/invoices/reminders:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create invoice reminder",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| PATCH /api/invoices/reminders
|--------------------------------------------------------------------------
|
| Updates a reminder. Only scheduled reminders can be updated.
|
| Request body:
| {
|   id: string,
|   reminder_type?: string,
|   scheduled_at?: string,
|   email_subject?: string,
|   email_body?: string,
|   email_to?: string,
|   email_cc?: string,
|   status?: string,
|   error_message?: string
| }
|--------------------------------------------------------------------------
*/

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();

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
      metadata,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Reminder ID is required" },
        { status: 400 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Get existing reminder
      const existingResult = await client.query(
        `
          SELECT *
          FROM public.invoice_reminders
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if ((existingResult.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Invoice reminder not found" },
          { status: 404 }
        );
      }

      const existing = existingResult.rows[0];

      // Only allow updates for scheduled reminders
      if (existing.status === "sent" && status !== "sent") {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "A sent reminder cannot be modified" },
          { status: 400 }
        );
      }

      if (existing.status === "cancelled") {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "A cancelled reminder cannot be modified" },
          { status: 400 }
        );
      }

      // Validate reminder type
      if (reminder_type !== undefined && !isReminderType(reminder_type)) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error: `Invalid reminder_type. Must be one of: ${VALID_REMINDER_TYPES.join(", ")}`,
          },
          { status: 400 }
        );
      }

      // Validate status
      if (status !== undefined && !isStatus(status)) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
          },
          { status: 400 }
        );
      }

      // Parse scheduled date
      let scheduledDate = existing.scheduled_at;

      if (scheduled_at !== undefined) {
        if (scheduled_at === null || scheduled_at === "") {
          scheduledDate = null;
        } else {
          const parsed = new Date(scheduled_at);
          if (Number.isNaN(parsed.getTime())) {
            await client.query("ROLLBACK");

            return NextResponse.json(
              { error: "Invalid scheduled_at" },
              { status: 400 }
            );
          }
          scheduledDate = parsed;
        }
      }

      const newStatus = status !== undefined ? status : existing.status;

      // Update reminder
      const result = await client.query(
        `
          UPDATE public.invoice_reminders
          SET
            reminder_type = COALESCE($1, reminder_type),
            scheduled_at = $2,
            email_subject = COALESCE($3, email_subject),
            email_body = COALESCE($4, email_body),
            email_to = COALESCE($5, email_to),
            email_cc = COALESCE($6, email_cc),
            status = $7,
            error_message = CASE
              WHEN $8::text IS NOT NULL THEN $8
              ELSE error_message
            END,
            metadata = CASE
              WHEN $9::jsonb IS NOT NULL THEN metadata || $9
              ELSE metadata
            END,
            updated_at = NOW()
          WHERE id = $10
          RETURNING *
        `,
        [
          reminder_type ?? null,
          scheduledDate,
          nullableString(email_subject),
          nullableString(email_body),
          nullableString(email_to),
          nullableString(email_cc),
          newStatus,
          nullableString(error_message),
          metadata ? jsonValue(metadata, {}) : null,
          id,
        ]
      );

      // If status changed to sent or failed, update invoice
      if (newStatus === "sent" || newStatus === "failed") {
        await client.query(
          `
            UPDATE public.invoices
            SET
              last_reminder_sent_at = CASE
                WHEN $1 = 'sent' THEN NOW()
                ELSE last_reminder_sent_at
              END,
              updated_at = NOW()
            WHERE id = $2
          `,
          [newStatus, existing.invoice_id]
        );
      }

      // Activity log
      const action = newStatus === "sent" ? "reminder_sent" :
                     newStatus === "failed" ? "reminder_failed" :
                     newStatus === "cancelled" ? "reminder_cancelled" :
                     "reminder_updated";

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
          existing.invoice_id,
          user.id,
          user.fullName || user.email,
          action,
          jsonValue({
            reminder_id: id,
            previous_status: existing.status,
            new_status: newStatus,
          }, {}),
        ]
      );

      // Create event for webhooks on status change
      if (newStatus === "sent") {
        await client.query(
          `
            INSERT INTO public.invoice_events (
              invoice_id,
              event_type,
              payload
            )
            VALUES ($1, 'reminder_sent', $2)
          `,
          [
            existing.invoice_id,
            jsonValue({
              reminder_id: id,
              reminder_type: result.rows[0].reminder_type,
              email_to: result.rows[0].email_to,
              sent_at: new Date().toISOString(),
            }, {}),
          ]
        );
      }

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        reminder: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("PATCH /api/invoices/reminders:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update invoice reminder",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| DELETE /api/invoices/reminders
|--------------------------------------------------------------------------
|
| Cancels a reminder (soft delete via status = 'cancelled').
| Only scheduled reminders can be cancelled.
|
| ?id=UUID
|--------------------------------------------------------------------------
*/

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);

    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Reminder ID is required" },
        { status: 400 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const existingResult = await client.query(
        `
          SELECT id, invoice_id, status
          FROM public.invoice_reminders
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if ((existingResult.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Invoice reminder not found" },
          { status: 404 }
        );
      }

      const existing = existingResult.rows[0];

      // Only scheduled reminders can be cancelled
      if (existing.status === "sent") {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "A sent reminder cannot be cancelled" },
          { status: 400 }
        );
      }

      if (existing.status === "cancelled") {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Reminder is already cancelled" },
          { status: 409 }
        );
      }

      // Cancel the reminder
      const result = await client.query(
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
          VALUES ($1, $2, $3, 'reminder_cancelled', $4)
        `,
        [
          existing.invoice_id,
          user.id,
          user.fullName || user.email,
          jsonValue({
            reminder_id: id,
            previous_status: existing.status,
          }, {}),
        ]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        message: "Reminder cancelled successfully",
        reminder: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("DELETE /api/invoices/reminders:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to cancel invoice reminder",
      },
      { status: 500 }
    );
  }
}