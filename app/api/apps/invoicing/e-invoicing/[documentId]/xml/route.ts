import {
  NextResponse,
} from 'next/server';

import {
  InvoicingError,
  getEInvoiceDocumentXml,
} from '@/lib/apps/invoicing/service';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export async function GET(
  _request:
    Request,
  context: {
    params:
      Promise<{
        documentId:
          string;
      }>;
  },
) {
  try {
    const {
      documentId,
    } =
      await context.params;

    const document =
      await getEInvoiceDocumentXml(
        documentId,
      );

    return new NextResponse(
      document.xml,
      {
        status:
          200,
        headers: {
          'Content-Type':
            'application/xml; charset=utf-8',
          'Content-Disposition':
            'attachment; filename="' +
            document.filename +
            '"',
          'X-SaMi-Document-SHA256':
            document.xmlSha256,
          'Cache-Control':
            'private, no-store, no-cache, must-revalidate',
          Pragma:
            'no-cache',
        },
      },
    );
  } catch (
    error
  ) {
    const status =
      error instanceof
        InvoicingError &&
      error.code ===
        'INVOICING_PERMISSION_REQUIRED'
        ? 403
        : error instanceof
              InvoicingError &&
            error.code ===
              'INVOICING_WORKSPACE_SUSPENDED'
          ? 402
          : error instanceof
                InvoicingError &&
              error.code ===
                'INVOICING_NOT_INSTALLED'
            ? 404
            : error instanceof
                  InvoicingError
              ? 422
              : 500;

    return NextResponse.json(
      {
        success:
          false,
        code:
          error instanceof
            InvoicingError
            ? error.code
            : 'EINVOICE_XML_FAILED',
        error:
          error instanceof
            Error
            ? error.message
            : 'SaMi could not load the electronic invoice XML.',
      },
      {
        status,
        headers: {
          'Cache-Control':
            'no-store, no-cache, must-revalidate',
        },
      },
    );
  }
}
