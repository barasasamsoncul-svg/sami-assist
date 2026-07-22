import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// ==========================================
// GET ALL INVOICES
// ==========================================

export async function GET() {
  try {
    const supabase =
      await createClient();

    // ==========================================
    // GET LOGGED-IN USER
    // ==========================================

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
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
    // GET INVOICES
    // ==========================================

    const {
      data: invoices,
      error,
    } = await supabase
      .from("invoices")
      .select(
        `
        *,
        customers (
          id,
          company_name,
          contact_name,
          email,
          phone
        ),
        invoice_items (
          id,
          description,
          quantity,
          unit_price,
          total
        )
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error) {
      console.error(
        "Invoices fetch error:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Failed to load invoices",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      invoices || []
    );
  } catch (error) {
    console.error(
      "Invoices API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Internal Server Error",
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
    // VALIDATION
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
    // GET LOGGED-IN USER
    // ==========================================

    const supabase =
      await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
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
    // VERIFY CUSTOMER BELONGS TO USER
    // ==========================================

    const {
      data: customer,
      error: customerError,
    } = await supabase
      .from("customers")
      .select("id")
      .eq(
        "id",
        customer_id
      )
      .eq(
        "user_id",
        user.id
      )
      .single();

    if (
      customerError ||
      !customer
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
    // PREPARE INVOICE ITEMS
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
    // VALIDATE ITEMS
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
    // CALCULATE TOTALS
    // ==========================================

    const subtotal =
      invoiceItems.reduce(
        (
          sum,
          item
        ) =>
          sum +
          item.total,
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
    // GENERATE INVOICE NUMBER
    // ==========================================

    const {
      count,
      error: countError,
    } = await supabase
      .from("invoices")
      .select(
        "id",
        {
          count: "exact",
          head: true,
        }
      )
      .eq(
        "user_id",
        user.id
      );

    if (countError) {
      console.error(
        "Invoice count error:",
        countError
      );

      return NextResponse.json(
        {
          error:
            "Failed to generate invoice number",
        },
        {
          status: 500,
        }
      );
    }

    const invoiceNumber =
      `INV-${String(
        (count || 0) + 1
      ).padStart(
        4,
        "0"
      )}`;

    // ==========================================
    // CREATE INVOICE
    // ==========================================

    const {
      data: invoice,
      error: invoiceError,
    } = await supabase
      .from("invoices")
      .insert({
        user_id:
          user.id,

        customer_id,

        invoice_number:
          invoiceNumber,

        issue_date:
          issue_date ||
          new Date()
            .toISOString()
            .split("T")[0],

        due_date:
          due_date ||
          null,

        status:
          "draft",

        subtotal,

        tax:
          taxAmount,

        total,

        amount_paid:
          0,

        notes:
          notes?.trim() ||
          null,
      })
      .select()
      .single();

    if (invoiceError) {
      console.error(
        "Invoice creation error:",
        invoiceError
      );

      return NextResponse.json(
        {
          error:
            "Failed to create invoice",
        },
        {
          status: 500,
        }
      );
    }

    // ==========================================
    // CREATE INVOICE ITEMS
    // ==========================================

    const itemsWithInvoiceId =
      invoiceItems.map(
        (item) => ({
          invoice_id:
            invoice.id,

          description:
            item.description,

          quantity:
            item.quantity,

          unit_price:
            item.unit_price,

          total:
            item.total,
        })
      );

    const {
      error: itemsError,
    } = await supabase
      .from(
        "invoice_items"
      )
      .insert(
        itemsWithInvoiceId
      );

    if (itemsError) {
      console.error(
        "Invoice items creation error:",
        itemsError
      );

      // Remove invoice if
      // items failed to save.
      await supabase
        .from("invoices")
        .delete()
        .eq(
          "id",
          invoice.id
        )
        .eq(
          "user_id",
          user.id
        );

      return NextResponse.json(
        {
          error:
            "Failed to create invoice items",
        },
        {
          status: 500,
        }
      );
    }

    // ==========================================
    // GET COMPLETE CREATED INVOICE
    // ==========================================

    const {
      data: completeInvoice,
      error:
        completeInvoiceError,
    } = await supabase
      .from("invoices")
      .select(
        `
        *,
        customers (
          id,
          company_name,
          contact_name,
          email,
          phone
        ),
        invoice_items (
          id,
          description,
          quantity,
          unit_price,
          total
        )
        `
      )
      .eq(
        "id",
        invoice.id
      )
      .eq(
        "user_id",
        user.id
      )
      .single();

    if (
      completeInvoiceError
    ) {
      console.error(
        "Complete invoice fetch error:",
        completeInvoiceError
      );

      return NextResponse.json(
        invoice,
        {
          status: 201,
        }
      );
    }

    return NextResponse.json(
      completeInvoice,
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
          "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}