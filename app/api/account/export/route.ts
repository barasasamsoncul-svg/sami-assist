import {
  NextResponse,
} from 'next/server';

import {
  getSession,
} from '@/lib/auth/session';

import {
  checkRateLimit,
} from '@/lib/auth/rate-limit';

import {
  buildAccountDataExport,
} from '@/lib/data-lifecycle/account-export';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

const EXPORT_WINDOW_MS =
  15 * 60 * 1000;

const EXPORT_BLOCK_MS =
  15 * 60 * 1000;

export async function GET() {
  try {
    const session =
      await getSession();

    if (
      !session
    ) {
      return NextResponse.json(
        {
          success:
            false,
          code:
            'UNAUTHENTICATED',
          error:
            'Sign in to export your SaMi data.',
        },
        {
          status:
            401,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    const rate =
      await checkRateLimit({
        identifier:
          session.user.id,
        action:
          'account_data_export',
        maxAttempts:
          5,
        windowMs:
          EXPORT_WINDOW_MS,
        blockMs:
          EXPORT_BLOCK_MS,
      });

    if (
      !rate.allowed
    ) {
      return NextResponse.json(
        {
          success:
            false,
          code:
            'DATA_EXPORT_RATE_LIMITED',
          error:
            'Too many data exports. Please wait and try again.',
          retryAfterSeconds:
            rate
              .retryAfterSeconds,
        },
        {
          status:
            429,
          headers: {
            'Cache-Control':
              'no-store',
            ...(rate
              .retryAfterSeconds
              ? {
                  'Retry-After':
                    String(
                      rate
                        .retryAfterSeconds,
                    ),
                }
              : {}),
          },
        },
      );
    }

    const data =
      await buildAccountDataExport({
        userId:
          session.user.id,
        currentTenantId:
          session
            .currentTenantId,
      });

    const date =
      new Date()
        .toISOString()
        .slice(
          0,
          10,
        );

    return new NextResponse(
      JSON.stringify(
        data,
        null,
        2,
      ),
      {
        status:
          200,
        headers: {
          'Content-Type':
            'application/json; charset=utf-8',
          'Content-Disposition':
            `attachment; filename="sami-account-data-${date}.json"`,
          'Cache-Control':
            'no-store, no-cache, must-revalidate, private',
          Pragma:
            'no-cache',
          'X-Content-Type-Options':
            'nosniff',
        },
      },
    );
  } catch (
    error
  ) {
    console.error(
      '[SaMi Data Export] Export failed:',
      error,
    );

    return NextResponse.json(
      {
        success:
          false,
        code:
          'DATA_EXPORT_FAILED',
        error:
          'SaMi could not create your data export.',
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
