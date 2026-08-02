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
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const { pool } =
      await getTenantDatabaseForUser(user.id);

    const result = await pool.query(
      `
      SELECT
        i.*,

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
      `
    );

    return NextResponse.json({
      invoices: result.rows,
    });
  } catch (error) {
    console.error(
      "Invoices GET API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load invoices",
      },
      {
        status: 500,
      }
    );
  }
}

// ==========================================
// CREATE INVOICE
// ==========================================

export async function POST(
  req: Request
) {
  let client;

  try {
    // ==========================================
    // 1. READ REQUEST
    // ==========================================

    const body = await req.json();

    const {
      customer_id,
      issue_date,
      due_date,
      notes,
      items,
    } = body;

    // ==========================================
    // 2. VALIDATE CUSTOMER
    // ==========================================

    if (
      typeof customer_id !== "string" ||
      !customer_id.trim()
    ) {
      return NextResponse.json(
        {
          error: "Customer is required",
        },
        {
          status: 400,
        }
      );
    }

    // ==========================================
    // 3. VALIDATE ITEMS
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
        {
          status: 400,
        }
      );
    }

    // ==========================================
    // 4. GET LOGGED-IN USER
    // ==========================================

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

    // ==========================================
    // 5. CONNECT TO TENANT DATABASE
    // ==========================================

    const {
      pool,
      business,
    } = await getTenantDatabaseForUser(
      user.id
    );

    client = await pool.connect();

    // ==========================================
    // 6. PREPARE & VALIDATE ITEMS
    // ==========================================

    const invoiceItems = items.map(
      (item: unknown) => {
        const raw =
          item as Record<string, unknown>;

        const description =
          String(
            raw.description ?? ""
          ).trim();

        const quantity =
          Number(raw.quantity);

        const unitPrice =
          Number(raw.unit_price);

        const taxRate =
          Number(raw.tax_rate ?? 0);

        if (!description) {
          throw new Error(
            "Every invoice item must have a description."
          );
        }

        if (
          !Number.isFinite(quantity) ||
          quantity <= 0
        ) {
          throw new Error(
            "Every invoice item must have a quantity greater than zero."
          );
        }

        if (
          !Number.isFinite(unitPrice) ||
          unitPrice < 0
        ) {
          throw new Error(
            "Every invoice item must have a valid non-negative unit price."
          );
        }

        if (
          !Number.isFinite(taxRate) ||
          taxRate < 0 ||
          taxRate > 100
        ) {
          throw new Error(
            "Tax rate must be between 0 and 100."
          );
        }

        const lineSubtotal =
          quantity * unitPrice;

        const taxAmount =
          lineSubtotal *
          (taxRate / 100);

        const lineTotal =
          lineSubtotal + taxAmount;

        return {
          description,
          quantity,
          unitPrice,
          taxRate,
          taxAmount,
          lineTotal,
        };
      }
    );

    // ==========================================
    // 7. CALCULATE INVOICE TOTALS
    // ==========================================

    const subtotal =
      invoiceItems.reduce(
        (sum, item) =>
          sum + item.quantity * item.unitPrice,
        0
      );

    const taxAmount =
      invoiceItems.reduce(
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
    // 8. START TRANSACTION
    // ==========================================

    await client.query("BEGIN");

    // ==========================================
    // 9. VERIFY CUSTOMER EXISTS
    //
    // IMPORTANT:
    // The tenant database already belongs to
    // the current business.
    //
    // We therefore DO NOT use user_id here.
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

    if (
      customerResult.rowCount !== 1
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: "Customer not found",
        },
        {
          status: 404,
        }
      );
    }

    // ==========================================
    // 10. LOCK INVOICE NUMBER GENERATION
    //
    // Prevent two simultaneous requests from
    // generating the same invoice number.
    // ==========================================

    await client.query(
      `
      SELECT pg_advisory_xact_lock(
        hashtext($1)
      )
      `,
      [
        `invoice-number:${business.id}`,
      ]
    );

    // ==========================================
    // 11. GENERATE NEXT INVOICE NUMBER
    // ==========================================

    const countResult =
      await client.query(
        `
        SELECT COUNT(*)::int AS count
        FROM invoices
        `
      );

    const invoiceCount =
      Number(
        countResult.rows[0]?.count
      ) || 0;

    const invoiceNumber =
      `INV-${String(
        invoiceCount + 1
      ).padStart(4, "0")}`;

    // ==========================================
    // 12. CREATE INVOICE
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
          subtotal.toFixed(2),
          taxAmount.toFixed(2),
          totalAmount.toFixed(2),
          amountPaid.toFixed(2),
          amountDue.toFixed(2),
          notes?.trim() || null,
        ]
      );

    const invoice =
      invoiceResult.rows[0];

    // ==========================================
    // 13. CREATE INVOICE ITEMS
    // ==========================================

    for (const item of invoiceItems) {
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
          item.quantity.toFixed(2),
          item.unitPrice.toFixed(2),
          item.taxRate.toFixed(2),
          item.taxAmount.toFixed(2),
          item.lineTotal.toFixed(2),
        ]
      );
    }

    // ==========================================
    // 14. GET COMPLETE CREATED INVOICE
    // ==========================================

    const completeResult =
      await client.query(
        `
        SELECT
          i.*,

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

    // ==========================================
    // 15. COMMIT
    // ==========================================

    await client.query("COMMIT");

    return NextResponse.json(
      {
        invoice:
          completeResult.rows[0] ||
          invoice,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Invoice transaction rollback error:",
          rollbackError
        );
      }
    }

    console.error(
      "Create invoice API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create invoice",
      },
      {
        status: 500,
      }
    );
  } finally {
    if (client) {
      client.release();
    }
  }
}