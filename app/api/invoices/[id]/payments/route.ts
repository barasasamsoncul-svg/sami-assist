import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = {
  params: Promise<{ id: string }>;
};

// GET /api/invoices/[id]/payments
// Returns all payments belonging to one invoice.
export async function GET(
  req: NextRequest,
  { params }: Context,
) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { pool } =
      await getTenantDatabaseForUser(user.id);

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 },
      );
    }

    /*
     * Verify that the invoice exists.
     */
    const invoiceCheck = await pool.query(
      `
      SELECT
        id,
        invoice_number,
        total_amount,
        amount_paid,
        amount_due,
        currency,
        status
      FROM invoices
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );

    if (invoiceCheck.rows.length === 0) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 },
      );
    }

    /*
     * Get payments for this invoice.
     */
    const result = await pool.query(
      `
      SELECT
        id,
        invoice_id,
        amount,
        currency,
        exchange_rate,
        payment_method,
        payment_method_details,
        transaction_reference,
        payment_date,
        status,
        reconciled,
        reconciled_at,
        reconciled_by,
        notes,
        metadata,
        created_at,
        updated_at
      FROM payments
      WHERE invoice_id = $1
      ORDER BY payment_date DESC, created_at DESC
      `,
      [id],
    );

    /*
     * Calculate totals from completed payments.
     */
    const completedResult = await pool.query(
      `
      SELECT
        COALESCE(SUM(amount), 0) AS total_paid,
        COUNT(*) AS payment_count
      FROM payments
      WHERE invoice_id = $1
        AND status = 'completed'
      `,
      [id],
    );

    const invoice = invoiceCheck.rows[0];
    const paymentSummary = completedResult.rows[0];

    return NextResponse.json({
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        total_amount: invoice.total_amount,
        amount_paid: invoice.amount_paid,
        amount_due: invoice.amount_due,
        currency: invoice.currency,
        status: invoice.status,
      },

      payments: result.rows,

      summary: {
        total_paid: Number(
          paymentSummary.total_paid || 0,
        ),
        payment_count: Number(
          paymentSummary.payment_count || 0,
        ),
      },
    });
  } catch (error) {
    console.error(
      "Invoice payments fetch error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch payments",
      },
      { status: 500 },
    );
  }
}