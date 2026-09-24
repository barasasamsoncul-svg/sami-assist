import {
  NextResponse,
} from 'next/server';

import {
  getPublicSalesQuote,
} from '@/lib/apps/sales/public';

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
        tenantId: string;
        token: string;
      }>;
  },
) {
  try {
    const {
      tenantId,
      token,
    } =
      await params;

    const quote =
      await getPublicSalesQuote(
        tenantId,
        token,
        {
          markViewed:
            false,
        },
      );

    const pdf =
      renderSalesQuotePdf(
        quote,
      );

    const filename =
      quote.quoteNumber
        .replace(
          /[^a-z0-9._-]+/gi,
          '-',
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
          'X-Content-Type-Options':
            'nosniff',
        },
      },
    );
  } catch {
    return new NextResponse(
      'Quotation not found.',
      {
        status:
          404,
        headers: {
          'Content-Type':
            'text/plain; charset=utf-8',
          'Cache-Control':
            'no-store',
        },
      },
    );
  }
}
