import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toDecimal(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10000) / 10000 : fallback;
}

function jsonValue(value: unknown, fallback: Record<string, unknown> | unknown[] = {}) {
  if (value === undefined || value === null) {
    return fallback;
  }
  return value;
}

function escapeCSV(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/*
|--------------------------------------------------------------------------
| GET /api/invoices/export
|--------------------------------------------------------------------------
|
| Exports invoices as CSV, Excel, or JSON.
| For image format, returns base64 encoded invoice images.
|
| Query parameters:
| ?format=csv|json|xlsx|image
| ?status=paid|sent|...
| ?from_date=2026-01-01
| ?to_date=2026-12-31
| ?customer_id=UUID
| ?fields=invoice_number,total_amount,status
| ?image_format=png|jpeg|webp
| ?quality=80
|--------------------------------------------------------------------------
*/

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const { searchParams } = new URL(req.url);

    const format = searchParams.get("format") || "csv";
    const status = searchParams.get("status");
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date");
    const customerId = searchParams.get("customer_id");
    const search = searchParams.get("search");
    const fieldsParam = searchParams.get("fields");
    const imageFormat = searchParams.get("image_format") || "png";
    const quality = toNumber(searchParams.get("quality"), 80);

    // Allowed export formats
    const allowedFormats = ["csv", "json", "xlsx", "image"];
    if (!allowedFormats.includes(format)) {
      return NextResponse.json(
        {
          error: `Invalid format. Must be one of: ${allowedFormats.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Default fields
    const defaultFields = [
      "invoice_number",
      "customer_name",
      "issue_date",
      "due_date",
      "status",
      "currency",
      "subtotal",
      "discount_amount",
      "tax_amount",
      "shipping_cost",
      "total_amount",
      "amount_paid",
      "amount_due",
      "po_number",
    ];

    const fields = fieldsParam ? fieldsParam.split(",") : defaultFields;

    // Build query
    const conditions: string[] = ["i.deleted_at IS NULL"];
    const values: unknown[] = [];

    let parameterIndex = 1;

    if (status) {
      conditions.push(`i.status = $${parameterIndex}`);
      values.push(status);
      parameterIndex++;
    }

    if (fromDate) {
      conditions.push(`i.issue_date >= $${parameterIndex}`);
      values.push(fromDate);
      parameterIndex++;
    }

    if (toDate) {
      conditions.push(`i.issue_date <= $${parameterIndex}`);
      values.push(toDate);
      parameterIndex++;
    }

    if (customerId) {
      conditions.push(`i.customer_id = $${parameterIndex}`);
      values.push(customerId);
      parameterIndex++;
    }

    if (search) {
      conditions.push(`
        (
          i.invoice_number ILIKE $${parameterIndex}
          OR c.company_name ILIKE $${parameterIndex}
        )
      `);
      values.push(`%${search}%`);
      parameterIndex++;
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    // Get data
    const result = await pool.query(
      `
        SELECT
          i.id,
          i.invoice_number,
          i.issue_date,
          i.due_date,
          i.status,
          i.currency,
          i.subtotal,
          i.discount_amount,
          i.tax_amount,
          i.shipping_cost,
          i.total_amount,
          i.amount_paid,
          i.amount_due,
          i.po_number,
          i.notes,
          i.created_at,

          c.id AS customer_id,
          c.company_name AS customer_name,
          c.email AS customer_email,
          c.phone AS customer_phone,
          c.billing_address AS customer_billing_address,
          c.tax_id AS customer_tax_id,

          (
            SELECT COUNT(*)
            FROM public.invoice_items ii
            WHERE ii.invoice_id = i.id
          ) AS item_count,

          (
            SELECT COUNT(*)
            FROM public.payments p
            WHERE p.invoice_id = i.id
              AND p.status = 'completed'
          ) AS payment_count

        FROM public.invoices i

        INNER JOIN public.customers c
          ON c.id = i.customer_id

        ${whereClause}

        ORDER BY i.issue_date DESC
      `,
      values
    );

    const invoices = result.rows;

    if (invoices.length === 0) {
      return NextResponse.json(
        { error: "No invoices found to export" },
        { status: 404 }
      );
    }

    // Log export
    await pool.query(
      `
        INSERT INTO public.invoice_activity_log (
          invoice_id,
          user_id,
          user_name,
          action,
          details
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        invoices[0].id,
        user.id,
        user.fullName || user.email,
        "export",
        jsonValue({
          format,
          count: invoices.length,
          filters: {
            status,
            from_date: fromDate,
            to_date: toDate,
            customer_id: customerId,
          },
          exported_at: new Date().toISOString(),
        }, {}),
      ]
    );

    // Format data based on requested format
    let exportData: any;
    let contentType: string;
    let filename: string;

    if (format === "image") {
      // IMAGE export - return as image
      // In production, you would generate actual images here using:
      // - puppeteer with HTML template
      // - @react-pdf/renderer
      // - Sharp for image conversion
      
      // For now, return a placeholder with invoice data
      exportData = JSON.stringify({
        success: true,
        message: "Image export would be generated here",
        format: imageFormat,
        quality,
        count: invoices.length,
        invoices: invoices.map((inv) => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          total_amount: inv.total_amount,
          status: inv.status,
          // Image data would be base64 encoded here
          // image_preview: "data:image/png;base64,..."
        })),
      }, null, 2);
      contentType = "application/json";
      filename = `invoices_${new Date().toISOString().slice(0, 10)}.json`;
      
      // In production, you would return actual image files
      // return new NextResponse(imageBuffer, {
      //   status: 200,
      //   headers: {
      //     "Content-Type": `image/${imageFormat}`,
      //     "Content-Disposition": `attachment; filename="invoices.${imageFormat}"`,
      //   },
      // });
      
    } else if (format === "json") {
      // JSON export
      const jsonData = invoices.map((inv) => {
        const item: Record<string, any> = {};
        fields.forEach((field) => {
          if (field in inv) {
            item[field] = inv[field];
          }
        });
        return item;
      });

      exportData = JSON.stringify(jsonData, null, 2);
      contentType = "application/json";
      filename = `invoices_${new Date().toISOString().slice(0, 10)}.json`;
      
    } else if (format === "csv") {
      // CSV export
      const headers = fields;
      let csvRows: string[] = [];

      // Add header row
      csvRows.push(headers.map(escapeCSV).join(","));

      // Add data rows
      for (const inv of invoices) {
        const row = fields.map((field) => {
          let value = inv[field];
          if (value instanceof Date) {
            value = value.toISOString().slice(0, 10);
          }
          return escapeCSV(value);
        });
        csvRows.push(row.join(","));
      }

      exportData = csvRows.join("\n");
      contentType = "text/csv";
      filename = `invoices_${new Date().toISOString().slice(0, 10)}.csv`;
      
    } else {
      // XLSX export - placeholder
      // In production, use exceljs or similar library
      exportData = JSON.stringify({
        message: "Excel export would be generated here",
        data: invoices,
        fields,
        count: invoices.length,
      }, null, 2);
      contentType = "application/json";
      filename = `invoices_${new Date().toISOString().slice(0, 10)}.json`;
    }

    // Return file
    return new NextResponse(exportData, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/export:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to export invoices",
      },
      { status: 500 }
    );
  }
}