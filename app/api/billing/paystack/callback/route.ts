import crypto from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  applyVerifiedCheckoutPayment,
  markVerifiedCheckoutFailed,
} from '@/lib/billing/payment-application';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

function secretKey() {
  const value =
    process.env
      .PAYSTACK_SECRET_KEY
      ?.trim();

  if (
    !value
  ) {
    throw new Error(
      'PAYSTACK_SECRET_KEY is not configured.',
    );
  }

  return value;
}

function billingRedirect(
  request:
    NextRequest,
  status:
    string,
) {
  const url =
    new URL(
      '/settings',
      request.nextUrl
        .origin,
    );

  url.searchParams.set(
    'tab',
    'billing',
  );

  url.searchParams.set(
    'payment',
    status,
  );

  url.searchParams.set(
    'provider',
    'paystack',
  );

  return NextResponse.redirect(
    url,
    303,
  );
}

async function verifyTransaction(
  reference:
    string,
) {
  const response =
    await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        reference,
      )}`,
      {
        method:
          'GET',
        headers: {
          Authorization:
            `Bearer ${secretKey()}`,
          Accept:
            'application/json',
        },
        cache:
          'no-store',
      },
    );

  const body =
    await response.json() as {
      status?:
        boolean;
      message?:
        string;
      data?: {
        reference?:
          string;
        status?:
          string;
        amount?:
          number;
        currency?:
          string;
        gateway_response?:
          string;
        channel?:
          string;
      };
    };

  if (
    !response.ok ||
    body.status !==
      true ||
    !body.data
  ) {
    throw new Error(
      body.message ||
      'Paystack transaction could not be verified.',
    );
  }

  return body.data;
}

function validWebhookSignature(
  rawBody:
    string,
  signature:
    string | null,
) {
  if (
    !signature
  ) {
    return false;
  }

  const expected =
    crypto
      .createHmac(
        'sha512',
        secretKey(),
      )
      .update(
        rawBody,
        'utf8',
      )
      .digest(
        'hex',
      );

  const actualBuffer =
    Buffer.from(
      signature,
      'utf8',
    );

  const expectedBuffer =
    Buffer.from(
      expected,
      'utf8',
    );

  return (
    actualBuffer.length ===
      expectedBuffer.length &&
    crypto.timingSafeEqual(
      actualBuffer,
      expectedBuffer,
    )
  );
}

export async function GET(
  request:
    NextRequest,
) {
  const reference =
    request.nextUrl
      .searchParams
      .get(
        'reference',
      )
      ?.trim() ||
    request.nextUrl
      .searchParams
      .get(
        'trxref',
      )
      ?.trim() ||
    '';

  if (
    !reference
  ) {
    return billingRedirect(
      request,
      'error',
    );
  }

  try {
    const verified =
      await verifyTransaction(
        reference,
      );

    const status =
      (
        verified.status ||
        ''
      )
        .trim()
        .toLowerCase();

    if (
      status ===
        'success'
    ) {
      await applyVerifiedCheckoutPayment({
        provider:
          'paystack',
        providerReference:
          verified.reference ||
          reference,
        amount:
          Number(
            verified.amount ||
            0,
          ) /
          100,
        currency:
          verified.currency ||
          'KES',
        providerData: {
          gatewayResponse:
            verified.gateway_response ||
            null,
          channel:
            verified.channel ||
            null,
          verifiedBy:
            'callback',
        },
      });

      return billingRedirect(
        request,
        'success',
      );
    }

    await markVerifiedCheckoutFailed({
      provider:
        'paystack',
      providerReference:
        verified.reference ||
        reference,
      providerData: {
        status,
        verifiedBy:
          'callback',
      },
    });

    return billingRedirect(
      request,
      'failed',
    );
  } catch (
    error
  ) {
    console.error(
      '[SaMi Billing] Paystack callback verification failed:',
      error,
    );

    return billingRedirect(
      request,
      'error',
    );
  }
}

export async function POST(
  request:
    NextRequest,
) {
  let rawBody:
    string;

  try {
    rawBody =
      await request.text();
  } catch {
    return NextResponse.json(
      {
        success:
          false,
      },
      {
        status:
          400,
      },
    );
  }

  if (
    !validWebhookSignature(
      rawBody,
      request.headers
        .get(
          'x-paystack-signature',
        ),
    )
  ) {
    return NextResponse.json(
      {
        success:
          false,
      },
      {
        status:
          401,
      },
    );
  }

  try {
    const event =
      JSON.parse(
        rawBody,
      ) as {
        event?:
          string;
        data?: {
          reference?:
            string;
          status?:
            string;
          amount?:
            number;
          currency?:
            string;
          gateway_response?:
            string;
          channel?:
            string;
        };
      };

    if (
      event.event ===
        'charge.success' &&
      event.data
        ?.reference
    ) {
      await applyVerifiedCheckoutPayment({
        provider:
          'paystack',
        providerReference:
          event.data
            .reference,
        amount:
          Number(
            event.data
              .amount ||
            0,
          ) /
          100,
        currency:
          event.data
            .currency ||
          'KES',
        providerData: {
          event:
            event.event,
          gatewayResponse:
            event.data
              .gateway_response ||
            null,
          channel:
            event.data
              .channel ||
            null,
          verifiedBy:
            'webhook',
        },
      });
    }

    return NextResponse.json(
      {
        success:
          true,
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
      '[SaMi Billing] Paystack webhook processing failed:',
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
      },
    );
  }
}
