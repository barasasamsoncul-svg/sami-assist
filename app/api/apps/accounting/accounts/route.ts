import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  applyAccountingChartTemplate,
  createAccountingAccount,
  getChartOfAccounts,
  setAccountingAccountActive,
  updateAccountingAccount,
} from '@/lib/apps/accounting/chart-of-accounts';

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


function failure(
  error:
    unknown,
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
            ? 'Enter a valid Chart of Accounts request.'
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
    '[Accounting] Chart of Accounts request failed',
    error,
  );

  return respond(
    {
      error:
        'Chart of Accounts could not complete this request.',
    },
    500,
  );
}


async function requestBody(
  request:
    NextRequest,
) {
  if (
    Number(
      request.headers.get(
        'content-length',
      ) ||
      0,
    ) >
    65536
  ) {
    throw new AccountingInputError(
      'Chart of Accounts request is too large.',
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
    65536
  ) {
    throw new AccountingInputError(
      'Chart of Accounts request is too large.',
    );
  }

  return JSON.parse(
    text,
  );
}


export async function GET() {
  try {
    return respond({
      chart:
        await getChartOfAccounts(),
    });
  } catch (
    error
  ) {
    return failure(
      error,
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
    const body =
      await requestBody(
        request,
      ) as
        Record<
          string,
          unknown
        >;

    const action =
      String(
        body.action ||
        'create',
      );

    if (
      action ===
        'create'
    ) {
      return respond({
        success:
          true,
        account:
          await createAccountingAccount(
            body,
          ),
      });
    }

    if (
      action ===
        'update'
    ) {
      return respond({
        success:
          true,
        account:
          await updateAccountingAccount(
            body,
          ),
      });
    }

    if (
      action ===
        'archive'
    ) {
      return respond({
        success:
          true,
        account:
          await setAccountingAccountActive(
            body,
            false,
          ),
      });
    }

    if (
      action ===
        'restore'
    ) {
      return respond({
        success:
          true,
        account:
          await setAccountingAccountActive(
            body,
            true,
          ),
      });
    }

    if (
      action ===
        'apply-template'
    ) {
      return respond({
        success:
          true,
        result:
          await applyAccountingChartTemplate(
            body,
          ),
      });
    }

    throw new AccountingInputError(
      'Choose a supported Chart of Accounts action.',
    );
  } catch (
    error
  ) {
    return failure(
      error,
    );
  }
}
