import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } =
      await getTenantDatabaseForUser(user.id);

    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total_invoices,

        COUNT(*) FILTER (
          WHERE status = 'draft'
        )::int AS draft_invoices,

        COUNT(*) FILTER (
          WHERE status = 'sent'
        )::int AS sent_invoices,

        COUNT(*) FILTER (
          WHERE status = 'partial'
        )::int AS partial_invoices,

        COUNT(*) FILTER (
          WHERE status = 'paid'
        )::int AS paid_invoices,

        COUNT(*) FILTER (
          WHERE status = 'overdue'
        )::int AS overdue_invoices,

        COUNT(*) FILTER (
          WHERE status = 'cancelled'
        )::int AS cancelled_invoices,

        COALESCE(
          SUM(total_amount)
          FILTER (
            WHERE status <> 'cancelled'
          ),
          0
        ) AS total_invoiced,

        COALESCE(
          SUM(amount_paid)
          FILTER (
            WHERE status <> 'cancelled'
          ),
          0
        ) AS total_collected,

        COALESCE(
          SUM(amount_due)
          FILTER (
            WHERE status <> 'cancelled'
          ),
          0
        ) AS total_outstanding

      FROM invoices
    `);

    const stats = result.rows[0];

    return NextResponse.json({
      success: true,
      stats: {
        total_invoices:
          Number(stats.total_invoices),

        draft_invoices:
          Number(stats.draft_invoices),

        sent_invoices:
          Number(stats.sent_invoices),

        partial_invoices:
          Number(stats.partial_invoices),

        paid_invoices:
          Number(stats.paid_invoices),

        overdue_invoices:
          Number(stats.overdue_invoices),

        cancelled_invoices:
          Number(stats.cancelled_invoices),

        total_invoiced:
          Number(stats.total_invoiced),

        total_collected:
          Number(stats.total_collected),

        total_outstanding:
          Number(stats.total_outstanding),
      },
    });
  } catch (error) {
    console.error(
      "Invoice stats API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load invoice statistics",
      },
      { status: 500 }
    );
  }
}
