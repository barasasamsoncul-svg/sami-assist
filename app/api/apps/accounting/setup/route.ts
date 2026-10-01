import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getAccountingSetup,
  saveAccountingSetup,
} from '@/lib/apps/accounting/setup';

import {
  AccountingInputError,
} from '@/lib/apps/accounting/validation';

import {
  EnterpriseModuleError,
} from '@/lib/apps/enterprise/service';

import {
  TenantContextError,
} from '@/lib/auth/tenant-context';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


function respond(
  body:
    object,
  status =
    200,
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        'Cache-Control':
          'no-store',
      },
    },
  );
}


function assertSameOrigin(
  request:
    NextRequest,
) {
  const origin =
    request.headers.get(
      'origin',
    );

  return !(
    request.headers.get(
      'sec-fetch-site',
    ) ===
      'cross-site' ||
    (
      origin &&
      origin !==
        request.nextUrl.origin
    )
  );
}


export async function GET() {
  try {
    return respond({
      setup:
        await getAccountingSetup(),
    });
  } catch (
    error
  ) {
    if (
      error instanceof
        TenantContextError
    ) {
      return respond(
        {
          error:
            error.message,
        },
        error.code ===
          'UNAUTHENTICATED'
          ? 401
          : 403,
      );
    }

    if (
      error instanceof
        EnterpriseModuleError
    ) {
      return respond(
        {
          error:
            error.message,
        },
        error.code ===
          'MODULE_PERMISSION_REQUIRED'
          ? 403
          : error.code ===
              'WORKSPACE_SUSPENDED'
            ? 402
            : 409,
      );
    }

    console.error(
      '[Accounting] Could not load setup',
      error,
    );

    return respond(
      {
        error:
          'Accounting Setup could not be loaded.',
      },
      500,
    );
  }
}


export async function POST(
  request:
    NextRequest,
) {
  if (
    !assertSameOrigin(
      request,
    )
  ) {
    return respond(
      {
        error:
          'This request could not be verified.',
      },
      403,
    );
  }

  try {
    if (
      Number(
        request.headers.get(
          'content-length',
        ) ||
        0,
      ) >
      32768
    ) {
      return respond(
        {
          error:
            'Accounting Setup request is too large.',
        },
        413,
      );
    }

    const text =
      await request.text();

    if (
      new TextEncoder()
        .encode(
          text,
        )
        .length >
      32768
    ) {
      return respond(
        {
          error:
            'Accounting Setup request is too large.',
        },
        413,
      );
    }

    const setup =
      await saveAccountingSetup(
        JSON.parse(
          text,
        ),
      );

    return respond({
      success:
        true,
      setup,
    });
  } catch (
    error
  ) {
    if (
      error instanceof
        AccountingInputError ||
      error instanceof
        SyntaxError
    ) {
      return respond(
        {
          error:
            error instanceof
              SyntaxError
              ? 'Enter valid Accounting settings.'
              : error.message,
        },
        400,
      );
    }

    if (
      error instanceof
        TenantContextError
    ) {
      return respond(
        {
          error:
            error.message,
        },
        error.code ===
          'UNAUTHENTICATED'
          ? 401
          : 403,
      );
    }

    if (
      error instanceof
        EnterpriseModuleError
    ) {
      return respond(
        {
          error:
            error.message,
        },
        error.code ===
          'MODULE_PERMISSION_REQUIRED'
          ? 403
          : error.code ===
              'WORKSPACE_SUSPENDED'
            ? 402
            : 409,
      );
    }

    console.error(
      '[Accounting] Could not save setup',
      error,
    );

    return respond(
      {
        error:
          'Accounting Setup could not be saved. Retry without changing company.',
      },
      500,
    );
  }
}
