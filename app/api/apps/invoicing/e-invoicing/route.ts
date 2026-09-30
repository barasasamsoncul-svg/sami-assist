import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  InvoicingError,
  generateEInvoiceDocument,
  getEInvoiceWorkspaceData,
  markEInvoiceDocumentExported,
  saveEInvoiceParticipant,
  saveEInvoiceProfile,
  submitEInvoiceDocument,
} from '@/lib/apps/invoicing/service';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

const MAX_BODY_BYTES =
  256 * 1024;


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
    request.headers
      .get(
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
                'EINVOICE_PROVIDER_UNAVAILABLE'
              ? 503
              : error.code ===
                  'INVOICE_NOT_FOUND' ||
                error.code ===
                  'CREDIT_NOTE_NOT_FOUND'
                ? 404
                : error.code ===
                    'EINVOICE_SUBMISSION_FAILED'
                  ? 409
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
    '[SaMi Invoicing e-invoicing] request failed:',
    error,
  );

  return respond(
    {
      success:
        false,
      code:
        'EINVOICE_REQUEST_FAILED',
      error:
        'SaMi could not complete the international e-invoicing request.',
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
        await getEInvoiceWorkspaceData(),
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
          'The international e-invoicing request is too large.',
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
          await saveEInvoiceProfile(
            payload,
          );
        break;

      case 'save_participant':
        result =
          await saveEInvoiceParticipant(
            payload,
          );
        break;

      case 'generate_document':
        result =
          await generateEInvoiceDocument(
            payload,
          );
        break;

      case 'submit_document':
        result =
          await submitEInvoiceDocument(
            payload,
          );
        break;

      case 'mark_exported':
        result =
          await markEInvoiceDocumentExported(
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
              'Choose a valid international e-invoicing action.',
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
