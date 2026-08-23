import { NextRequest, NextResponse } from "next/server";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";
import { getUserIdFromRequest } from "@/lib/auth-helpers";

// GET: List all invoices
export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromRequest(req);
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { pool, business } = await getTenantDatabaseForUser(userId);

        const { searchParams } = new URL(req.url);
        const status = searchParams.get("status");
        const customerId = searchParams.get("customerId");
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "50");
        const offset = (page - 1) * limit;

        const params: any[] = [];
        let paramIndex = 1;

        // Build WHERE clause
        let whereClause = "WHERE 1=1";
        if (status) {
            whereClause += ` AND i.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        if (customerId) {
            whereClause += ` AND i.customer_id = $${paramIndex}`;
            params.push(customerId);
            paramIndex++;
        }

        // Get total count
        const countQuery = `SELECT COUNT(*) FROM public.invoices i ${whereClause}`;
        const countResult = await pool.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        // Get invoices with customer info
        const query = `
            SELECT 
                i.*,
                c.company_name as customer_name,
                c.email as customer_email,
                c.phone as customer_phone
            FROM public.invoices i
            LEFT JOIN public.customers c ON i.customer_id = c.id
            ${whereClause}
            ORDER BY i.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        return NextResponse.json({
            data: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Error fetching invoices:", error);
        return NextResponse.json(
            { error: "Failed to fetch invoices" },
            { status: 500 }
        );
    }
}

// POST: Create a new invoice
export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromRequest(req);
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { pool } = await getTenantDatabaseForUser(userId);
        const body = await req.json();

        const {
            customerId,
            issueDate,
            dueDate,
            poNumber,
            currency = "USD",
            items,
            notes,
            paymentTermsId,
            discountType,
            discountValue,
            taxCalculationMethod = "exclusive",
        } = body;

        // Validate required fields
        if (!customerId) {
            return NextResponse.json(
                { error: "Customer ID is required" },
                { status: 400 }
            );
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { error: "At least one item is required" },
                { status: 400 }
            );
        }

        // Start transaction
        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            // Get next invoice number
            const settingsResult = await client.query(
                `SELECT invoice_prefix, invoice_next_number, invoice_number_padding 
                 FROM public.invoice_settings 
                 LIMIT 1`
            );

            let prefix = "INV-";
            let nextNumber = 1;
            let padding = 6;

            if (settingsResult.rows.length > 0) {
                prefix = settingsResult.rows[0].invoice_prefix || "INV-";
                nextNumber = settingsResult.rows[0].invoice_next_number || 1;
                padding = settingsResult.rows[0].invoice_number_padding || 6;
            }

            const paddedNumber = String(nextNumber).padStart(padding, "0");
            const invoiceNumber = `${prefix}${paddedNumber}`;

            // Calculate totals
            let subtotal = 0;
            let totalTax = 0;
            let totalDiscount = 0;

            const processedItems = items.map((item: any) => {
                const quantity = parseFloat(item.quantity) || 1;
                const unitPrice = parseFloat(item.unitPrice) || 0;
                const taxRate = parseFloat(item.taxRate) || 0;
                const itemDiscountType = item.discountType || null;
                const itemDiscountValue = parseFloat(item.discountValue) || 0;

                let itemDiscount = 0;
                if (itemDiscountType === "percentage") {
                    itemDiscount = (unitPrice * quantity * itemDiscountValue) / 100;
                } else if (itemDiscountType === "fixed") {
                    itemDiscount = itemDiscountValue;
                }

                const lineTotalBeforeTax = (unitPrice * quantity) - itemDiscount;
                const taxAmount = (lineTotalBeforeTax * taxRate) / 100;
                const lineTotal = lineTotalBeforeTax + taxAmount;

                subtotal += unitPrice * quantity;
                totalTax += taxAmount;
                totalDiscount += itemDiscount;

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

            // Apply invoice-level discount
            let invoiceDiscountAmount = 0;
            if (discountType === "percentage") {
                invoiceDiscountAmount = (subtotal * parseFloat(discountValue || 0)) / 100;
            } else if (discountType === "fixed") {
                invoiceDiscountAmount = parseFloat(discountValue || 0);
            }

            const totalAfterDiscount = subtotal - invoiceDiscountAmount;
            const totalAmount = totalAfterDiscount + totalTax;

            // Get payment terms display
            let paymentTermsDisplay = null;
            if (paymentTermsId) {
                const termsResult = await client.query(
                    `SELECT name FROM public.payment_terms WHERE id = $1`,
                    [paymentTermsId]
                );
                if (termsResult.rows.length > 0) {
                    paymentTermsDisplay = termsResult.rows[0].name;
                }
            }

            // Insert invoice
            const invoiceResult = await client.query(
                `INSERT INTO public.invoices (
                    customer_id,
                    invoice_number,
                    issue_date,
                    due_date,
                    po_number,
                    currency,
                    payment_terms_id,
                    payment_terms_display,
                    discount_type,
                    discount_value,
                    discount_amount,
                    tax_calculation_method,
                    tax_amount,
                    subtotal,
                    total_amount,
                    amount_due,
                    notes,
                    status,
                    created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'draft', $18)
                RETURNING id`,
                [
                    customerId,
                    invoiceNumber,
                    issueDate || new Date().toISOString().split("T")[0],
                    dueDate || null,
                    poNumber || null,
                    currency,
                    paymentTermsId || null,
                    paymentTermsDisplay,
                    discountType || null,
                    parseFloat(discountValue || 0),
                    invoiceDiscountAmount,
                    taxCalculationMethod || "exclusive",
                    totalTax,
                    subtotal - invoiceDiscountAmount,
                    totalAmount,
                    totalAmount,
                    notes || null,
                    userId,
                ]
            );

            const invoiceId = invoiceResult.rows[0].id;

            // Insert invoice items
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
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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

            // Update next invoice number
            await client.query(
                `UPDATE public.invoice_settings 
                 SET invoice_next_number = $1 
                 WHERE id = (
                     SELECT id FROM public.invoice_settings LIMIT 1
                 )`,
                [nextNumber + 1]
            );

            await client.query("COMMIT");

            // Fetch the complete invoice with items
            const invoiceResult2 = await client.query(
                `SELECT i.*, c.company_name as customer_name
                 FROM public.invoices i
                 LEFT JOIN public.customers c ON i.customer_id = c.id
                 WHERE i.id = $1`,
                [invoiceId]
            );

            const itemsResult = await client.query(
                `SELECT * FROM public.invoice_items 
                 WHERE invoice_id = $1 
                 ORDER BY sort_order`,
                [invoiceId]
            );

            return NextResponse.json({
                ...invoiceResult2.rows[0],
                items: itemsResult.rows,
            }, { status: 201 });

        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Error creating invoice:", error);
        return NextResponse.json(
            { error: "Failed to create invoice" },
            { status: 500 }
        );
    }
}