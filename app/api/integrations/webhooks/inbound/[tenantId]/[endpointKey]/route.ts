import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  IntegrationWebhookError,
  receiveIntegrationWebhook,
} from '@/lib/integrations/webhooks';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

type Context = {
  params:
    Promise<{
      tenantId:
        string;
      endpointKey:
        string;
    }>;
};

function json(
  body:
    Record<
      string,
      unknown
    >,
  status:
    number,
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate, private',
        Pragma:
          'no-cache',
        'X-Content-Type-Options':
          'nosniff',
        'Referrer-Policy':
          'no-referrer',
      },
    },
  );
}

export async function POST(
  request:
    NextRequest,
  context:
    Context,
) {
  try {
    const contentLength =
      Number(
        request.headers
          .get(
            'content-length',
          ) ||
        0,
      );

    if (
      Number.isFinite(
        contentLength,
      ) &&
      contentLength >
        256 * 1024
    ) {
      return json(
        {
          success:
            false,
          code:
            'WEBHOOK_TOO_LARGE',
        },
        413,
      );
    }

    const params =
      await context.params;

    const result =
      await receiveIntegrationWebhook({
        tenantId:
          params.tenantId,
        endpointKey:
          params.endpointKey,
        authorization:
          request.headers
            .get(
              'authorization',
            ),
        eventKeyHeader:
          request.headers
            .get(
              'x-sami-event-key',
            ),
        externalEventId:
          request.headers
            .get(
              'x-sami-event-id',
            ),
        rawBody:
          await request.text(),
      });

    return json(
      {
        success:
          true,
        ...result,
      },
      202,
    );
  } catch (
    error
  ) {
    if (
      error instanceof
        IntegrationWebhookError
    ) {
      return json(
        {
          success:
            false,
          code:
            error.code,
          error:
            error.message,
        },
        error.status,
      );
    }

    console.error(
      '[SaMi Integrations] Inbound webhook failed:',
      error,
    );

    return json(
      {
        success:
          false,
        code:
          'WEBHOOK_FAILED',
      },
      500,
    );
  }
}
