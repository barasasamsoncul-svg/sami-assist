import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getPublicInvoice,
  InvoicingError,
} from '@/lib/apps/invoicing/service';

import {
  ensureTenantInvoiceDocumentSnapshot,
} from '@/lib/apps/invoicing/document-snapshots';


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

    const snapshot =
      await ensureTenantInvoiceDocumentSnapshot({
        tenantId,
        invoiceId:
          invoice.id,
        userId:
          null,
        reason:
          'legacy_backfill',
      });

    const pdf =
      snapshot.pdf;

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

  const pdfBody =
    Uint8Array
      .from(
        pdf,
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
