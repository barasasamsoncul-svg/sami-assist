import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| POST /api/invoices/reminders/[id]/send
|--------------------------------------------------------------------------
|
| Manually send a reminder.
| This updates the reminder status to 'sent' and logs the action.
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest, { params }: Context) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Reminder ID is required" },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const existingResult = await client.query(
        `
          SELECT *
          FROM public.invoice_reminders
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if (existingResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Reminder not found" },
          { status: 404 }
        );
      }

      const existing = existingResult.rows[0];

      if (existing.status === "sent") {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Reminder has already been sent" },
          { status: 409 }
        );
      }

      if (existing.status === "cancelled") {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Cannot send a cancelled reminder" },
          { status: 409 }
        );
      }

      // Update reminder status to sent
      const result = await client.query(
        `
          UPDATE public.invoice_reminders
          SET
            status = 'sent',
            sent_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [id]
      );

      // Update invoice
      await client.query(
        `
          UPDATE public.invoices
          SET
            last_reminder_sent_at = NOW(),
            reminder_count = reminder_count + 1,
            updated_at = NOW()
          WHERE id = $1
        `,
        [existing.invoice_id]
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
          VALUES ($1, $2, $3, 'reminder_sent', $4)
        `,
        [
          existing.invoice_id,
          user.id,
          user.fullName || user.email,
          {
            reminder_id: id,
            reminder_type: existing.reminder_type,
            email_to: existing.email_to,
          },
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
          VALUES ($1, 'reminder_sent', $2)
        `,
        [
          existing.invoice_id,
          {
            reminder_id: id,
            reminder_type: existing.reminder_type,
            email_to: existing.email_to,
            sent_by: user.id,
            sent_at: new Date().toISOString(),
          },
        ]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        message: "Reminder sent successfully",
        reminder: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("POST /api/invoices/reminders/[id]/send:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to send reminder",
      },
      { status: 500 }
    );
  }
}