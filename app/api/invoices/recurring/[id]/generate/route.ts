import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = {
  params: Promise<{ id: string }>;
};

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

/*
|--------------------------------------------------------------------------
| POST /api/invoices/recurring/[id]/generate
|--------------------------------------------------------------------------
|
| Manually generates an invoice from a recurring invoice.
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest, { params }: Context) {
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
        { error: "Recurring invoice ID is required" },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Get recurring invoice
      const recurringResult = await client.query(
        `
          SELECT *
          FROM public.recurring_invoices
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if (recurringResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Recurring invoice not found" },
          { status: 404 }
        );
      }

      const recurring = recurringResult.rows[0];

      // Check if active
      if (recurring.status !== "active") {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: `Cannot generate invoice from ${recurring.status} recurring invoice` },
          { status: 409 }
        );
      }

      // Check if end_date is passed
      if (recurring.end_date && new Date(recurring.end_date) < new Date()) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Recurring invoice has ended" },
          { status: 409 }
        );
      }

      // Get customer
      const customerResult = await client.query(
        `
          SELECT *
          FROM public.customers
          WHERE id = $1
            AND deleted_at IS NULL
        `,
        [recurring.customer_id]
      );

      if (customerResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Customer not found" },
          { status: 404 }
        );
      }

      const customer = customerResult.rows[0];

      // Get settings for invoice number generation
      const settingsResult = await client.query(
        `
          SELECT *
          FROM public.invoice_settings
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE
        `,
        []
      );

      const settings = settingsResult.rows[0] || {};

      // Generate invoice number (simplified)
      const nextNumber = settings.invoice_next_number || 1;
      const prefix = settings.invoice_prefix || "INV-";
      const padding = settings.invoice_number_padding || 6;
      const format = settings.invoice_number_format || "{prefix}{number}";

      const invoiceNumber = format
        .replaceAll("{prefix}", prefix)
        .replaceAll("{number}", String(nextNumber).padStart(padding, "0"));

      // Update next number
      await client.query(
        `
          UPDATE public.invoice_settings
          SET invoice_next_number = $1
          WHERE id = $2
        `,
        [nextNumber + 1, settings.id]
      );

      // Get items from recurring
      const items = Array.isArray(recurring.items) ? recurring.items : [];

      // Calculate totals
      let subtotal = 0;
      let taxAmount = 0;
      let totalAmount = 0;

      const processedItems = items.map((item: any, index: number) => {
        const quantity = Number(item.quantity) || 1;
        const unitPrice = Number(item.unit_price) || 0;
        const discountType = item.discount_type || null;
        const discountValue = Number(item.discount_value) || 0;
        const taxRate = Number(item.tax_rate) || 0;

        const lineSubtotal = quantity * unitPrice;
        let discountAmount = 0;

        if (discountType === "percentage") {
          discountAmount = lineSubtotal * (discountValue / 100);
        } else if (discountType === "fixed") {
          discountAmount = discountValue;
        }

        discountAmount = Math.min(Math.max(discountAmount, 0), lineSubtotal);

        const taxableAmount = lineSubtotal - discountAmount;
        const tax = taxableAmount * (taxRate / 100);

        subtotal += lineSubtotal;
        taxAmount += tax;
        totalAmount += taxableAmount + tax;

        return {
          ...item,
          quantity,
          unit_price: unitPrice,
          discount_type: discountType,
          discount_value: discountValue,
          discount_amount: discountAmount,
          tax_rate: taxRate,
          tax_amount: tax,
          line_total: taxableAmount + tax,
          sort_order: index,
          metadata: item.metadata || {},
        };
      });

      const invoiceDiscountType = recurring.discount_type;
      const invoiceDiscountValue = Number(recurring.discount_value) || 0;
      const taxMethod = recurring.tax_calculation_method || "exclusive";

      let finalTotal = totalAmount;

      // Apply invoice-level discount
      if (invoiceDiscountType && invoiceDiscountValue > 0) {
        let discountAmount = 0;
        if (invoiceDiscountType === "percentage") {
          discountAmount = totalAmount * (invoiceDiscountValue / 100);
        } else if (invoiceDiscountType === "fixed") {
          discountAmount = invoiceDiscountValue;
        }
        finalTotal = Math.max(0, totalAmount - discountAmount);
      }

      // Create invoice
      const invoiceResult = await client.query(
        `
          INSERT INTO public.invoices (
            customer_id,
            invoice_number,
            issue_date,
            due_date,
            status,
            subtotal,
            discount_type,
            discount_value,
            discount_amount,
            tax_calculation_method,
            tax_amount,
            shipping_cost,
            shipping_tax,
            total_amount,
            amount_paid,
            amount_due,
            currency,
            payment_terms_id,
            payment_terms_display,
            template_id,
            recurring_id,
            created_by,
            notes,
            metadata
          )
          VALUES (
            $1, $2, $3, $4, 'sent',
            $5, $6, $7, $8,
            $9, $10, 0, 0,
            $11, 0, $11,
            $12, $13, $14, $15,
            $16, $17, $18, $19
          )
          RETURNING *
        `,
        [
          recurring.customer_id,
          invoiceNumber,
          new Date(recurring.next_issue_date),
          new Date(recurring.next_issue_date),
          subtotal,
          invoiceDiscountType,
          invoiceDiscountValue,
          invoiceDiscountType ? (invoiceDiscountType === "percentage" ? totalAmount * (invoiceDiscountValue / 100) : invoiceDiscountValue) : 0,
          taxMethod,
          taxAmount,
          finalTotal,
          recurring.currency || customer.currency || "KES",
          recurring.payment_terms_id,
          null,
          recurring.template_id,
          recurring.id,
          user.id,
          `Generated from recurring invoice ${recurring.id}`,
          jsonValue(recurring.metadata, {}),
        ]
      );

      const invoice = invoiceResult.rows[0];

      // Create invoice items
      for (const item of processedItems) {
        await client.query(
          `
            INSERT INTO public.invoice_items (
              invoice_id,
              product_id,
              description,
              quantity,
              unit_price,
              discount_type,
              discount_value,
              discount_amount,
              tax_rate,
              tax_amount,
              tax_rate_id,
              line_total,
              sort_order,
              metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          `,
          [
            invoice.id,
            item.product_id || null,
            item.description,
            item.quantity,
            item.unit_price,
            item.discount_type,
            item.discount_value,
            item.discount_amount || 0,
            item.tax_rate,
            item.tax_amount || 0,
            null,
            item.line_total || 0,
            item.sort_order || 0,
            item.metadata || {},
          ]
        );
      }

      // Update recurring invoice
      await client.query(
        `
          UPDATE public.recurring_invoices
          SET
            last_issue_date = $1,
            total_generated = total_generated + 1,
            total_amount_generated = total_amount_generated + $2,
            updated_at = NOW()
          WHERE id = $3
        `,
        [recurring.next_issue_date, finalTotal, recurring.id]
      );

      // Calculate next issue date (simplified - could be more complex)
      const nextDate = new Date(recurring.next_issue_date);
      const frequency = recurring.frequency;
      const interval = Number(recurring.interval_value) || 1;

      switch (frequency) {
        case "daily":
          nextDate.setDate(nextDate.getDate() + interval);
          break;
        case "weekly":
          nextDate.setDate(nextDate.getDate() + (7 * interval));
          break;
        case "biweekly":
          nextDate.setDate(nextDate.getDate() + (14 * interval));
          break;
        case "monthly":
          nextDate.setMonth(nextDate.getMonth() + interval);
          break;
        case "quarterly":
          nextDate.setMonth(nextDate.getMonth() + (3 * interval));
          break;
        case "biannual":
          nextDate.setMonth(nextDate.getMonth() + (6 * interval));
          break;
        case "yearly":
          nextDate.setFullYear(nextDate.getFullYear() + interval);
          break;
        default:
          nextDate.setMonth(nextDate.getMonth() + interval);
      }

      // Check if next date is beyond end_date
      if (recurring.end_date && nextDate > new Date(recurring.end_date)) {
        await client.query(
          `
            UPDATE public.recurring_invoices
            SET
              status = 'completed',
              updated_at = NOW()
            WHERE id = $1
          `,
          [recurring.id]
        );
      } else {
        await client.query(
          `
            UPDATE public.recurring_invoices
            SET
              next_issue_date = $1,
              updated_at = NOW()
            WHERE id = $2
          `,
          [nextDate, recurring.id]
        );
      }

      // Activity log
      await client.query(
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
          invoice.id,
          user.id,
          user.fullName || user.email,
          "recurring_generated",
          jsonValue({
            recurring_id: recurring.id,
            invoice_number: invoiceNumber,
            total_amount: finalTotal,
          }, {}),
        ]
      );

      // Create event
      await client.query(
        `
          INSERT INTO public.invoice_events (
            invoice_id,
            event_type,
            payload
          )
          VALUES ($1, 'recurring_generated', $2)
        `,
        [
          invoice.id,
          jsonValue({
            recurring_id: recurring.id,
            invoice_id: invoice.id,
            invoice_number: invoiceNumber,
            total_amount: finalTotal,
            generated_by: user.id,
            generated_at: new Date().toISOString(),
          }, {}),
        ]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        message: "Invoice generated successfully",
        invoice: invoice,
        recurringInvoice: {
          id: recurring.id,
          next_issue_date: nextDate,
          total_generated: Number(recurring.total_generated) + 1,
          total_amount_generated: toDecimal(recurring.total_amount_generated) + toDecimal(finalTotal),
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("POST /api/invoices/recurring/[id]/generate:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate invoice",
      },
      { status: 500 }
    );
  }
}