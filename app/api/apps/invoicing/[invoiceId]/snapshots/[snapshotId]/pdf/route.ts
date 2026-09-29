import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  INVOICING_PERMISSIONS,
  requireInvoicingContext,
  requireUuid,
} from '@/lib/apps/invoicing/context';

import {
  getInvoiceDocumentSnapshot,
} from '@/lib/apps/invoicing/document-snapshots';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export async function GET(
  request:
    NextRequest,
  {
    params,
  }: {
    params:
      Promise<{
        invoiceId:
          string;
        snapshotId:
          string;
      }>;
  },
) {
  const {
    invoiceId:
      invoiceIdInput,
    snapshotId:
      snapshotIdInput,
  } =
    await params;

  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .INVOICE_VIEW,
    );

  const invoiceId =
    requireUuid(
      invoiceIdInput,
      'Invoice',
    );

  const snapshotId =
    requireUuid(
      snapshotIdInput,
      'Document snapshot',
    );

  const snapshot =
    await getInvoiceDocumentSnapshot(
      context.pool,
      {
        companyId:
          context.companyId,
        invoiceId,
        snapshotId,
      },
    );

  if (
    !snapshot
  ) {
    return new NextResponse(
      'Document snapshot not found.',
      {
        status:
          404,
      },
    );
  }

  const download =
    request.nextUrl
      .searchParams
      .get(
        'download',
      ) ===
    '1';

  const invoice =
    await context.pool.query(
      `
        SELECT
          invoice_number
        FROM invoicing_invoices
        WHERE id =
              $1
          AND company_id =
              $2
        LIMIT 1
      `,
      [
        invoiceId,
        context.companyId,
      ],
    );

  const baseName =
    String(
      invoice.rows[0]
        ?.invoice_number ||
      'invoice',
    )
      .replace(
        /[^a-z0-9._-]+/gi,
        '-',
      )
      .slice(
        0,
        100,
      );

  const filename =
    baseName +
    '-snapshot-v' +
    snapshot.versionNo +
    '.pdf';

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
        'X-SaMi-Document-Version':
          String(
            snapshot.versionNo,
          ),
      },
    },
  );
}
