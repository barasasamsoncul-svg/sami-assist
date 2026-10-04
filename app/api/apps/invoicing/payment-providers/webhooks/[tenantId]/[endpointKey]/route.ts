import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  receiveInvoicePaymentProviderWebhook,
} from '@/lib/apps/invoicing/payment-provider-connections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = {
  params: Promise<{
    tenantId: string;
    endpointKey: string;
  }>;
};

async function handle(
  request: NextRequest,
  context: Context,
  rawBody: string,
) {
  const params = await context.params;
  const result = await receiveInvoicePaymentProviderWebhook({
    tenantId: params.tenantId,
    endpointKey: params.endpointKey,
    rawBody,
    headers: request.headers,
    query: request.nextUrl.searchParams,
  });

  return NextResponse.json(
    {
      ...result.body,
      ...(result.status === 200
        ? {
            ResultCode: 0,
            ResultDesc: 'Accepted',
          }
        : {}),
    },
    {
      status: result.status,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    },
  );
}

export async function GET(
  request: NextRequest,
  context: Context,
) {
  return handle(request, context, '');
}

export async function POST(
  request: NextRequest,
  context: Context,
) {
  const contentLength = Number(
    request.headers.get('content-length') || 0,
  );
  if (Number.isFinite(contentLength) && contentLength > 256 * 1024) {
    return NextResponse.json(
      {
        success: false,
        code: 'PAYMENT_WEBHOOK_TOO_LARGE',
      },
      { status: 413 },
    );
  }
  return handle(request, context, await request.text());
}
