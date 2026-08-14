import { NextRequest, NextResponse } from "next/server";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";
import { getUserIdFromRequest } from "@/lib/auth-helpers";

// GET: Get single invoice by ID with items
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getUserIdFromRequest(req);

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { pool } = await getTenantDatabaseForUser(userId);

        const { id: invoiceId } = await params;

        // Get invoice with customer information
        const invoiceResult = await pool.query(
            `SELECT 
                i.*,
                c.company_name AS customer_name,
                c.email AS customer_email,
                c.phone AS customer_phone,
                c.billing_address,
                c.shipping_address,
                c.tax_id AS customer_tax_id
            FROM public.invoices i
            LEFT JOIN public.customers c 
                ON i.customer_id = c.id
            WHERE i.id = $1`,
            [invoiceId]
        );

        if (invoiceResult.rows.length === 0) {
            return NextResponse.json(
                { error: "Invoice not found" },
                { status: 404 }
            );
        }

        // Get invoice items
        const itemsResult = await pool.query(
            `SELECT 
                ii.*,
                p.name AS product_name,
                p.sku AS product_sku
            FROM public.invoice_items ii
            LEFT JOIN public.products p 
                ON ii.product_id = p.id
            WHERE ii.invoice_id = $1
            ORDER BY ii.sort_order`,
            [invoiceId]
        );

        return NextResponse.json({
            ...invoiceResult.rows[0],
            items: itemsResult.rows,
        });
    } catch (error) {
        console.error("Error fetching invoice:", error);

        return NextResponse.json(
            { error: "Failed to fetch invoice" },
            { status: 500 }
        );
    }
}

// PUT: Update invoice (draft only)
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getUserIdFromRequest(req);

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { pool } = await getTenantDatabaseForUser(userId);

        const { id: invoiceId } = await params;

        const body = await req.json();

        // Check if invoice exists and is in draft status
        const checkResult = await pool.query(
            `SELECT status 
             FROM public.invoices 
             WHERE id = $1`,
            [invoiceId]
        );

        if (checkResult.rows.length === 0) {
            return NextResponse.json(
                { error: "Invoice not found" },
                { status: 404 }
            );
        }

        if (checkResult.rows[0].status !== "draft") {
            return NextResponse.json(
                { error: "Only draft invoices can be updated" },
                { status: 400 }
            );
        }

        const {
            customerId,
            issueDate,
            dueDate,
            poNumber,
            currency,
            items,
            notes,
            paymentTermsId,
            discountType,
            discountValue,
            taxCalculationMethod,
        } = body;

        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            let subtotal = 0;
            let totalTax = 0;
            let processedItems: any[] = [];

            if (items && Array.isArray(items) && items.length > 0) {
                processedItems = items.map((item: any) => {
                    const quantity = parseFloat(item.quantity) || 1;
                    const unitPrice = parseFloat(item.unitPrice) || 0;
                    const taxRate = parseFloat(item.taxRate) || 0;

                    const itemDiscountType =
                        item.discountType || null;

                    const itemDiscountValue =
                        parseFloat(item.discountValue) || 0;

                    let itemDiscount = 0;

                    if (itemDiscountType === "percentage") {
                        itemDiscount =
                            (unitPrice *
                                quantity *
                                itemDiscountValue) /
                            100;
                    } else if (itemDiscountType === "fixed") {
                        itemDiscount = itemDiscountValue;
                    }

                    const lineTotalBeforeTax =
                        unitPrice * quantity - itemDiscount;

                    const taxAmount =
                        (lineTotalBeforeTax * taxRate) / 100;

                    const lineTotal =
                        lineTotalBeforeTax + taxAmount;

                    subtotal += unitPrice * quantity;
                    totalTax += taxAmount;

                    return {
                        ...item,
                        quantity,
                        unitPrice,
                        taxRate,
                        discountType: itemDiscountType,
                        discountValue: itemDiscountValue,
                        discountAmount: itemDiscount,
                        taxAmount,
                        lineTotal,
                    };
                });

                // Calculate invoice-level discount
                let invoiceDiscountAmount = 0;

                if (discountType === "percentage") {
                    invoiceDiscountAmount =
                        (subtotal *
                            parseFloat(discountValue || 0)) /
                        100;
                } else if (discountType === "fixed") {
                    invoiceDiscountAmount =
                        parseFloat(discountValue || 0);
                }

                const subtotalAfterDiscount =
                    subtotal - invoiceDiscountAmount;

                const totalAmount =
                    subtotalAfterDiscount + totalTax;

                // Update invoice
                await client.query(
                    `UPDATE public.invoices SET
                        customer_id = COALESCE($1, customer_id),
                        issue_date = COALESCE($2, issue_date),
                        due_date = $3,
                        po_number = $4,
                        currency = COALESCE($5, currency),
                        payment_terms_id = $6,
                        discount_type = $7,
                        discount_value = $8,
                        discount_amount = $9,
                        tax_calculation_method = COALESCE($10, tax_calculation_method),
                        tax_amount = $11,
                        subtotal = $12,
                        total_amount = $13,
                        amount_due = $13,
                        notes = $14,
                        updated_at = NOW()
                    WHERE id = $15`,
                    [
                        customerId || null,
                        issueDate || null,
                        dueDate || null,
                        poNumber || null,
                        currency || null,
                        paymentTermsId || null,
                        discountType || null,
                        parseFloat(discountValue || 0),
                        invoiceDiscountAmount,
                        taxCalculationMethod || null,
                        totalTax,
                        subtotalAfterDiscount,
                        totalAmount,
                        notes || null,
                        invoiceId,
                    ]
                );

                // Remove existing invoice items
                await client.query(
                    `DELETE FROM public.invoice_items 
                     WHERE invoice_id = $1`,
                    [invoiceId]
                );

                // Insert updated invoice items
                for (let i = 0; i < processedItems.length; i++) {
                    const item = processedItems[i];

                    await client.query(
                        `INSERT INTO public.invoice_items (
                            invoice_id,
                            description,
                            quantity,
                            unit_price,
                            discount_type,
                            discount_value,
                            discount_amount,
                            tax_rate,
                            tax_amount,
                            line_total,
                            sort_order
                        )
                        VALUES (
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
                        )`,
                        [
                            invoiceId,
                            item.description,
                            item.quantity,
                            item.unitPrice,
                            item.discountType || null,
                            item.discountValue || 0,
                            item.discountAmount || 0,
                            item.taxRate || 0,
                            item.taxAmount || 0,
                            item.lineTotal || 0,
                            i,
                        ]
                    );
                }
            } else {
                // Update invoice header only
                await client.query(
                    `UPDATE public.invoices SET
                        customer_id = COALESCE($1, customer_id),
                        issue_date = COALESCE($2, issue_date),
                        due_date = $3,
                        po_number = $4,
                        currency = COALESCE($5, currency),
                        payment_terms_id = $6,
                        notes = $7,
                        updated_at = NOW()
                    WHERE id = $8`,
                    [
                        customerId || null,
                        issueDate || null,
                        dueDate || null,
                        poNumber || null,
                        currency || null,
                        paymentTermsId || null,
                        notes || null,
                        invoiceId,
                    ]
                );
            }

            await client.query("COMMIT");

            // Fetch updated invoice
            const invoiceResult = await client.query(
                `SELECT 
                    i.*,
                    c.company_name AS customer_name
                 FROM public.invoices i
                 LEFT JOIN public.customers c 
                    ON i.customer_id = c.id
                 WHERE i.id = $1`,
                [invoiceId]
            );

            const itemsResult = await client.query(
                `SELECT *
                 FROM public.invoice_items
                 WHERE invoice_id = $1
                 ORDER BY sort_order`,
                [invoiceId]
            );

            return NextResponse.json({
                ...invoiceResult.rows[0],
                items: itemsResult.rows,
            });
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Error updating invoice:", error);

        return NextResponse.json(
            { error: "Failed to update invoice" },
            { status: 500 }
        );
    }
}

// DELETE: Delete invoice (draft only)
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getUserIdFromRequest(req);

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { pool } = await getTenantDatabaseForUser(userId);

        const { id: invoiceId } = await params;

        // Check if invoice exists and is in draft status
        const checkResult = await pool.query(
            `SELECT status
             FROM public.invoices
             WHERE id = $1`,
            [invoiceId]
        );

        if (checkResult.rows.length === 0) {
            return NextResponse.json(
                { error: "Invoice not found" },
                { status: 404 }
            );
        }

        if (checkResult.rows[0].status !== "draft") {
            return NextResponse.json(
                { error: "Only draft invoices can be deleted" },
                { status: 400 }
            );
        }

        // Delete invoice.
        // Invoice items are expected to be removed through CASCADE.
        await pool.query(
            `DELETE FROM public.invoices
             WHERE id = $1`,
            [invoiceId]
        );

        return NextResponse.json(
            { message: "Invoice deleted successfully" },
            { status: 200 }
        );
    } catch (error) {
        console.error("Error deleting invoice:", error);

        return NextResponse.json(
            { error: "Failed to delete invoice" },
            { status: 500 }
        );
    }
}