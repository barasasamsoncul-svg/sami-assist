import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// ==========================================
// GET ONE INVOICE
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

    const { id } = await context.params;

    const result = await pool.query(
      `
      SELECT
        i.id,
        i.invoice_number,
        i.issue_date,
        i.due_date,
        i.status,
        i.subtotal,
        i.tax_amount,
        i.total_amount,
        i.amount_paid,
        i.amount_due,
        i.notes,
        i.created_at,
        i.updated_at,

        json_build_object(
          'id', c.id,
          'company_name', c.company_name,
          'contact_name', c.contact_name,
          'email', c.email,
          'phone', c.phone,
          'address', c.address
        ) AS customer,

        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', ii.id,
                'description', ii.description,
                'quantity', ii.quantity,
                'unit_price', ii.unit_price,
                'tax_rate', ii.tax_rate,
                'tax_amount', ii.tax_amount,
                'line_total', ii.line_total
              )
              ORDER BY ii.created_at ASC
            )
            FROM invoice_items ii
            WHERE ii.invoice_id = i.id
          ),
          '[]'::json
        ) AS invoice_items,

        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', p.id,
                'amount', p.amount,
                'payment_method', p.payment_method,
                'transaction_reference',
                  p.transaction_reference,
                'payment_date', p.payment_date,
                'status', p.status,
                'notes', p.notes,
                'created_at', p.created_at
              )
              ORDER BY p.payment_date DESC
            )
            FROM payments p
            WHERE p.invoice_id = i.id
          ),
          '[]'::json
        ) AS payments

      FROM invoices i

      INNER JOIN customers c
        ON c.id = i.customer_id

      WHERE i.id = $1

      LIMIT 1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Invoice not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      invoice: result.rows[0],
    });
  } catch (error) {
    console.error(
      "Get invoice API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load invoice",
      },
      { status: 500 }
    );
  }
}

// ==========================================
// UPDATE INVOICE
// ==========================================

export async function PATCH(
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

    const { id } = await context.params;

    const body = await req.json();

    const {
      customer_id,
      issue_date,
      due_date,
      notes,
      status,
      items,
    } = body;

    const { pool } =
      await getTenantDatabaseForUser(user.id);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // ==========================================
      // CHECK INVOICE
      // ==========================================

      const invoiceCheck =
        await client.query(
          `
          SELECT
            id,
            invoice_number,
            amount_paid
          FROM invoices
          WHERE id = $1
          FOR UPDATE
          `,
          [id]
        );

      if (invoiceCheck.rowCount === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            success: false,
            error: "Invoice not found",
          },
          { status: 404 }
        );
      }

      const existingInvoice =
        invoiceCheck.rows[0];

      // ==========================================
      // CUSTOMER
      // ==========================================

      if (customer_id) {
        const customerCheck =
          await client.query(
            `
            SELECT id
            FROM customers
            WHERE id = $1
            LIMIT 1
            `,
            [customer_id]
          );

        if (customerCheck.rowCount === 0) {
          await client.query("ROLLBACK");

          return NextResponse.json(
            {
              success: false,
              error: "Customer not found",
            },
            { status: 404 }
          );
        }
      }

      // ==========================================
      // STATUS VALIDATION
      // ==========================================

      const allowedStatuses = [
        "draft",
        "sent",
        "paid",
        "partial",
        "overdue",
        "cancelled",
      ];

      if (
        status !== undefined &&
        !allowedStatuses.includes(status)
      ) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            success: false,
            error:
              "Invalid invoice status",
          },
          { status: 400 }
        );
      }

      // ==========================================
      // UPDATE ITEMS IF PROVIDED
      // ==========================================

      let subtotal: number | null = null;
      let taxAmount: number | null = null;
      let totalAmount: number | null = null;

      if (items !== undefined) {
        if (
          !Array.isArray(items) ||
          items.length === 0
        ) {
          await client.query("ROLLBACK");

          return NextResponse.json(
            {
              success: false,
              error:
                "Invoice must contain at least one item",
            },
            { status: 400 }
          );
        }

        const preparedItems = [];

        for (const item of items) {
          const description = String(
            item.description ?? ""
          ).trim();

          const quantity =
            Number(item.quantity);

          const unitPrice =
            Number(item.unit_price);

          const taxRate =
            Number(item.tax_rate ?? 0);

          if (!description) {
            await client.query("ROLLBACK");

            return NextResponse.json(
              {
                success: false,
                error:
                  "Each invoice item requires a description",
              },
              { status: 400 }
            );
          }

          if (
            !Number.isFinite(quantity) ||
            quantity <= 0
          ) {
            await client.query("ROLLBACK");

            return NextResponse.json(
              {
                success: false,
                error:
                  "Quantity must be greater than zero",
              },
              { status: 400 }
            );
          }

          if (
            !Number.isFinite(unitPrice) ||
            unitPrice < 0
          ) {
            await client.query("ROLLBACK");

            return NextResponse.json(
              {
                success: false,
                error:
                  "Unit price must be zero or greater",
              },
              { status: 400 }
            );
          }

          if (
            !Number.isFinite(taxRate) ||
            taxRate < 0 ||
            taxRate > 100
          ) {
            await client.query("ROLLBACK");

            return NextResponse.json(
              {
                success: false,
                error:
                  "Tax rate must be between 0 and 100",
              },
              { status: 400 }
            );
          }

          const lineSubtotal =
            quantity * unitPrice;

          const lineTax =
            lineSubtotal *
            (taxRate / 100);

          const lineTotal =
            lineSubtotal + lineTax;

          preparedItems.push({
            description,
            quantity,
            unitPrice,
            taxRate,
            taxAmount: lineTax,
            lineTotal,
          });
        }

        subtotal =
          preparedItems.reduce(
            (sum, item) =>
              sum +
              item.quantity *
                item.unitPrice,
            0
          );

        taxAmount =
          preparedItems.reduce(
            (sum, item) =>
              sum + item.taxAmount,
            0
          );

        totalAmount =
          subtotal + taxAmount;

        await client.query(
          `
          DELETE FROM invoice_items
          WHERE invoice_id = $1
          `,
          [id]
        );

        for (const item of preparedItems) {
          await client.query(
            `
            INSERT INTO invoice_items (
              invoice_id,
              description,
              quantity,
              unit_price,
              tax_rate,
              tax_amount,
              line_total
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
            `,
            [
              id,
              item.description,
              item.quantity,
              item.unitPrice,
              item.taxRate,
              item.taxAmount,
              item.lineTotal,
            ]
          );
        }
      }

      // ==========================================
      // PRESERVE AMOUNT PAID
      // ==========================================

      const amountPaid =
        Number(existingInvoice.amount_paid);

      const finalTotal =
        totalAmount ??
        Number(
          (
            await client.query(
              `
              SELECT total_amount
              FROM invoices
              WHERE id = $1
              `,
              [id]
            )
          ).rows[0].total_amount
        );

      const amountDue =
        Math.max(
          finalTotal - amountPaid,
          0
        );

      // ==========================================
      // UPDATE INVOICE
      // ==========================================

      const updateResult =
        await client.query(
          `
          UPDATE invoices
          SET
            customer_id =
              COALESCE($1, customer_id),

            issue_date =
              COALESCE($2::date, issue_date),

            due_date =
              CASE
                WHEN $3::text IS NULL
                  THEN due_date
                ELSE $3::date
              END,

            notes =
              CASE
                WHEN $4::text IS NULL
                  THEN notes
                ELSE $4
              END,

            status =
              COALESCE($5, status),

            subtotal =
              COALESCE($6, subtotal),

            tax_amount =
              COALESCE($7, tax_amount),

            total_amount =
              COALESCE($8, total_amount),

            amount_due = $9,

            updated_at = NOW()

          WHERE id = $10

          RETURNING *
          `,
          [
            customer_id ?? null,
            issue_date ?? null,
            due_date ?? null,
            notes ?? null,
            status ?? null,
            subtotal,
            taxAmount,
            totalAmount,
            amountDue,
            id,
          ]
        );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        invoice:
          updateResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(
      "Update invoice API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to update invoice",
      },
      { status: 500 }
    );
  }
}

// ==========================================
// DELETE / CANCEL INVOICE
// ==========================================

export async function DELETE(
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

    const { id } = await context.params;

    const { pool } =
      await getTenantDatabaseForUser(user.id);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const invoiceResult =
        await client.query(
          `
          SELECT
            id,
            amount_paid,
            status
          FROM invoices
          WHERE id = $1
          FOR UPDATE
          `,
          [id]
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
      // NEVER DELETE AN INVOICE THAT HAS MONEY
      // ==========================================

      if (
        Number(invoice.amount_paid) > 0
      ) {
        const result =
          await client.query(
            `
            UPDATE invoices
            SET
              status = 'cancelled',
              updated_at = NOW()
            WHERE id = $1
            RETURNING *
            `,
            [id]
          );

        await client.query("COMMIT");

        return NextResponse.json({
          success: true,
          message:
            "Invoice has been cancelled because it has recorded payments.",
          invoice: result.rows[0],
        });
      }

      // ==========================================
      // DELETE UNPAID INVOICE
      // ==========================================

      await client.query(
        `
        DELETE FROM invoices
        WHERE id = $1
        `,
        [id]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        message: "Invoice deleted successfully",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(
      "Delete invoice API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete invoice",
      },
      { status: 500 }
    );
  }
}