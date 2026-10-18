import crypto from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  expireOverdueSalesQuotes,
} from '@/lib/apps/sales/expiry';

import {
  runTrackedPlatformJob,
} from '@/lib/observability/platform-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function configuredSecret() {
  return (
    process.env.SAMI_SALES_EXPIRY_WORKER_SECRET ||
    process.env.CRON_SECRET ||
    ''
  ).trim();
}

function authorized(request: NextRequest) {
  const secret = configuredSecret();
  if (!secret) return false;

  const authorization = request.headers.get('authorization')?.trim() || '';
  const bearer = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';

  const expected = Buffer.from(secret, 'utf8');
  const received = Buffer.from(bearer, 'utf8');

  return (
    Boolean(bearer) &&
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received)
  );
}

export async function GET(request: NextRequest) {
  if (!configuredSecret()) {
    return NextResponse.json(
      { success: false, code: 'SALES_EXPIRY_WORKER_DISABLED' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (!authorized(request)) {
    return NextResponse.json(
      { success: false, code: 'SALES_EXPIRY_WORKER_UNAUTHORIZED' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const summary = await runTrackedPlatformJob(
      {
        jobKey: 'sales.expire_overdue_quotes',
        triggerType: 'cron',
        provider: 'internal',
        source: 'sales_quote_expiry_worker',
        category: 'sales_quote_expiry_failed',
        route: '/api/internal/sales/expire-quotes',
        operation: 'expire_overdue_sales_quotes',
      },
      () => expireOverdueSalesQuotes(),
    );

    return NextResponse.json(
      { success: true, summary },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error(
      '[SaMi Sales] Quote expiry worker failed:',
      error instanceof Error ? error.message : 'Unknown expiry error',
    );

    return NextResponse.json(
      { success: false, code: 'SALES_EXPIRY_WORKER_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
