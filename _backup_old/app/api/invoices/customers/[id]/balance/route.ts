import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| GET /api/invoices/customers/[id]/balance
|--------------------------------------------------------------------------
|
| Returns customer balance and outstanding summary.
|--------------------------------------------------------------------------
*/

export async function GET(req: NextRequest, { params }: Context) {
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
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    // Check if customer exists
    const customerCheck = await pool.query(
      `
        SELECT id, company_name, credit_limit
        FROM public.customers
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [id]
    );

    if (customerCheck.rows.length === 0) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    const customer = customerCheck.rows[0];

    // Get outstanding balance
    const balanceResult = await pool.query(
      `
        SELECT
          COALESCE(SUM(amount_due), 0) AS total_outstanding,
          COALESCE(SUM(CASE
            WHEN due_date < CURRENT_DATE THEN amount_due
            ELSE 0
          END), 0) AS overdue_amount,
          COUNT(*) AS invoice_count,
          COUNT(CASE
            WHEN due_date < CURRENT_DATE AND amount_due > 0 THEN 1
          END) AS overdue_invoice_count,
          COALESCE(SUM(CASE
            WHEN status = 'partially_paid' THEN amount_due
            ELSE 0
          END), 0) AS partially_paid_amount,
          COALESCE(SUM(total_amount), 0) AS total_invoiced,
          COALESCE(SUM(amount_paid), 0) AS total_paid
        FROM public.invoices
        WHERE customer_id = $1
          AND status NOT IN ('paid', 'cancelled', 'void')
          AND deleted_at IS NULL
      `,
      [id]
    );

    const balance = balanceResult.rows[0];

    return NextResponse.json({
      success: true,
      customer: {
        id: customer.id,
        company_name: customer.company_name,
        credit_limit: customer.credit_limit,
      },
      balance: {
        total_outstanding: Number(balance.total_outstanding),
        overdue_amount: Number(balance.overdue_amount),
        partially_paid_amount: Number(balance.partially_paid_amount),
        total_invoiced: Number(balance.total_invoiced),
        total_paid: Number(balance.total_paid),
        invoice_count: Number(balance.invoice_count),
        overdue_invoice_count: Number(balance.overdue_invoice_count),
      },
      credit_limit_exceeded: customer.credit_limit !== null &&
        Number(balance.total_outstanding) > Number(customer.credit_limit),
    });
  } catch (error) {
    console.error("GET /api/invoices/customers/[id]/balance:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch customer balance",
      },
      { status: 500 }
    );
  }
}