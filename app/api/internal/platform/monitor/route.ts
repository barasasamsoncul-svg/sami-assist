import crypto from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  syncPlatformServiceSubscriptions,
} from '@/lib/admin/platform-services';

import {
  runTrackedPlatformJob,
} from '@/lib/observability/platform-jobs';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


function safeEqual(
  left:
    string,
  right:
    string,
) {
  const a =
    Buffer.from(
      left,
      'utf8',
    );

  const b =
    Buffer.from(
      right,
      'utf8',
    );

  return (
    a.length ===
      b.length &&
    crypto.timingSafeEqual(
      a,
      b,
    )
  );
}


function authorized(
  request:
    NextRequest,
) {
  const monitorSecret =
    process.env
      .SAMI_PLATFORM_MONITOR_SECRET
      ?.trim() ||
    '';

  const cronSecret =
    process.env
      .CRON_SECRET
      ?.trim() ||
    '';

  const monitorHeader =
    request.headers
      .get(
        'x-sami-platform-monitor-secret',
      )
      ?.trim() ||
    '';

  const authorization =
    request.headers
      .get(
        'authorization',
      )
      ?.trim() ||
    '';

  const bearer =
    authorization
      .toLowerCase()
      .startsWith(
        'bearer ',
      )
      ? authorization
          .slice(
            7,
          )
          .trim()
      : '';

  return (
    Boolean(
      monitorSecret &&
      monitorHeader,
    ) &&
    safeEqual(
      monitorSecret,
      monitorHeader,
    )
  ) ||
  (
    Boolean(
      cronSecret &&
      bearer,
    ) &&
    safeEqual(
      cronSecret,
      bearer,
    )
  );
}


async function runMonitor(
  request:
    NextRequest,
) {
  if (
    !authorized(
      request,
    )
  ) {
    return NextResponse.json(
      {
        success:
          false,
      },
      {
        status:
          404,
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  }

  try {
    const report =
      await runTrackedPlatformJob(
        {
          jobKey:
            'platform.services.monitor',
          triggerType:
            request.method ===
              'GET'
              ? 'cron'
              : 'internal',
          provider:
            'platform',
          source:
            'platform_monitor',
          category:
            'platform_service_monitor_failed',
          route:
            '/api/internal/platform/monitor',
          operation:
            'sync_platform_service_subscriptions',
        },
        () =>
          syncPlatformServiceSubscriptions(),
      );

    return NextResponse.json(
      {
        success:
          true,
        report,
      },
      {
        status:
          200,
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  } catch (
    error
  ) {
    console.error(
      '[SaMi Platform] Service monitor failed:',
      error,
    );

    return NextResponse.json(
      {
        success:
          false,
      },
      {
        status:
          500,
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  }
}


export async function GET(
  request:
    NextRequest,
) {
  return runMonitor(
    request,
  );
}


export async function POST(
  request:
    NextRequest,
) {
  return runMonitor(
    request,
  );
}
