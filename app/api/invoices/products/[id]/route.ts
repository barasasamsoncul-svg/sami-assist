import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| GET /api/invoices/products/[id]
|--------------------------------------------------------------------------
|
| Returns a single product/service.
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
        { error: "Product ID is required" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `
        SELECT
          p.id,
          p.name,
          p.description,
          p.sku,
          p.unit_price,
          p.tax_rate_id,
          p.category,
          p.is_active,
          p.notes,
          p.metadata,
          p.created_at,
          p.updated_at,

          tr.name AS tax_rate_name,
          tr.rate AS tax_rate,
          tr.tax_type AS tax_type,
          tr.is_default AS tax_is_default,

          (
            SELECT COUNT(*)
            FROM public.invoice_items ii
            WHERE ii.product_id = p.id
          )::int AS usage_count,

          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'id', i.id,
                  'invoice_number', i.invoice_number,
                  'total_amount', i.total_amount,
                  'status', i.status,
                  'issue_date', i.issue_date
                )
                ORDER BY i.created_at DESC
                LIMIT 5
              ),
              '[]'::json
            )
            FROM public.invoice_items ii
            INNER JOIN public.invoices i ON i.id = ii.invoice_id
            WHERE ii.product_id = p.id
              AND i.deleted_at IS NULL
          ) AS recent_invoices

        FROM public.products p

        LEFT JOIN public.tax_rates tr
          ON tr.id = p.tax_rate_id

        WHERE p.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      product: result.rows[0],
    });
  } catch (error) {
    console.error("GET /api/invoices/products/[id]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch product",
      },
      { status: 500 }
    );
  }
}