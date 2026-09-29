import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getCustomerPortalInvoice,
} from '@/lib/apps/invoicing/service';

import {
  InvoicingError,
} from '@/lib/apps/invoicing/context';

import {
  renderInvoicePdf,
} from '@/lib/apps/invoicing/pdf';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export async function GET(
  _request:
    NextRequest,
  {
    params,
  }: {
    params:
      Promise<{
        tenantId:
          string;
        token:
          string;
        invoiceId:
          string;
      }>;
  },
) {
  const {
    tenantId,
    token,
    invoiceId,
  } =
    await params;

  try {
    const invoice =
      await getCustomerPortalInvoice(
        tenantId,
        token,
        invoiceId,
        {
          markViewed:
            false,
          eventType:
            'portal.pdf_downloaded',
        },
      );

    const pdf =
      renderInvoicePdf(
        invoice,
      );

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
      [
        'PORTAL_NOT_FOUND',
        'INVOICE_NOT_FOUND',
      ].includes(
        error.code,
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,
          code:
            error.code,
        },
        {
          status:
            404,
        },
      );
    }

    console.error(
      '[SaMi Invoicing] Customer portal PDF failed:',
      error,
    );

    return NextResponse.json(
      {
        success:
          false,
        code:
          'INVOICE_PDF_FAILED',
      },
      {
        status:
          500,
      },
    );
  }
}
