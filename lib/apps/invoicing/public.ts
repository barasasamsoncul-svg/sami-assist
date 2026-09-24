import 'server-only';

import crypto from 'crypto';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  InvoicingError,
  money,
  requireUuid,
  cleanText,
} from '@/lib/apps/invoicing/context';


function sha256(
  value:
    string,
) {
  return crypto
    .createHash(
      'sha256',
    )
    .update(
      value,
    )
    .digest(
      'hex',
    );
}


export async function getPublicInvoice(
  tenantIdInput:
    string,
  tokenInput:
    string,
  options: {
    markViewed?: boolean;
  } = {},
) {
  const tenantId =
    requireUuid(
      tenantIdInput,
      'Workspace',
    );

  const token =
    cleanText(
      tokenInput,
      200,
    );

  if (
    token.length <
      32
  ) {
    throw new InvoicingError(
      'INVOICE_NOT_FOUND',
      'Invoice link is invalid or expired.',
    );
  }

  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  const result =
    await pool.query(
      `
        SELECT
          i.id,
          i.invoice_number,
          i.status,
          i.invoice_date,
          i.due_date,
          i.currency,
          i.reference,
          i.purchase_order_number,
          i.payment_terms_name_snapshot,
          i.tax_calculation,
          i.subtotal,
          i.discount_total,
          i.tax_total,
          i.shipping_total,
          i.rounding_adjustment,
          i.total_amount,
          i.notes,
          i.terms,
          i.payment_instructions,
          COALESCE(
            i.bill_to_name,
            c.name
          )
            AS customer_name,
          COALESCE(
            i.bill_to_email,
            c.email
          )
            AS customer_email,
          COALESCE(
            i.bill_to_phone,
            c.phone
          )
            AS customer_phone,
          COALESCE(
            i.bill_to_address,
            c.billing_address
          )
            AS billing_address,
          COALESCE(
            i.bill_to_tax_id,
            c.tax_id
          )
            AS customer_tax_id,
          company.name
            AS company_name,
          company.legal_name
            AS company_legal_name,
          company.logo_url,
          company.email
            AS company_email,
          company.phone
            AS company_phone,
          company.address,
          company.address_line1,
          company.address_line2,
          company.city,
          company.country,
          company.tax_id,
          company.registration_number,
          template.name
            AS template_name,
          template.layout
            AS template_layout,
          template.primary_color,
          template.secondary_color,
          template.accent_color,
          template.logo_url
            AS template_logo_url,
          template.font_family,
          template.show_company_logo,
          template.show_company_address,
          template.show_company_contact,
          template.show_tax_id,
          template.show_payment_instructions,
          template.show_tax_breakdown,
          template.show_discount,
          template.footer_text,
          template.terms_text
        FROM invoicing_invoices i
        INNER JOIN invoicing_customers c
          ON c.id =
             i.customer_id
        INNER JOIN companies company
          ON company.id =
             i.company_id
        LEFT JOIN invoicing_templates template
          ON template.id =
             i.template_id
         AND template.company_id =
             i.company_id
         AND template.deleted_at
             IS NULL
        WHERE i.public_token_hash =
              $1
          AND i.public_enabled =
              TRUE
          AND i.deleted_at
              IS NULL
        LIMIT 1
      `,
      [
        sha256(
          token,
        ),
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVOICE_NOT_FOUND',
      'Invoice link is invalid or expired.',
    );
  }

  const invoice =
    result.rows[0];

  const [
    lines,
    settlement,
  ] =
    await Promise.all([
      pool.query(
        `
          SELECT
            description,
            sku_snapshot,
            unit,
            quantity,
            unit_price,
            discount_amount,
            tax_name_snapshot,
            tax_rate,
            tax_amount,
            line_total
          FROM invoicing_invoice_items
          WHERE invoice_id =
                $1
          ORDER BY
            sort_order ASC,
            id ASC
        `,
        [
          invoice.id,
        ],
      ),

      pool.query(
        `
          SELECT
            a.balance_due,
            COALESCE(
              (
                SELECT SUM(
                  allocation.amount
                )
                FROM invoicing_payment_allocations allocation
                INNER JOIN invoicing_payments payment
                  ON payment.id =
                     allocation.payment_id
                WHERE allocation.invoice_id =
                      a.invoice_id
                  AND payment.status =
                      'posted'
                  AND payment.deleted_at
                      IS NULL
              ),
              0
            ) AS paid_amount,
            COALESCE(
              (
                SELECT SUM(
                  credit.total_amount
                )
                FROM invoicing_credit_notes credit
                WHERE credit.invoice_id =
                      a.invoice_id
                  AND credit.status IN (
                    'issued',
                    'applied',
                    'refunded'
                  )
                  AND credit.deleted_at
                      IS NULL
              ),
              0
            ) AS credited_amount
          FROM invoicing_aging a
          WHERE a.invoice_id =
                $1
          LIMIT 1
        `,
        [
          invoice.id,
        ],
      ),
    ]);

  const markViewed =
    options.markViewed !==
    false;

  if (
    markViewed &&
    invoice.status ===
      'sent'
  ) {
    await pool.query(
      `
        UPDATE invoicing_invoices
        SET
          status =
            'viewed',
          viewed_at =
            COALESCE(
              viewed_at,
              NOW()
            ),
          updated_at =
            NOW()
        WHERE id =
              $1
          AND status =
              'sent'
      `,
      [
        invoice.id,
      ],
    );
  }

  return {
    id:
      String(
        invoice.id,
      ),
    invoiceNumber:
      String(
        invoice.invoice_number,
      ),
    status:
      markViewed &&
      invoice.status ===
        'sent'
        ? 'viewed'
        : String(
            invoice.status,
          ),
    invoiceDate:
      String(
        invoice.invoice_date,
      ),
    dueDate:
      String(
        invoice.due_date,
      ),
    currency:
      String(
        invoice.currency,
      ),
    reference:
      invoice.reference
        ? String(
            invoice.reference,
          )
        : null,
    purchaseOrderNumber:
      invoice.purchase_order_number
        ? String(
            invoice.purchase_order_number,
          )
        : null,
    paymentTermsName:
      invoice.payment_terms_name_snapshot
        ? String(
            invoice.payment_terms_name_snapshot,
          )
        : null,
    taxCalculation:
      invoice.tax_calculation ===
        'inclusive'
        ? 'inclusive'
        : 'exclusive',
    subtotal:
      money(
        invoice.subtotal,
      ),
    discountTotal:
      money(
        invoice.discount_total,
      ),
    taxTotal:
      money(
        invoice.tax_total,
      ),
    shippingTotal:
      money(
        invoice.shipping_total,
      ),
    roundingAdjustment:
      money(
        invoice.rounding_adjustment,
      ),
    totalAmount:
      money(
        invoice.total_amount,
      ),
    paidAmount:
      money(
        settlement.rows[0]
          ?.paid_amount,
      ),
    creditedAmount:
      money(
        settlement.rows[0]
          ?.credited_amount,
      ),
    balanceDue:
      [
        'cancelled',
        'void',
        'written_off',
      ].includes(
        String(
          invoice.status,
        ),
      )
        ? 0
        : money(
            settlement.rows[0]
              ?.balance_due,
          ),
    notes:
      invoice.notes
        ? String(
            invoice.notes,
          )
        : null,
    terms:
      invoice.terms
        ? String(
            invoice.terms,
          )
        : null,
    paymentInstructions:
      invoice.payment_instructions
        ? String(
            invoice.payment_instructions,
          )
        : null,

    customer: {
      name:
        String(
          invoice.customer_name,
        ),
      email:
        invoice.customer_email
          ? String(
              invoice.customer_email,
            )
          : null,
      phone:
        invoice.customer_phone
          ? String(
              invoice.customer_phone,
            )
          : null,
      taxId:
        invoice.customer_tax_id
          ? String(
              invoice.customer_tax_id,
            )
          : null,
      billingAddress:
        invoice.billing_address
          ? String(
              invoice.billing_address,
            )
          : null,
    },

    template: {
      name:
        invoice.template_name
          ? String(
              invoice.template_name,
            )
          : 'Modern',
      layout:
        invoice.template_layout
          ? String(
              invoice.template_layout,
            )
          : 'modern',
      primaryColor:
        String(
          invoice.primary_color ||
          '#164a9f',
        ),
      secondaryColor:
        String(
          invoice.secondary_color ||
          '#0f172a',
        ),
      accentColor:
        invoice.accent_color
          ? String(
              invoice.accent_color,
            )
          : null,
      logoUrl:
        invoice.template_logo_url
          ? String(
              invoice.template_logo_url,
            )
          : null,
      fontFamily:
        String(
          invoice.font_family ||
          'Inter',
        ),
      showCompanyLogo:
        invoice.show_company_logo !==
        false,
      showCompanyAddress:
        invoice.show_company_address !==
        false,
      showCompanyContact:
        invoice.show_company_contact !==
        false,
      showTaxId:
        invoice.show_tax_id !==
        false,
      showPaymentInstructions:
        invoice.show_payment_instructions !==
        false,
      showTaxBreakdown:
        invoice.show_tax_breakdown !==
        false,
      showDiscount:
        invoice.show_discount !==
        false,
      footerText:
        invoice.footer_text
          ? String(
              invoice.footer_text,
            )
          : null,
      termsText:
        invoice.terms_text
          ? String(
              invoice.terms_text,
            )
          : null,
    },

    company: {
      name:
        String(
          invoice.company_legal_name ||
          invoice.company_name,
        ),
      logoUrl:
        invoice.template_logo_url
          ? String(
              invoice.template_logo_url,
            )
          : invoice.logo_url
            ? String(
                invoice.logo_url,
              )
            : null,
      email:
        invoice.company_email
          ? String(
              invoice.company_email,
            )
          : null,
      phone:
        invoice.company_phone
          ? String(
              invoice.company_phone,
            )
          : null,
      address:
        [
          invoice.address_line1,
          invoice.address_line2,
          invoice.city,
          invoice.country,
        ]
          .filter(
            Boolean,
          )
          .map(
            (
              value:
                unknown,
            ) =>
              String(
                value,
              ),
          )
          .join(
            ', ',
          ) ||
        (
          invoice.address
            ? String(
                invoice.address,
              )
            : null
        ),
      taxId:
        invoice.tax_id
          ? String(
              invoice.tax_id,
            )
          : null,
      registrationNumber:
        invoice.registration_number
          ? String(
              invoice.registration_number,
            )
          : null,
    },

    lines:
      lines.rows.map(
        row => ({
          description:
            String(
              row.description,
            ),
          sku:
            row.sku_snapshot
              ? String(
                  row.sku_snapshot,
                )
              : null,
          unit:
            String(
              row.unit ||
              'unit',
            ),
          quantity:
            money(
              row.quantity,
            ),
          unitPrice:
            money(
              row.unit_price,
            ),
          discountAmount:
            money(
              row.discount_amount,
            ),
          taxName:
            row.tax_name_snapshot
              ? String(
                  row.tax_name_snapshot,
                )
              : null,
          taxRate:
            money(
              row.tax_rate,
            ),
          taxAmount:
            money(
              row.tax_amount,
            ),
          lineTotal:
            money(
              row.line_total,
            ),
        }),
      ),
  };
}
