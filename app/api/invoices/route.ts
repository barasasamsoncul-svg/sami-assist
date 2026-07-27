import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

// ==========================================
// GET ALL INVOICES
// ==========================================

export async function GET() {
  try {
    // ==========================================
    // 1. GET LOGGED-IN USER
    // ==========================================

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

    // ==========================================
    // 2. CONNECT TO USER'S TENANT DATABASE
    // ==========================================

    const { pool } =
      await getTenantDatabaseForUser(user.id);

    // ==========================================
    // 3. GET INVOICES
    // ==========================================

    const result = await pool.query(
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

        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', ii.id,
                'description', ii.description,
                'quantity', ii.quantity,
                'unit_price', ii.unit_price,
                'total', ii.total
              )
              ORDER BY ii.id
            )
            FROM invoice_items ii
            WHERE ii.invoice_id = i.id
          ),
          '[]'::json
        ) AS invoice_items

      FROM invoices i

      LEFT JOIN customers c
        ON c.id = i.customer_id

      WHERE i.user_id = $1

      ORDER BY i.created_at DESC
      `,
      [user.id]
    );

    return NextResponse.json(
      result.rows
    );
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
  try {
    // ==========================================
    // 1. READ REQUEST
    // ==========================================

    const body =
      await req.json();

    const {
      customer_id,
      issue_date,
      due_date,
      tax,
      notes,
      items,
    } = body;

    // ==========================================
    // 2. VALIDATE CUSTOMER
    // ==========================================

    if (!customer_id) {
      return NextResponse.json(
        {
          error:
            "Customer is required",
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
          error:
            "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    // ==========================================
    // 5. CONNECT TO TENANT DATABASE
    // ==========================================

    const { pool } =
      await getTenantDatabaseForUser(
        user.id
      );

    // ==========================================
    // 6. VERIFY CUSTOMER
    // ==========================================

    const customerResult =
      await pool.query(
        `
        SELECT id
        FROM customers
        WHERE id = $1
          AND user_id = $2
        LIMIT 1
        `,
        [
          customer_id,
          user.id,
        ]
      );

    if (
      customerResult.rowCount === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Customer not found",
        },
        {
          status: 404,
        }
      );
    }

    // ==========================================
    // 7. PREPARE INVOICE ITEMS
    // ==========================================

    const invoiceItems =
      items.map(
        (item: any) => {
          const quantity =
            Number(
              item.quantity
            ) || 0;

          const unitPrice =
            Number(
              item.unit_price
            ) || 0;

          const total =
            quantity *
            unitPrice;

          return {
            description:
              String(
                item.description ||
                  ""
              ).trim(),

            quantity,

            unit_price:
              unitPrice,

            total,
          };
        }
      );

    // ==========================================
    // 8. VALIDATE ITEMS
    // ==========================================

    const invalidItem =
      invoiceItems.find(
        (item) =>
          !item.description ||
          item.quantity <= 0 ||
          item.unit_price < 0
      );

    if (invalidItem) {
      return NextResponse.json(
        {
          error:
            "Each invoice item must have a description, valid quantity, and valid price",
        },
        {
          status: 400,
        }
      );
    }

    // ==========================================
    // 9. CALCULATE TOTALS
    // ==========================================

    const subtotal =
      invoiceItems.reduce(
        (
          sum: number,
          item: {
            total: number;
          }
        ) =>
          sum + item.total,
        0
      );

    const taxAmount =
      Number(tax) || 0;

    if (taxAmount < 0) {
      return NextResponse.json(
        {
          error:
            "Tax cannot be negative",
        },
        {
          status: 400,
        }
      );
    }

    const total =
      subtotal +
      taxAmount;

    // ==========================================
    // 10. GENERATE INVOICE NUMBER
    // ==========================================

    const countResult =
      await pool.query(
        `
        SELECT COUNT(*)::int AS count
        FROM invoices
        WHERE user_id = $1
        `,
        [user.id]
      );

    const invoiceCount =
      Number(
        countResult.rows[0]?.count
      ) || 0;

    const invoiceNumber =
      `INV-${String(
        invoiceCount + 1
      ).padStart(
        4,
        "0"
      )}`;

    // ==========================================
    // 11. CREATE INVOICE
    // ==========================================

    const invoiceResult =
      await pool.query(
        `
        INSERT INTO invoices
        (
          user_id,
          customer_id,
          invoice_number,
          issue_date,
          due_date,
          status,
          subtotal,
          tax,
          total,
          amount_paid,
          notes
        )
        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11
        )
        RETURNING *
        `,
        [
          user.id,
          customer_id,
          invoiceNumber,
          issue_date ||
            new Date()
              .toISOString()
              .split("T")[0],
          due_date ||
            null,
          "draft",
          subtotal,
          taxAmount,
          total,
          0,
          notes?.trim() ||
            null,
        ]
      );

    const invoice =
      invoiceResult.rows[0];

    // ==========================================
    // 12. CREATE INVOICE ITEMS
    // ==========================================

    try {
      for (
        const item of invoiceItems
      ) {
        await pool.query(
          `
          INSERT INTO invoice_items
          (
            invoice_id,
            description,
            quantity,
            unit_price,
            total
          )
          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5
          )
          `,
          [
            invoice.id,
            item.description,
            item.quantity,
            item.unit_price,
            item.total,
          ]
        );
      }
    } catch (itemsError) {
      console.error(
        "Invoice items creation error:",
        itemsError
      );

      // Remove invoice if
      // item creation failed.
      await pool.query(
        `
        DELETE FROM invoices
        WHERE id = $1
          AND user_id = $2
        `,
        [
          invoice.id,
          user.id,
        ]
      );

      throw itemsError;
    }

    // ==========================================
    // 13. GET COMPLETE INVOICE
    // ==========================================

    const completeResult =
      await pool.query(
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

          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', ii.id,
                  'description', ii.description,
                  'quantity', ii.quantity,
                  'unit_price', ii.unit_price,
                  'total', ii.total
                )
                ORDER BY ii.id
              )
              FROM invoice_items ii
              WHERE ii.invoice_id = i.id
            ),
            '[]'::json
          ) AS invoice_items

        FROM invoices i

        LEFT JOIN customers c
          ON c.id = i.customer_id

        WHERE i.id = $1
          AND i.user_id = $2

        LIMIT 1
        `,
        [
          invoice.id,
          user.id,
        ]
      );

    return NextResponse.json(
      completeResult.rows[0] ||
        invoice,
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Create invoice API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}