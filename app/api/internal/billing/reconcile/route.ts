import crypto from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  reconcileWorkspaceBilling,
} from '@/lib/billing/reconcile';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

function authorized(
  request:
    NextRequest,
) {
  const expected =
    process.env
      .SAMI_BILLING_WORKER_SECRET
      ?.trim();

  const received =
    request.headers
      .get(
        'x-sami-billing-secret',
      )
      ?.trim();

  if (
    !expected ||
    !received
  ) {
    return false;
  }

  const left =
    Buffer.from(
      expected,
      'utf8',
    );

  const right =
    Buffer.from(
      received,
      'utf8',
    );

  return (
    left.length ===
      right.length &&
    crypto.timingSafeEqual(
      left,
      right,
    )
  );
}

export async function POST(
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
      await reconcileWorkspaceBilling();

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
