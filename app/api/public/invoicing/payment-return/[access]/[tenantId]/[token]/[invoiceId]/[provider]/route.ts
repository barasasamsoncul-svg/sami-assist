import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  InvoicingError,
} from '@/lib/apps/invoicing/context';
import {
  handleInvoiceCheckoutReturn,
  type InvoiceCheckoutAccess,
} from '@/lib/apps/invoicing/payment-checkout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeBackPath(input: {
  access: string;
  tenantId: string;
  token: string;
  invoiceId: string;
  provider: string;
  payment: 'failed';
}) {
  const base =
    input.access === 'portal'
      ? (
          '/p/' +
          encodeURIComponent(
            input.tenantId,
          ) +
          '/' +
          encodeURIComponent(
            input.token,
          ) +
          '/invoices/' +
          encodeURIComponent(
            input.invoiceId,
          )
        )
      : (
          '/i/' +
          encodeURIComponent(
            input.tenantId,
          ) +
          '/' +
          encodeURIComponent(
            input.token,
          )
        );

  return (
    base +
    '?payment=' +
    input.payment +
    '&provider=' +
    encodeURIComponent(
      input.provider,
    )
  );
}

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      access: string;
      tenantId: string;
      token: string;
      invoiceId: string;
      provider: string;
    }>;
  },
) {
  const values =
    await params;

  if (
    values.access !== 'public' &&
    values.access !== 'portal'
  ) {
    return NextResponse.json(
      {
        success: false,
        code: 'INVALID_CHECKOUT_ACCESS',
      },
      {
        status: 404,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  try {
    const result =
      await handleInvoiceCheckoutReturn({
        access:
          values.access as
            InvoiceCheckoutAccess,
        tenantId:
          values.tenantId,
        token:
          values.token,
        invoiceId:
          values.invoiceId,
        provider:
          values.provider,
        query:
          request.nextUrl.searchParams,
      });

    return NextResponse.redirect(
      new URL(
        result.redirectPath,
        request.nextUrl.origin,
      ),
      303,
    );
  } catch (error) {
    if (
      error instanceof
        InvoicingError &&
      [
        'PORTAL_NOT_FOUND',
        'INVOICE_NOT_FOUND',
      ].includes(
        error.code,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          code:
            error.code,
          error:
            error.message,
        },
        {
          status: 404,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    console.error(
      '[SaMi Invoicing] Payment return verification failed:',
      error,
    );

    const redirect =
      safeBackPath({
        ...values,
        payment: 'failed',
      });

    return NextResponse.redirect(
      new URL(
        redirect,
        request.nextUrl.origin,
      ),
      303,
    );
  }
}
