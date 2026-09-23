import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  runAutomationWorkerTick,
} from '@/lib/automation/worker';

import {
  isAutomationWorkerEnabled,
} from '@/lib/automation/registry';

import {
  runTrackedPlatformJob,
} from '@/lib/observability/platform-jobs';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

function response(
  body:
    Record<
      string,
      unknown
    >,
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
  const value =
    process.env
      .SAMI_AUTOMATION_WORKER_SECRET ||
    process.env
      .CRON_SECRET ||
    '';

  return value.trim();
}

function authorized(
  request:
    NextRequest,
) {
  const secret =
    configuredSecret();

  if (
    !secret
  ) {
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
    `Bearer ${secret}`;
}

export async function GET(
  request:
    NextRequest,
) {
  if (
    !isAutomationWorkerEnabled() ||
    !configuredSecret()
  ) {
    return response(
      {
        success:
          false,
        code:
          'AUTOMATION_WORKER_DISABLED',
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
          'AUTOMATION_WORKER_UNAUTHORIZED',
      },
      401,
    );
  }

  try {
    const summary =
      await runTrackedPlatformJob(
        {
          jobKey:
            'automation.tick',
          triggerType:
            'cron',
          provider:
            'internal',
          source:
            'automation_worker',
          category:
            'automation_worker_failed',
          route:
            '/api/internal/automation/tick',
          operation:
            'run_automation_worker_tick',
        },
        () =>
          runAutomationWorkerTick(),
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
      '[SaMi Automation] Worker tick failed:',
      error,
    );

    return response(
      {
        success:
          false,
        code:
          'AUTOMATION_WORKER_FAILED',
      },
      500,
    );
  }
}
