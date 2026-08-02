import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const ALLOWED_PAYMENT_STATUSES = [
  "completed",
  "pending",
  "failed",
  "refunded",
];

const ALLOWED_PAYMENT_METHODS = [
  "cash",
  "mpesa",
  "bank_transfer",
  "card",
  "cheque",
  "other",
];

// ==========================================
// GET PAYMENT HISTORY
// ==========================================

export async function GET(
  _req: Request,
  context: RouteContext
) {
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

    const { id: invoiceId } =
      await context.params;

    const invoiceResult =
      await pool.query(
        `
        SELECT
          id,
          invoice_number,
          total_amount,
          amount_paid,
          amount_due,
          status
        FROM invoices
        WHERE id = $1
        LIMIT 1
        `,
        [invoiceId]
      );

    if (invoiceResult.rowCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Invoice not found",
        },
        { status: 404 }
      );
    }

    const paymentsResult =
      await pool.query(
        `
        SELECT
          id,
          amount,
          payment_method,
          transaction_reference,
          payment_date,
          status,
          notes,
          created_at
        FROM payments
        WHERE invoice_id = $1
        ORDER BY payment_date DESC, created_at DESC
        `,
        [invoiceId]
      );

    return NextResponse.json({
      success: true,
      invoice: invoiceResult.rows[0],
      payments: paymentsResult.rows,
    });
  } catch (error) {
    console.error(
      "Get invoice payments API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load payments",
      },
      { status: 500 }
    );
  }
}

// ==========================================
// RECORD PAYMENT
// ==========================================

export async function POST(
  req: Request,
  context: RouteContext
) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id: invoiceId } =
      await context.params;

    const body = await req.json();

    const {
      amount,
      payment_method = "other",
      transaction_reference,
      payment_date,
      status = "completed",
      notes,
    } = body;

    // ==========================================
    // VALIDATE AMOUNT
    // ==========================================

    const paymentAmount = Number(amount);

    if (
      !Number.isFinite(paymentAmount) ||
      paymentAmount <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Payment amount must be greater than zero",
        },
        { status: 400 }
      );
    }

    // ==========================================
    // VALIDATE PAYMENT METHOD
    // ==========================================

    if (
      !ALLOWED_PAYMENT_METHODS.includes(
        payment_method
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid payment method",
        },
        { status: 400 }
      );
    }

    // ==========================================
    // VALIDATE PAYMENT STATUS
    // ==========================================

    if (
      !ALLOWED_PAYMENT_STATUSES.includes(
        status
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid payment status",
        },
        { status: 400 }
      );
    }

    const { pool } =
      await getTenantDatabaseForUser(user.id);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // ==========================================
      // LOCK INVOICE
      // ==========================================

      const invoiceResult =
        await client.query(
          `
          SELECT
            id,
            invoice_number,
            total_amount,
            amount_paid,
            amount_due,
            status
          FROM invoices
          WHERE id = $1
          FOR UPDATE
          `,
          [invoiceId]
        );

      if (invoiceResult.rowCount === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            success: false,
            error: "Invoice not found",
          },
          { status: 404 }
        );
      }

      const invoice =
        invoiceResult.rows[0];

      // ==========================================
      // DON'T ACCEPT PAYMENTS ON CANCELLED INVOICES
      // ==========================================

      if (
        invoice.status === "cancelled"
      ) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            success: false,
            error:
              "Cannot record a payment against a cancelled invoice",
          },
          { status: 400 }
        );
      }

      // ==========================================
      // DON'T OVERPAY THE INVOICE
      // ==========================================

      const currentAmountDue =
        Number(invoice.amount_due);

      if (
        paymentAmount >
        currentAmountDue
      ) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            success: false,
            error:
              "Payment cannot be greater than the outstanding invoice balance",
            amount_due: currentAmountDue,
            attempted_payment:
              paymentAmount,
          },
          { status: 400 }
        );
      }

      // ==========================================
      // INSERT PAYMENT
      // ==========================================

      const paymentResult =
        await client.query(
          `
          INSERT INTO payments (
            invoice_id,
            amount,
            payment_method,
            transaction_reference,
            payment_date,
            status,
            notes
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            COALESCE($5::timestamptz, NOW()),
            $6,
            $7
          )
          RETURNING *
          `,
          [
            invoiceId,
            paymentAmount,
            payment_method,
            transaction_reference
              ? String(
                  transaction_reference
                ).trim()
              : null,
            payment_date || null,
            status,
            notes
              ? String(notes).trim()
              : null,
          ]
        );

      // ==========================================
      // RECALCULATE COMPLETED PAYMENTS
      // ==========================================

      const totalsResult =
        await client.query(
          `
          SELECT
            COALESCE(
              SUM(
                CASE
                  WHEN status = 'completed'
                  THEN amount
                  ELSE 0
                END
              ),
              0
            ) AS amount_paid
          FROM payments
          WHERE invoice_id = $1
          `,
          [invoiceId]
        );

      const amountPaid =
        Number(
          totalsResult.rows[0].amount_paid
        );

      const totalAmount =
        Number(invoice.total_amount);

      const amountDue =
        Math.max(
          totalAmount - amountPaid,
          0
        );

      // ==========================================
      // DETERMINE INVOICE STATUS
      // ==========================================

      let invoiceStatus =
        invoice.status;

      if (amountDue <= 0) {
        invoiceStatus = "paid";
      } else if (amountPaid > 0) {
        invoiceStatus = "partial";
      } else if (
        invoice.status === "paid" ||
        invoice.status === "partial"
      ) {
        invoiceStatus = "sent";
      }

      // ==========================================
      // UPDATE INVOICE BALANCE
      // ==========================================

      const updatedInvoiceResult =
        await client.query(
          `
          UPDATE invoices
          SET
            amount_paid = $1,
            amount_due = $2,
            status = $3,
            updated_at = NOW()
          WHERE id = $4
          RETURNING *
          `,
          [
            amountPaid,
            amountDue,
            invoiceStatus,
            invoiceId,
          ]
        );

      await client.query("COMMIT");

      return NextResponse.json(
        {
          success: true,
          payment:
            paymentResult.rows[0],
          invoice:
            updatedInvoiceResult.rows[0],
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
    console.error(
      "Record invoice payment API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to record payment",
      },
      { status: 500 }
    );
  }
}
