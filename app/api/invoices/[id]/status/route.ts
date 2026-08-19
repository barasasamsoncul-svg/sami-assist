import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| Status Transition Rules
|--------------------------------------------------------------------------
*/

const VALID_STATUSES = [
  "draft",
  "pending_approval",
  "sent",
  "viewed",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled",
  "void",
] as const;

type InvoiceStatus = typeof VALID_STATUSES[number];

// Allowed transitions: from → [to]
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ["pending_approval", "sent", "cancelled", "void"],
  pending_approval: ["sent", "cancelled", "void"],
  sent: ["viewed", "overdue", "partially_paid", "paid", "cancelled", "void"],
  viewed: ["overdue", "partially_paid", "paid", "cancelled", "void"],
  partially_paid: ["paid", "overdue", "cancelled", "void"],
  paid: ["cancelled"], // Only through credit note
  overdue: ["partially_paid", "paid", "cancelled", "void"],
  cancelled: [], // Terminal state
  void: [], // Terminal state
};

function getStatusDisplayName(status: InvoiceStatus): string {
  const names: Record<InvoiceStatus, string> = {
    draft: "Draft",
    pending_approval: "Pending Approval",
    sent: "Sent",
    viewed: "Viewed",
    partially_paid: "Partially Paid",
    paid: "Paid",
    overdue: "Overdue",
    cancelled: "Cancelled",
    void: "Void",
  };
  return names[status] || status;
}

/*
|--------------------------------------------------------------------------
| PATCH /api/invoices/[id]/status
|--------------------------------------------------------------------------
|
| Updates invoice status with full validation.
|
| Request body:
| {
|   status: string,
|   reason?: string,
|   send_notification?: boolean,
|   metadata?: object
| }
|--------------------------------------------------------------------------
*/

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { status: newStatus, reason, send_notification, metadata } = body;
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    if (!newStatus) {
      return NextResponse.json(
        { error: "Status is required" },
        { status: 400 }
      );
    }

    if (!VALID_STATUSES.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if invoice exists and get current state
      const checkResult = await client.query(
        `
          SELECT
            i.*,
            c.id AS customer_id,
            c.company_name,
            c.email AS customer_email
          FROM public.invoices i
          INNER JOIN public.customers c
            ON c.id = i.customer_id
          WHERE i.id = $1
            AND i.deleted_at IS NULL
          FOR UPDATE
        `,
        [id]
      );

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Invoice not found" },
          { status: 404 }
        );
      }

      const invoice = checkResult.rows[0];
      const currentStatus = invoice.status as InvoiceStatus;

      // Check if status transition is allowed
      const allowedTransitions = ALLOWED_TRANSITIONS[currentStatus] || [];

      // Special case: paid → cancelled requires credit note
      if (currentStatus === "paid" && newStatus === "cancelled") {
        // Check if a credit note exists for this invoice
        const creditNoteResult = await client.query(
          `
            SELECT id, status
            FROM public.credit_notes
            WHERE invoice_id = $1
              AND status = 'applied'
            LIMIT 1
          `,
          [id]
        );

        if (creditNoteResult.rows.length === 0) {
          await client.query("ROLLBACK");

          return NextResponse.json(
            {
              error: "Cannot cancel a paid invoice. A credit note must be created and applied first.",
            },
            { status: 409 }
          );
        }
      }

      if (!allowedTransitions.includes(newStatus as InvoiceStatus)) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error: `Cannot transition from "${currentStatus}" to "${newStatus}". Allowed transitions: ${allowedTransitions.join(", ") || "none"}`,
            allowed_transitions: allowedTransitions,
          },
          { status: 400 }
        );
      }

      // Build update object
      const updates: string[] = [`status = $1`];
      const values: any[] = [newStatus];
      let paramCount = 2;

      // Add timestamps based on status
      if (newStatus === "sent" && currentStatus !== "sent") {
        updates.push(`sent_at = NOW()`);
      }

      if (newStatus === "viewed" && currentStatus !== "viewed") {
        updates.push(`viewed_at = NOW()`);
      }

      if (newStatus === "pending_approval" && currentStatus !== "pending_approval") {
        updates.push(`approved_at = NOW()`);
      }

      if (newStatus === "paid" && currentStatus !== "paid") {
        // Check if payment exists
        const paymentCheck = await client.query(
          `
            SELECT MAX(payment_date) AS last_payment_date
            FROM public.payments
            WHERE invoice_id = $1
              AND status = 'completed'
          `,
          [id]
        );

        if (paymentCheck.rows[0]?.last_payment_date) {
          updates.push(`payment_date = $${paramCount}::DATE`);
          values.push(paymentCheck.rows[0].last_payment_date);
          paramCount++;
        } else {
          updates.push(`payment_date = CURRENT_DATE`);
        }
      }

      // Handle cancellation/void
      if (newStatus === "cancelled" || newStatus === "void") {
        updates.push(`cancelled_by = $${paramCount}`);
        values.push(user.id);
        paramCount++;

        const cancelReason = reason || (newStatus === "void" ? "Invoice voided" : "Invoice cancelled");
        updates.push(`cancelled_reason = $${paramCount}`);
        values.push(cancelReason);
        paramCount++;

        if (newStatus === "void") {
          updates.push(`deleted_at = NOW()`);
          updates.push(`deleted_by = $${paramCount}`);
          values.push(user.id);
          paramCount++;
        }
      }

      // Add metadata if provided
      if (metadata) {
        updates.push(`metadata = metadata || $${paramCount}`);
        values.push(jsonValue(metadata, {}));
        paramCount++;
      }

      updates.push(`updated_at = NOW()`);
      updates.push(`id = $${paramCount}`);
      values.push(id);

      // Execute update
      const query = `
        UPDATE public.invoices
        SET ${updates.join(", ")}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await client.query(query, values);

      // Insert status history
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
          currentStatus,
          newStatus,
          user.id,
          reason || null,
        ]
      );

      // Log activity
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
          `status_updated_to_${newStatus}`,
          jsonValue({
            previous_status: currentStatus,
            new_status: newStatus,
            reason: reason || null,
            updated_at: new Date().toISOString(),
          }, {}),
        ]
      );

      // Create event for webhooks
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
          newStatus === "sent" ? "invoice_sent" :
          newStatus === "paid" ? "invoice_paid" :
          newStatus === "overdue" ? "invoice_overdue" :
          newStatus === "cancelled" ? "invoice_cancelled" :
          newStatus === "void" ? "invoice_voided" :
          "status_changed",
          jsonValue({
            invoice_id: id,
            invoice_number: invoice.invoice_number,
            previous_status: currentStatus,
            new_status: newStatus,
            reason: reason || null,
            customer_id: invoice.customer_id,
            customer_name: invoice.company_name,
            customer_email: invoice.customer_email,
            total_amount: invoice.total_amount,
            amount_due: invoice.amount_due,
            changed_by: user.id,
            changed_at: new Date().toISOString(),
          }, {}),
        ]
      );

      // Send notification if requested
      if (send_notification === true && newStatus === "sent") {
        // This would call your email/WhatsApp service
        // For now, just log it
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
            "notification_requested",
            jsonValue({
              type: "invoice_sent",
              status: newStatus,
              customer_email: invoice.customer_email,
            }, {}),
          ]
        );
      }

      await client.query("COMMIT");

      // Return updated invoice with status history
      const finalResult = await pool.query(
        `
          SELECT
            i.*,

            json_build_object(
              'id', c.id,
              'company_name', c.company_name,
              'contact_name', c.contact_name,
              'email', c.email,
              'phone', c.phone
            ) AS customer,

            (
              SELECT json_agg(
                json_build_object(
                  'from_status', sh.from_status,
                  'to_status', sh.to_status,
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
        [id]
      );

      const responseData = {
        success: true,
        invoice: finalResult.rows[0],
        message: `Invoice status updated from "${getStatusDisplayName(currentStatus)}" to "${getStatusDisplayName(newStatus as InvoiceStatus)}"`,
        transition: {
          from: currentStatus,
          to: newStatus,
          allowed: true,
        },
      };

      // Add warnings if applicable
      if (currentStatus === "paid" && newStatus === "cancelled") {
        (responseData as any).warning =
          "Invoice was paid. Cancellation was allowed because a credit note exists.";
      }

      return NextResponse.json(responseData);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Status update error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update status",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| GET /api/invoices/[id]/status
|--------------------------------------------------------------------------
|
| Returns current status and available transitions for an invoice.
|--------------------------------------------------------------------------
*/

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const result = await pool.query(
      `
        SELECT
          i.id,
          i.invoice_number,
          i.status,
          i.cancelled_by,
          i.cancelled_reason,
          i.sent_at,
          i.viewed_at,
          i.approved_at,
          i.payment_date,
          i.created_at,

          (
            SELECT json_agg(
              json_build_object(
                'from_status', sh.from_status,
                'to_status', sh.to_status,
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
        WHERE i.id = $1
          AND i.deleted_at IS NULL
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const invoice = result.rows[0];
    const currentStatus = invoice.status as InvoiceStatus;

    // Calculate available transitions
    const availableTransitions = ALLOWED_TRANSITIONS[currentStatus] || [];

    // Special case: paid → cancelled requires credit note
    let requiresCreditNote = false;
    if (currentStatus === "paid" && availableTransitions.includes("cancelled")) {
      const creditNoteResult = await pool.query(
        `
          SELECT COUNT(*) > 0 AS has_credit_note
          FROM public.credit_notes
          WHERE invoice_id = $1
            AND status = 'applied'
        `,
        [id]
      );

      requiresCreditNote = !creditNoteResult.rows[0]?.has_credit_note;
    }

    return NextResponse.json({
      success: true,
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        current_status: currentStatus,
        status_display: getStatusDisplayName(currentStatus),
        timestamps: {
          sent_at: invoice.sent_at,
          viewed_at: invoice.viewed_at,
          approved_at: invoice.approved_at,
          payment_date: invoice.payment_date,
          created_at: invoice.created_at,
        },
        cancellation: invoice.cancelled_by
          ? {
              cancelled_by: invoice.cancelled_by,
              cancelled_reason: invoice.cancelled_reason,
            }
          : null,
        status_history: invoice.status_history || [],
      },
      available_transitions: availableTransitions.map((status) => ({
        status,
        display: getStatusDisplayName(status),
        requires_credit_note: status === "cancelled" && requiresCreditNote,
      })),
      requires_credit_note: requiresCreditNote,
    });
  } catch (error) {
    console.error("Status fetch error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch status",
      },
      { status: 500 }
    );
  }
}