import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  InvoicingError,
} from '@/lib/apps/invoicing/context';
import {
  createInvoiceCheckout,
  type InvoiceCheckoutAccess,
} from '@/lib/apps/invoicing/payment-checkout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(
  body: Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate, private',
        Pragma: 'no-cache',
        'Referrer-Policy':
          'no-referrer',
        'X-Content-Type-Options':
          'nosniff',
      },
    },
  );
}

function sameOrigin(
  request: NextRequest,
) {
  const origin =
    request.headers.get('origin');
  if (!origin) return false;
  try {
    return (
      new URL(origin).origin ===
      request.nextUrl.origin
    );
  } catch {
    return false;
  }
}

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      access: string;
      tenantId: string;
      token: string;
      invoiceId: string;
    }>;
  },
) {
  if (!sameOrigin(request)) {
    return json(
      {
        success: false,
        code: 'CROSS_ORIGIN_REQUEST_BLOCKED',
        error:
          'This payment request must start from the SaMi invoice page.',
      },
      403,
    );
  }

  const length =
    Number(
      request.headers.get(
        'content-length',
      ) ||
      0,
    );
  if (
    Number.isFinite(length) &&
    length > 8 * 1024
  ) {
    return json(
      {
        success: false,
        code: 'REQUEST_TOO_LARGE',
        error:
          'Payment request is too large.',
      },
      413,
    );
  }

  try {
    const {
      access,
      tenantId,
      token,
      invoiceId,
    } =
      await params;

    if (
      access !== 'public' &&
      access !== 'portal'
    ) {
      return json(
        {
          success: false,
          code: 'INVALID_CHECKOUT_ACCESS',
          error:
            'Invoice payment link is invalid.',
        },
        404,
      );
    }

    const body =
      await request
        .json()
        .catch(
          () => ({}),
        );

    const payload =
      body &&
      typeof body === 'object' &&
      !Array.isArray(body)
        ? body as
            Record<string, unknown>
        : {};

    const result =
      await createInvoiceCheckout({
        access:
          access as InvoiceCheckoutAccess,
        tenantId,
        token,
        invoiceId,
        provider:
          payload.provider,
        origin:
          request.nextUrl.origin,
      });

    return json(
      {
        success: true,
        result,
      },
      201,
    );
  } catch (error) {
    if (
      error instanceof
        InvoicingError
    ) {
      return json(
        {
          success: false,
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
      '[SaMi Invoicing] Public invoice checkout failed:',
      error,
    );

    return json(
      {
        success: false,
        code: 'CHECKOUT_FAILED',
        error:
          'SaMi could not start this payment. Please try again.',
      },
      500,
    );
  }
}
