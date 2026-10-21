import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getWorkspaceSubscriptionBillingDocumentPdf,
} from '@/lib/services/workspace-billing';

import {
  handleBillingError,
} from '@/lib/services/workspace-billing-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      documentId: string;
    }>;
  },
) {
  try {
    const { documentId } = await params;
    const document =
      await getWorkspaceSubscriptionBillingDocumentPdf(
        documentId,
      );

    if (!document) {
      return new NextResponse(
        'Subscription invoice or receipt not found.',
        {
          status: 404,
          headers: {
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        },
      );
    }

    const download =
      request.nextUrl.searchParams.get('download') === '1';

    const filename =
      document.documentNumber
        .replace(/[^a-z0-9._-]+/gi, '-')
        .slice(0, 100) + '.pdf';

    return new NextResponse(
      Uint8Array.from(document.pdf),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition':
            `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
          'Cache-Control': 'private, no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
        },
      },
    );
  } catch (error) {
    return handleBillingError(error);
  }
}
