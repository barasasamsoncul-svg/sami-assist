import {
  NextResponse,
} from 'next/server';

import {
  getInvoicingInvoiceDetail,
} from '@/lib/apps/invoicing/service';

import {
  INVOICING_PERMISSIONS,
  InvoicingError,
  requireInvoicingContext,
} from '@/lib/apps/invoicing/context';

import {
  renderInvoicePdf,
} from '@/lib/apps/invoicing/pdf';

import {
  ensurePrimaryInvoiceDocumentSnapshot,
} from '@/lib/apps/invoicing/document-snapshots';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export async function GET(
  request:
    Request,
  {
    params,
  }: {
    params:
      Promise<{
        invoiceId:
          string;
      }>;
  },
) {
  try {
    const {
      invoiceId,
    } =
      await params;

    const context =
      await requireInvoicingContext(
        INVOICING_PERMISSIONS
          .INVOICE_VIEW,
      );

    const invoice =
      await getInvoicingInvoiceDetail(
        invoiceId,
      );

    if (
      !invoice
    ) {
      return new NextResponse(
        'Invoice not found.',
        {
          status:
            404,
        },
      );
    }

    const url =
      new URL(
        request.url,
      );

    const download =
      url.searchParams
        .get(
          'download',
        ) ===
      '1';

    const filename =
      invoice.invoiceNumber
        .replace(
          /[^a-z0-9._-]+/gi,
          '-',
        )
        .slice(
          0,
          120,
        ) +
      '.pdf';

    if (
      ![
        'draft',
        'pending_approval',
        'rejected',
      ].includes(
        invoice.status,
      )
    ) {
      const snapshot =
        await ensurePrimaryInvoiceDocumentSnapshot(
          context.pool,
          {
            companyId:
              context.companyId,
            invoiceId:
              invoice.id,
            userId:
              context.userId,
            reason:
              'legacy_backfill',
          },
        );

      const pdfBody =
        Uint8Array
          .from(
            snapshot.pdf,
          )
          .buffer;

      return new NextResponse(
        pdfBody,
        {
          status:
            200,
          headers: {
            'Content-Type':
              'application/pdf',
            'Content-Disposition':
              (
                download
                  ? 'attachment'
                  : 'inline'
              ) +
              '; filename="' +
              filename +
              '"',
            'Cache-Control':
              'private, no-store, no-cache, must-revalidate',
            Pragma:
              'no-cache',
            'X-Content-Type-Options':
              'nosniff',
            'Referrer-Policy':
              'no-referrer',
            ETag:
              '"' +
              snapshot.pdfSha256 +
              '"',
            'Content-Length':
              String(
                snapshot.pdfSizeBytes,
              ),
            'X-SaMi-Document-Snapshot':
              snapshot.id,
          },
        },
      );
    }

    const [
      companyResult,
      templateResult,
    ] =
      await Promise.all([
        context.pool.query(
          `
            SELECT
              name,
              email,
              phone,
              address,
              tax_id,
              registration_number
            FROM companies
            WHERE id = $1
            LIMIT 1
          `,
          [
            context.companyId,
          ],
        ),

        context.pool.query(
          `
            SELECT
              layout,
              primary_color,
              secondary_color,
              font_family,
              density,
              header_style,
              document_title,
              from_label,
              bill_to_label,
              notes_label,
              terms_label,
              payment_label,
              footer_alignment,
              show_status,
              show_page_numbers,
              show_sku,
              show_unit,
              show_quantity,
              show_unit_price,
              show_line_tax,
              show_line_discount,
              show_company_address,
              show_company_contact,
              show_tax_id,
              show_payment_instructions,
              show_tax_breakdown,
              show_discount,
              footer_text,
              terms_text
            FROM invoicing_templates
            WHERE company_id = $1
              AND deleted_at IS NULL
              AND is_active = TRUE
            ORDER BY
              CASE
                WHEN id = $2::uuid
                  THEN 0
                WHEN is_default = TRUE
                  THEN 1
                ELSE 2
              END,
              created_at ASC
            LIMIT 1
          `,
          [
            context.companyId,
            invoice.templateId,
          ],
        ),
      ]);

    const company =
      companyResult.rows[0] ||
      {};

    const template =
      templateResult.rows[0] ||
      {};

    const pdf =
      renderInvoicePdf({
        invoiceNumber:
          invoice.invoiceNumber,
        status:
          invoice.status,
        invoiceDate:
          invoice.invoiceDate,
        dueDate:
          invoice.dueDate,
        serviceDate:
          invoice.serviceDate,
        currency:
          invoice.currency,
        reference:
          invoice.reference,
        purchaseOrderNumber:
          invoice.purchaseOrderNumber,
        paymentTermsName:
          invoice.customer
            .paymentTermsName,
        taxCalculation:
          invoice.taxCalculation,
        subtotal:
          invoice.subtotal,
        discountTotal:
          invoice.discountTotal,
        taxTotal:
          invoice.taxTotal,
        shippingTotal:
          invoice.shippingTotal,
        roundingAdjustment:
          invoice.roundingAdjustment,
        totalAmount:
          invoice.totalAmount,
        paidAmount:
          invoice.paidAmount,
        creditedAmount:
          invoice.creditedAmount,
        balanceDue:
          invoice.balanceDue,
        notes:
          invoice.notes,
        terms:
          invoice.terms,
        paymentInstructions:
          invoice.paymentInstructions,
        template: {
          layout:
            String(
              template.layout ||
              'modern',
            ),
          primaryColor:
            String(
              template.primary_color ||
              '#164a9f',
            ),
          secondaryColor:
            String(
              template.secondary_color ||
              '#0f172a',
            ),
          fontFamily:
            String(
              template.font_family ||
              'Inter',
            ),
          density:
            String(
              template.density ||
              'comfortable',
            ),
          headerStyle:
            String(
              template.header_style ||
              'band',
            ),
          documentTitle:
            String(
              template.document_title ||
              'Invoice',
            ),
          fromLabel:
            String(
              template.from_label ||
              'From',
            ),
          billToLabel:
            String(
              template.bill_to_label ||
              'Bill to',
            ),
          notesLabel:
            String(
              template.notes_label ||
              'Notes',
            ),
          termsLabel:
            String(
              template.terms_label ||
              'Terms',
            ),
          paymentLabel:
            String(
              template.payment_label ||
              'Payment instructions',
            ),
          footerAlignment:
            String(
              template.footer_alignment ||
              'left',
            ),
          showStatus:
            template.show_status !==
            false,
          showPageNumbers:
            template.show_page_numbers !==
            false,
          showSku:
            template.show_sku !==
            false,
          showUnit:
            template.show_unit !==
            false,
          showQuantity:
            template.show_quantity !==
            false,
          showUnitPrice:
            template.show_unit_price !==
            false,
          showLineTax:
            template.show_line_tax !==
            false,
          showLineDiscount:
            template.show_line_discount !==
            false,
          showCompanyAddress:
            template.show_company_address !==
              false,
          showCompanyContact:
            template.show_company_contact !==
              false,
          showTaxId:
            template.show_tax_id !==
              false,
          showPaymentInstructions:
            template.show_payment_instructions !==
              false,
          showTaxBreakdown:
            template.show_tax_breakdown !==
              false,
          showDiscount:
            template.show_discount !==
              false,
          footerText:
            template.footer_text
              ? String(
                  template.footer_text,
                )
              : null,
          termsText:
            template.terms_text
              ? String(
                  template.terms_text,
                )
              : null,
        },
        customer: {
          name:
            invoice.customer
              .name,
          email:
            invoice.customer
              .email,
          phone:
            invoice.customer
              .phone,
          taxId:
            invoice.customer
              .taxId,
          billingAddress:
            invoice.customer
              .billingAddress,
          shippingAddress:
            invoice.customer
              .shippingAddress,
        },
        company: {
          name:
            String(
              company.name ||
              context.company
                .currentCompany
                .name,
            ),
          email:
            company.email
              ? String(
                  company.email,
                )
              : null,
          phone:
            company.phone
              ? String(
                  company.phone,
                )
              : null,
          address:
            company.address
              ? String(
                  company.address,
                )
              : null,
          taxId:
            company.tax_id
              ? String(
                  company.tax_id,
                )
              : null,
          registrationNumber:
            company.registration_number
              ? String(
                  company.registration_number,
                )
              : null,
        },
        lines:
          invoice.lines.map(
            line => ({
              description:
                line.description,
              sku:
                line.sku,
              unit:
                line.unit,
              quantity:
                line.quantity,
              unitPrice:
                line.unitPrice,
              discountAmount:
                line.discountAmount,
              taxName:
                line.taxName,
              taxRate:
                line.taxRate,
              taxAmount:
                line.taxAmount,
              lineTotal:
                line.lineTotal,
            }),
          ),
      });

    return new NextResponse(
      pdf,
      {
        status:
          200,
        headers: {
          'Content-Type':
            'application/pdf',
          'Content-Disposition':
            (
              download
                ? 'attachment'
                : 'inline'
            ) +
            '; filename="' +
            filename +
            '"',
          'Cache-Control':
            'private, no-store, no-cache, must-revalidate',
          Pragma:
            'no-cache',
          'X-Content-Type-Options':
            'nosniff',
          'Referrer-Policy':
            'no-referrer',
        },
      },
    );
  } catch (
    error
  ) {
    if (
      error instanceof
        InvoicingError &&
      error.code ===
        'INVOICE_NOT_FOUND'
    ) {
      return new NextResponse(
        'Invoice not found.',
        {
          status:
            404,
        },
      );
    }

    console.error(
      '[SaMi Invoicing] Authenticated PDF render failed:',
      error,
    );

    return new NextResponse(
      'Invoice PDF could not be generated.',
      {
        status:
          500,
      },
    );
  }
}
