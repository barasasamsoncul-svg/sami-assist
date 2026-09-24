import {
  NextResponse,
} from 'next/server';

import {
  getSalesQuoteDetail,
} from '@/lib/apps/sales/service';

import {
  requireSalesContext,
  SALES_PERMISSIONS,
} from '@/lib/apps/sales/context';

import {
  renderSalesQuotePdf,
} from '@/lib/apps/sales/pdf';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export async function GET(
  _request:
    Request,
  {
    params,
  }: {
    params:
      Promise<{
        quoteId: string;
      }>;
  },
) {
  try {
    const {
      quoteId,
    } =
      await params;

    const context =
      await requireSalesContext(
        SALES_PERMISSIONS
          .QUOTE_VIEW,
      );

    const quote =
      await getSalesQuoteDetail(
        quoteId,
      );

    if (
      !quote
    ) {
      return new NextResponse(
        'Quotation not found.',
        {
          status:
            404,
        },
      );
    }

    const [
      companyResult,
      settingsResult,
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
              primary_color,
              secondary_color,
              footer_text
            FROM sales_settings
            WHERE company_id = $1
            LIMIT 1
          `,
          [
            context.companyId,
          ],
        ),
      ]);

    const company =
      companyResult.rows[0] ||
      {};

    const settings =
      settingsResult.rows[0] ||
      {};

    const pdf =
      renderSalesQuotePdf({
        tenantId:
          context.tenantId,
        token:
          '',
        id:
          quote.id,
        quoteNumber:
          quote.quoteNumber,
        status:
          quote.status,
        quoteDate:
          quote.quoteDate,
        validUntil:
          quote.validUntil,
        currency:
          quote.currency,
        reference:
          quote.reference,
        subtotal:
          quote.subtotal,
        discountTotal:
          quote.discountTotal,
        taxTotal:
          quote.taxTotal,
        shippingTotal:
          quote.shippingTotal,
        totalAmount:
          quote.totalAmount,
        notes:
          quote.notes,
        terms:
          quote.terms,
        salesOrderId:
          quote.salesOrderId,
        latestInvoiceId:
          quote.latestInvoiceId,
        customer: {
          name:
            quote.customerName,
          email:
            quote.customerEmail,
          phone:
            quote.customerPhone,
          taxId:
            quote.customerTaxId,
          billingAddress:
            quote.billingAddress,
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
        portal: {
          allowAcceptance:
            false,
          allowRejection:
            false,
        },
        template: {
          primaryColor:
            String(
              settings.primary_color ||
              '#164a9f',
            ),
          secondaryColor:
            String(
              settings.secondary_color ||
              '#0f172a',
            ),
          footerText:
            settings.footer_text
              ? String(
                  settings.footer_text,
                )
              : null,
        },
        lines:
          quote.lines.map(
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
              discountType:
                line.discountType,
              discountValue:
                line.discountValue,
              discountAmount:
                line.discountAmount,
              taxName:
                line.taxName,
              taxRate:
                line.taxRate,
              taxAmount:
                line.taxAmount,
              subtotal:
                line.subtotal,
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
            'inline; filename="' +
            quote.quoteNumber
              .replace(
                /[^a-z0-9._-]+/gi,
                '-',
              ) +
            '.pdf"',
          'Cache-Control':
            'private, no-store, no-cache, must-revalidate',
        },
      },
    );
  } catch (
    error
  ) {
    console.error(
      '[SaMi Sales] PDF render failed:',
      error,
    );

    return new NextResponse(
      'Quotation PDF could not be generated.',
      {
        status:
          500,
      },
    );
  }
}
