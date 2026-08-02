import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

// ==========================================
// GET ALL INVOICES
// ==========================================

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
        ) AS invoice_items

      FROM invoices i

      INNER JOIN customers c
        ON c.id = i.customer_id

      ORDER BY i.created_at DESC
    `);

    return NextResponse.json({
      success: true,
      invoices: result.rows,
    });
  } catch (error) {
    console.error(
      "Invoices GET API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load invoices",
      },
      { status: 500 }
    );
  }
}

// ==========================================
// CREATE INVOICE
// ==========================================

export async function POST(req: Request) {
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
      customer_id,
      issue_date,
      due_date,
      notes,
      items,
    } = body;

    // ==========================================
    // VALIDATE CUSTOMER
    // ==========================================

    if (!customer_id) {
      return NextResponse.json(
        {
          error: "Customer is required",
        },
        { status: 400 }
      );
    }

    // ==========================================
    // VALIDATE ITEMS
    // ==========================================

    if (
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "At least one invoice item is required",
        },
        { status: 400 }
      );
    }

    // ==========================================
    // CONNECT TO TENANT DATABASE
    // ==========================================

    const { pool } =
      await getTenantDatabaseForUser(user.id);

    const client = await pool.connect();

    try {
      // ==========================================
      // START TRANSACTION
      // ==========================================

      await client.query("BEGIN");

      // ==========================================
      // VERIFY CUSTOMER
      // ==========================================

      const customerResult =
        await client.query(
          `
          SELECT
            id,
            company_name,
            contact_name,
            email,
            phone,
            address
          FROM customers
          WHERE id = $1
          LIMIT 1
          `,
          [customer_id]
        );

      if (customerResult.rowCount === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error: "Customer not found",
          },
          { status: 404 }
        );
      }

      // ==========================================
      // PREPARE ITEMS
      // ==========================================

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
              error:
                "Each invoice item must have a quantity greater than zero",
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
              error:
                "Each invoice item must have a valid unit price",
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

      // ==========================================
      // CALCULATE INVOICE TOTALS
      // ==========================================

      const subtotal =
        preparedItems.reduce(
          (sum, item) =>
            sum + item.quantity * item.unitPrice,
          0
        );

      const taxAmount =
        preparedItems.reduce(
          (sum, item) =>
            sum + item.taxAmount,
          0
        );

      const totalAmount =
        subtotal + taxAmount;

      const amountPaid = 0;

      const amountDue =
        totalAmount - amountPaid;

      // ==========================================
      // GENERATE INVOICE NUMBER
      // ==========================================

      const numberResult =
        await client.query(`
          SELECT invoice_number
          FROM invoices
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE
        `);

      let nextNumber = 1;

     if ((numberResult.rowCount ?? 0) > 0) {
        const latestNumber =
          String(
            numberResult.rows[0]
              .invoice_number
          );

        const match =
          latestNumber.match(
            /^INV-(\d+)$/
          );

        if (match) {
          nextNumber =
            Number(match[1]) + 1;
        }
      }

      const invoiceNumber =
        `INV-${String(
          nextNumber
        ).padStart(4, "0")}`;

      // ==========================================
      // CREATE INVOICE
      // ==========================================

      const invoiceResult =
        await client.query(
          `
          INSERT INTO invoices (
            customer_id,
            invoice_number,
            issue_date,
            due_date,
            status,
            subtotal,
            tax_amount,
            total_amount,
            amount_paid,
            amount_due,
            notes
          )
          VALUES (
            $1,
            $2,
            COALESCE($3::date, CURRENT_DATE),
            $4,
            'draft',
            $5,
            $6,
            $7,
            $8,
            $9,
            $10
          )
          RETURNING *
          `,
          [
            customer_id,
            invoiceNumber,
            issue_date || null,
            due_date || null,
            subtotal,
            taxAmount,
            totalAmount,
            amountPaid,
            amountDue,
            notes
              ? String(notes).trim()
              : null,
          ]
        );

      const invoice =
        invoiceResult.rows[0];

      // ==========================================
      // CREATE INVOICE ITEMS
      // ==========================================

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
            invoice.id,
            item.description,
            item.quantity,
            item.unitPrice,
            item.taxRate,
            item.taxAmount,
            item.lineTotal,
          ]
        );
      }

      // ==========================================
      // COMMIT
      // ==========================================

      await client.query("COMMIT");

      // ==========================================
      // RETURN COMPLETE INVOICE
      // ==========================================

      const completeResult =
        await pool.query(
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
            ) AS invoice_items

          FROM invoices i

          INNER JOIN customers c
            ON c.id = i.customer_id

          WHERE i.id = $1

          LIMIT 1
          `,
          [invoice.id]
        );

      return NextResponse.json(
        {
          success: true,
          invoice:
            completeResult.rows[0] ||
            invoice,
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
      "Create invoice API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal Server Error",
      },
      { status: 500 }
    );
  }
}