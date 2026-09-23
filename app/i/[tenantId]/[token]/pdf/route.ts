import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getPublicInvoice,
  InvoicingError,
} from '@/lib/apps/invoicing/service';

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
      }>;
  },
) {
  const {
    tenantId,
    token,
  } =
    await params;

  try {
    const invoice =
      await getPublicInvoice(
        tenantId,
        token,
        {
          markViewed:
            false,
        },
      );

    const pdf =
      renderInvoicePdf(
        invoice,
      );

    const filename =
      (
        invoice.invoiceNumber ||
        'invoice'
      )
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
      error.code ===
        'INVOICE_NOT_FOUND'
    ) {
      return NextResponse.json(
        {
          success:
            false,
          code:
            'INVOICE_NOT_FOUND',
        },
        {
          status:
            404,
        },
      );
    }

    console.error(
      '[SaMi Invoicing] Public PDF failed:',
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
