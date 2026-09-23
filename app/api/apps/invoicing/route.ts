import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  InvoicingError,
  changeInvoiceStatus,
  createInvoice,
  createInvoicingCatalogItem,
  createInvoicingCustomer,
  createInvoicingPaymentTerm,
  createInvoicingTaxRate,
  createRecurringInvoiceTemplate,
  getInvoicingInvoiceDetail,
  getInvoicingWorkspaceData,
  issueInvoiceCreditNote,
  recordInvoicePayment,
  saveInvoicingTemplate,
  sendInvoiceToCustomer,
  updateInvoiceDraft,
  updateInvoicingSettings,
} from '@/lib/apps/invoicing/service';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

const MAX_BODY_BYTES =
  128 * 1024;

function respond(
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
  const secFetchSite =
    request.headers
      .get(
        'sec-fetch-site',
      )
      ?.trim()
      .toLowerCase();

  if (
    secFetchSite ===
      'cross-site'
  ) {
    return false;
  }

  const origin =
    request.headers.get(
      'origin',
    );

  if (!origin) {
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
    InvoicingError
  ) {
    const status =
      error.code ===
        'INVOICING_PERMISSION_REQUIRED'
        ? 403
        : error.code ===
            'INVOICING_NOT_INSTALLED'
          ? 404
          : error.code ===
              'INVOICING_WORKSPACE_SUSPENDED'
            ? 402
            : error.code ===
                'INVOICE_NOT_FOUND' ||
              error.code ===
                'CUSTOMER_NOT_FOUND'
              ? 404
              : error.code ===
                  'INVOICE_STATE_INVALID' ||
                error.code ===
                  'PAYMENT_EXCEEDS_BALANCE'
                ? 409
                : 400;

    return respond(
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
    '[SaMi Invoicing] request failed:',
    error,
  );

  return respond(
    {
      success:
        false,
      code:
        'INVOICING_REQUEST_FAILED',
      error:
        'SaMi could not complete the Invoicing request.',
    },
    500,
  );
}

export async function GET(
  request:
    NextRequest,
) {
  try {
    const invoiceId =
      request.nextUrl
        .searchParams
        .get(
          'invoiceId',
        );

    if (
      invoiceId
    ) {
      const invoice =
        await getInvoicingInvoiceDetail(
          invoiceId,
        );

      if (
        !invoice
      ) {
        return respond(
          {
            success:
              false,
            code:
              'INVOICE_NOT_FOUND',
            error:
              'Invoice was not found.',
          },
          404,
        );
      }

      return respond({
        success:
          true,
        invoice,
      });
    }

    return respond({
      success:
        true,
      data:
        await getInvoicingWorkspaceData(),
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
    return respond(
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
    return respond(
      {
        success:
          false,
        code:
          'REQUEST_TOO_LARGE',
        error:
          'The Invoicing request is too large.',
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
      return respond(
        {
          success:
            false,
          code:
            'INVALID_REQUEST',
          error:
            'A valid JSON request body is required.',
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

    let result:
      unknown;

    switch (
      action
    ) {
      case 'create_customer':
        result =
          await createInvoicingCustomer(
            payload,
          );
        break;

      case 'create_catalog_item':
        result =
          await createInvoicingCatalogItem(
            payload,
          );
        break;

      case 'create_payment_term':
        result =
          await createInvoicingPaymentTerm(
            payload,
          );
        break;

      case 'create_tax_rate':
        result =
          await createInvoicingTaxRate(
            payload,
          );
        break;

      case 'save_template':
        result =
          await saveInvoicingTemplate(
            payload,
          );
        break;

      case 'create_invoice':
        result =
          await createInvoice(
            payload,
          );
        break;

      case 'update_invoice':
        result =
          await updateInvoiceDraft(
            payload,
          );
        break;

      case 'change_status':
        result =
          await changeInvoiceStatus(
            payload,
          );
        break;

      case 'record_payment':
        result =
          await recordInvoicePayment(
            payload,
          );
        break;

      case 'issue_credit_note':
        result =
          await issueInvoiceCreditNote(
            payload,
          );
        break;

      case 'send_invoice':
        result =
          await sendInvoiceToCustomer(
            payload,
          );
        break;

      case 'create_recurring':
        result =
          await createRecurringInvoiceTemplate(
            payload,
          );
        break;

      case 'update_settings':
        result =
          await updateInvoicingSettings(
            payload,
          );
        break;

      default:
        return respond(
          {
            success:
              false,
            code:
              'INVALID_ACTION',
            error:
              'Choose a valid Invoicing action.',
          },
          400,
        );
    }

    return respond({
      success:
        true,
      result:
        result as
          Record<string, unknown>,
    });
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}
