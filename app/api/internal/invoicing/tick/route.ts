import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  runInvoicingWorkerTick,
} from '@/lib/apps/invoicing/worker';

import {
  runTrackedPlatformJob,
} from '@/lib/observability/platform-jobs';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


function response(
  body:
    Record<string, unknown>,
  status =
    200,
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


function configuredSecret() {
  return (
    process.env
      .SAMI_INVOICING_WORKER_SECRET ||
    process.env
      .CRON_SECRET ||
    ''
  ).trim();
}


function authorized(
  request:
    NextRequest,
) {
  const secret =
    configuredSecret();

  if (!secret) {
    return false;
  }

  const auth =
    request.headers
      .get(
        'authorization',
      )
      ?.trim() ||
    '';

  return auth ===
    'Bearer ' +
    secret;
}


export async function GET(
  request:
    NextRequest,
) {
  if (
    !configuredSecret()
  ) {
    return response(
      {
        success:
          false,
        code:
          'INVOICING_WORKER_DISABLED',
      },
      404,
    );
  }

  if (
    !authorized(
      request,
    )
  ) {
    return response(
      {
        success:
          false,
        code:
          'INVOICING_WORKER_UNAUTHORIZED',
      },
      401,
    );
  }

  try {
    const summary =
      await runTrackedPlatformJob(
        {
          jobKey:
            'invoicing.tick',
          triggerType:
            'cron',
          provider:
            'internal',
          source:
            'invoicing_worker',
          category:
            'invoicing_worker_failed',
          route:
            '/api/internal/invoicing/tick',
          operation:
            'run_invoicing_worker_tick',
        },
        () =>
          runInvoicingWorkerTick(),
      );

    return response({
      success:
        true,
      summary,
    });
  } catch (
    error
  ) {
    console.error(
      '[SaMi Invoicing] Worker tick failed:',
      error,
    );

    return response(
      {
        success:
          false,
        code:
          'INVOICING_WORKER_FAILED',
      },
      500,
    );
  }
}
