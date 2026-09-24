import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  SalesError,
  cancelSalesOrder,
  changeSalesQuoteStatus,
  convertSalesQuoteToInvoice,
  createSalesOrderFromQuote,
  createSalesOrderInvoice,
  createSalesQuote,
  duplicateSalesQuote,
  getSalesOrderDetail,
  getSalesQuoteDetail,
  getSalesWorkspaceData,
  requestSalesQuoteApproval,
  reviewSalesQuoteApproval,
  saveSalesQuoteTemplate,
  sendSalesQuote,
  updateSalesOrderFulfillment,
  updateSalesQuoteDraft,
  updateSalesSettings,
} from '@/lib/apps/sales/service';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

const MAX_BODY_BYTES =
  160 *
  1024;


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
        Pragma:
          'no-cache',
      },
    },
  );
}


function sameOrigin(
  request:
    NextRequest,
) {
  const site =
    request.headers
      .get(
        'sec-fetch-site',
      )
      ?.toLowerCase();

  if (
    site ===
      'cross-site'
  ) {
    return false;
  }

  const origin =
    request.headers.get(
      'origin',
    );

  if (
    !origin
  ) {
    return true;
  }

  try {
    return (
      new URL(
        origin,
      ).origin ===
      request.nextUrl.origin
    );
  } catch {
    return false;
  }
}


function handleError(
  error:
    unknown,
) {
  if (
    error instanceof
    SalesError
  ) {
    const status =
      error.code ===
        'SALES_PERMISSION_REQUIRED'
        ? 403
        : error.code ===
            'SALES_WORKSPACE_SUSPENDED'
          ? 402
          : error.code ===
              'SALES_NOT_INSTALLED' ||
            error.code ===
              'QUOTE_NOT_FOUND' ||
            error.code ===
              'ORDER_NOT_FOUND'
            ? 404
            : error.code ===
                'QUOTE_STATE_INVALID'
              ? 409
              : 400;

    return json(
      {
        success:
          false,
        code:
          error.code,
        error:
          error.message,
        ...error.details,
      },
      status,
    );
  }

  console.error(
    '[SaMi Sales] request failed:',
    error,
  );

  return json(
    {
      success:
        false,
      code:
        'SALES_REQUEST_FAILED',
      error:
        'SaMi could not complete the Sales request.',
    },
    500,
  );
}


export async function GET(
  request:
    NextRequest,
) {
  try {
    const quoteId =
      request.nextUrl
        .searchParams
        .get(
          'quoteId',
        );

    if (
      quoteId
    ) {
      const quote =
        await getSalesQuoteDetail(
          quoteId,
        );

      return quote
        ? json({
            success:
              true,
            quote,
          })
        : json(
            {
              success:
                false,
              error:
                'Quotation was not found.',
            },
            404,
          );
    }

    const orderId =
      request.nextUrl
        .searchParams
        .get(
          'orderId',
        );

    if (
      orderId
    ) {
      const order =
        await getSalesOrderDetail(
          orderId,
        );

      return order
        ? json({
            success:
              true,
            order,
          })
        : json(
            {
              success:
                false,
              error:
                'Sales order was not found.',
            },
            404,
          );
    }

    return json({
      success:
        true,
      data:
        await getSalesWorkspaceData(),
    });
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}


export async function POST(
  request:
    NextRequest,
) {
  if (
    !sameOrigin(
      request,
    )
  ) {
    return json(
      {
        success:
          false,
        code:
          'INVALID_ORIGIN',
        error:
          'This request could not be verified.',
      },
      403,
    );
  }

  const contentLength =
    Number(
      request.headers
        .get(
          'content-length',
        ) ||
      0,
    );

  if (
    Number.isFinite(
      contentLength,
    ) &&
    contentLength >
      MAX_BODY_BYTES
  ) {
    return json(
      {
        success:
          false,
        code:
          'REQUEST_TOO_LARGE',
        error:
          'The Sales request is too large.',
      },
      413,
    );
  }

  try {
    const body =
      await request.json();

    if (
      !body ||
      typeof body !==
        'object' ||
      Array.isArray(
        body,
      )
    ) {
      return json(
        {
          success:
            false,
          code:
            'INVALID_REQUEST',
          error:
            'A valid Sales request is required.',
        },
        400,
      );
    }

    const payload =
      body as
        Record<string, unknown>;

    const action =
      typeof payload.action ===
        'string'
        ? payload.action
            .trim()
            .toLowerCase()
        : '';

    const handlers:
      Record<
        string,
        (
          value:
            Record<
              string,
              unknown
            >,
        ) =>
          Promise<unknown>
      > = {
        create_quote:
          createSalesQuote,
        update_quote:
          updateSalesQuoteDraft,
        duplicate_quote:
          duplicateSalesQuote,
        send_quote:
          sendSalesQuote,
        change_quote_status:
          changeSalesQuoteStatus,
        request_quote_approval:
          requestSalesQuoteApproval,
        review_quote_approval:
          reviewSalesQuoteApproval,
        quote_to_order:
          createSalesOrderFromQuote,
        quote_to_invoice:
          convertSalesQuoteToInvoice,
        update_fulfillment:
          updateSalesOrderFulfillment,
        create_order_invoice:
          createSalesOrderInvoice,
        cancel_order:
          cancelSalesOrder,
        update_settings:
          updateSalesSettings,
        save_template:
          saveSalesQuoteTemplate,
      };

    const handler =
      handlers[
        action
      ];

    if (
      !handler
    ) {
      return json(
        {
          success:
            false,
          code:
            'INVALID_ACTION',
          error:
            'Choose a valid Sales action.',
        },
        400,
      );
    }

    return json({
      success:
        true,
      result:
        await handler(
          payload,
        ) as
          Record<
            string,
            unknown
          >,
    });
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}
