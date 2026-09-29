import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  InvoicingError,
} from '@/lib/apps/invoicing/context';

import {
  submitCustomerPortalMessage,
} from '@/lib/apps/invoicing/service';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


function json(
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
          'no-store, no-cache, must-revalidate',
        'Referrer-Policy':
          'no-referrer',
        'X-Content-Type-Options':
          'nosniff',
      },
    },
  );
}


export async function POST(
  request:
    NextRequest,
  {
    params,
  }: {
    params:
      Promise<{
        tenantId:
          string;
        token:
          string;
      }>;
  },
) {
  try {
    const {
      tenantId,
      token,
    } =
      await params;

    const body =
      await request
        .json()
        .catch(
          () => ({}),
        );

    const payload =
      body &&
      typeof body ===
        'object' &&
      !Array.isArray(
        body,
      )
        ? body as
            Record<
              string,
              unknown
            >
        : {};

    return json({
      success:
        true,
      result:
        await submitCustomerPortalMessage(
          tenantId,
          token,
          payload,
        ),
    });
  } catch (
    error
  ) {
    if (
      error instanceof
        InvoicingError
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
        [
          'PORTAL_NOT_FOUND',
          'INVOICE_NOT_FOUND',
        ].includes(
          error.code,
        )
          ? 404
          : 400,
      );
    }

    console.error(
      '[SaMi Invoicing] Customer portal action failed:',
      error,
    );

    return json(
      {
        success:
          false,
        error:
          'SaMi could not submit this portal request.',
      },
      500,
    );
  }
}
