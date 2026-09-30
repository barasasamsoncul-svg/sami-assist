import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  InvoicingError,
  getEtimsWorkspaceData,
  initializeEtimsDevice,
  saveEtimsItemMapping,
  saveEtimsProfile,
  saveEtimsTaxMapping,
  submitCreditNoteToEtims,
  submitInvoiceToEtims,
  syncEtimsReferenceData,
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
                'ETIMS_ENDPOINT_UNAVAILABLE'
              ? 503
              : error.code ===
                  'ETIMS_ALREADY_SUBMITTED'
                ? 409
                : error.code ===
                    'INVOICE_NOT_FOUND' ||
                  error.code ===
                    'CREDIT_NOTE_NOT_FOUND'
                  ? 404
                  : 422;

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
    '[SaMi Invoicing eTIMS] request failed:',
    error,
  );

  return respond(
    {
      success:
        false,
      code:
        'ETIMS_REQUEST_FAILED',
      error:
        'SaMi could not complete the eTIMS request.',
    },
    500,
  );
}


export async function GET() {
  try {
    return respond({
      success:
        true,
      data:
        await getEtimsWorkspaceData(),
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
          'The eTIMS request is too large.',
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
      case 'save_profile':
        result =
          await saveEtimsProfile(
            payload,
          );
        break;

      case 'initialize_device':
        result =
          await initializeEtimsDevice();
        break;

      case 'sync_reference_data':
        result =
          await syncEtimsReferenceData();
        break;

      case 'save_item_mapping':
        result =
          await saveEtimsItemMapping(
            payload,
          );
        break;

      case 'save_tax_mapping':
        result =
          await saveEtimsTaxMapping(
            payload,
          );
        break;

      case 'submit_invoice':
        result =
          await submitInvoiceToEtims(
            payload,
          );
        break;

      case 'submit_credit_note':
        result =
          await submitCreditNoteToEtims(
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
              'Choose a valid eTIMS action.',
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
