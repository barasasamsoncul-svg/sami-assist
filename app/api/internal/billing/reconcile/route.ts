import crypto from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  reconcileWorkspaceBilling,
} from '@/lib/billing/reconcile';

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
  const workerSecret =
    process.env
      .SAMI_BILLING_WORKER_SECRET
      ?.trim() ||
    '';

  const cronSecret =
    process.env
      .CRON_SECRET
      ?.trim() ||
    '';

  const workerHeader =
    request.headers
      .get(
        'x-sami-billing-secret',
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
      workerSecret &&
      workerHeader,
    ) &&
    safeEqual(
      workerSecret,
      workerHeader,
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

async function runReconciliation(
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
            'billing.reconcile',
          triggerType:
            request.method ===
              'GET'
              ? 'cron'
              : 'internal',
          provider:
            process.env
              .SAMI_BILLING_PROVIDER
              ?.trim()
              .toLowerCase() ||
            'billing',
          source:
            'billing_worker',
          category:
            'billing_reconciliation_failed',
          route:
            '/api/internal/billing/reconcile',
          operation:
            'reconcile_workspace_billing',
        },
        () =>
          reconcileWorkspaceBilling(),
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
      '[SaMi Billing] Reconciliation worker failed:',
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
  return runReconciliation(
    request,
  );
}

export async function POST(
  request:
    NextRequest,
) {
  return runReconciliation(
    request,
  );
}
