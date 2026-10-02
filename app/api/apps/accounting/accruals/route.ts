import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  EnterpriseModuleError,
} from '@/lib/apps/enterprise/service';
import {
  TenantContextError,
} from '@/lib/auth/tenant-context';
import {
  AccountingInputError,
} from '@/lib/apps/accounting/validation';
import {
  activateAccrualSchedule,
  cancelAccrualSchedule,
  createAccrualSchedule,
  getAccountingAccruals,
  reverseAccrualRecognition,
  runAccrualRecognition,
  saveAccrualSettings,
} from '@/lib/apps/accounting/accruals';

export const runtime =
  'nodejs';
export const dynamic =
  'force-dynamic';

const respond = (
  body:
    object,
  status =
    200,
) =>
  NextResponse.json(
    body,
    {
      status,
      headers: {
        'Cache-Control':
          'no-store',
      },
    },
  );

function failure(
  error:
    unknown,
) {
  if (
    error instanceof
      SyntaxError
  ) {
    return respond(
      {
        error:
          'Enter valid accrual or deferral data.',
      },
      400,
    );
  }

  if (
    error instanceof
      AccountingInputError
  ) {
    return respond(
      {
        error:
          error.message,
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
        : 409,
    );
  }

  console.error(
    '[Accounting] Accruals and deferrals action failed',
    error,
  );

  return respond(
    {
      error:
        'The accrual or deferral action could not be completed. Retry or contact your administrator.',
    },
    500,
  );
}

export async function GET() {
  try {
    return respond({
      success:
        true,
      result:
        await getAccountingAccruals(),
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
  const origin =
    request.headers.get(
      'origin',
    );

  if (
    request.headers.get(
      'sec-fetch-site',
    ) ===
      'cross-site' ||
    (
      origin &&
      origin !==
        request.nextUrl
          .origin
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
    const raw =
      await request.text();

    if (
      new TextEncoder()
        .encode(
          raw,
        ).length >
        128 *
        1024
    ) {
      return respond(
        {
          error:
            'Accrual or deferral request is too large.',
        },
        413,
      );
    }

    const body =
      JSON.parse(
        raw,
      ) as
        Record<
          string,
          unknown
        >;

    const result =
      body.action ===
        'save-settings'
        ? await saveAccrualSettings(
            body,
          )
        : body.action ===
            'create-schedule'
          ? await createAccrualSchedule(
              body,
            )
          : body.action ===
              'activate-schedule'
            ? await activateAccrualSchedule(
                body,
              )
            : body.action ===
                'run-due'
              ? await runAccrualRecognition(
                  body,
                )
              : body.action ===
                  'reverse-recognition'
                ? await reverseAccrualRecognition(
                    body,
                  )
                : body.action ===
                    'cancel-schedule'
                  ? await cancelAccrualSchedule(
                      body,
                    )
                  : (() => {
                      throw new AccountingInputError(
                        'Choose a supported accrual or deferral action.',
                      );
                    })();

    return respond({
      success:
        true,
      result,
    });
  } catch (
    error
  ) {
    return failure(
      error,
    );
  }
}
