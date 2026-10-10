import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  SalesError,
} from '@/lib/apps/sales/context';

import {
  respondToPublicSalesQuote,
} from '@/lib/apps/sales/public';


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
        tenantId: string;
        token: string;
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

    if (!['accept', 'reject', 'request_revision'].includes(String(payload.action || ''))) {
      return json(
        {
          success: false,
          code: 'INVALID_INPUT',
          error: 'Action must be accept, reject, or request_revision.',
        },
        400,
      );
    }

    const action = payload.action as 'accept' | 'reject' | 'request_revision';

    return json({
      success:
        true,
      result:
        await respondToPublicSalesQuote(
          tenantId,
          token,
          {
            action,
            reason:
              payload.reason,
            signerName:
              payload.signerName,
            signerEmail:
              payload.signerEmail,
            signatureConsent:
              payload.signatureConsent,
            requesterName:
              payload.requesterName,
            requesterEmail:
              payload.requesterEmail,
            acceptanceNote:
              payload.acceptanceNote,
            selectedOptionalItemIds:
              payload.selectedOptionalItemIds,
          },
        ),
    });
  } catch (
    error
  ) {
    if (
      error instanceof
        SalesError
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
        error.code ===
          'QUOTE_NOT_FOUND'
          ? 404
          : error.code ===
              'QUOTE_STATE_INVALID'
            ? 409
            : 400,
      );
    }

    console.error(
      '[SaMi Sales Public] response failed:',
      error,
    );

    return json(
      {
        success:
          false,
        error:
          'SaMi could not update this quotation.',
      },
      500,
    );
  }
}
