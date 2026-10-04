import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  receiveMpesaStkCallback,
} from '@/lib/apps/invoicing/mpesa-stk';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

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
        callbackToken:
          string;
      }>;
  },
) {
  const {
    tenantId,
    callbackToken,
  } =
    await params;

  let result;

  try {
    result =
      await receiveMpesaStkCallback({
        tenantId,
        callbackToken,
        rawBody:
          await request.text(),
      });
  } catch (
    error
  ) {
    console.error(
      '[SaMi Invoicing] M-PESA STK callback failed:',
      error,
    );

    result = {
      status:
        500,
      body: {
        ResultCode:
          1,
        ResultDesc:
          'Processing failed',
      },
    };
  }

  return NextResponse.json(
    result.body,
    {
      status:
        result.status,
      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',
        Pragma:
          'no-cache',
        'X-Content-Type-Options':
          'nosniff',
      },
    },
  );
}
