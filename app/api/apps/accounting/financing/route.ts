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
  activateFinancingFacility,
  addFinancingRatePeriod,
  createFinancingFacility,
  postFinancingDrawdown,
  postFinancingRepayment,
  reverseFinancingInterestAccrual,
  runFinancingInterestAccrual,
  saveFinancingSettings,
} from '@/lib/apps/accounting/financing';
import {
  cancelFinancingFacility,
  closeFinancingFacility,
  reverseFinancingTransaction,
} from '@/lib/apps/accounting/financing-lifecycle';
import {
  runFinancingCurrentClassification,
} from '@/lib/apps/accounting/financing-classification';
import {
  replaceFinancingCustomSchedule,
} from '@/lib/apps/accounting/financing-custom-schedule';
import {
  getAccountingFinancing,
} from '@/lib/apps/accounting/financing-loader';

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
          'Enter valid loans and financing data.',
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
    '[Accounting] Loans and Financing action failed',
    error,
  );

  return respond(
    {
      error:
        'The loans and financing action could not be completed. Retry or contact your administrator.',
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
        await getAccountingFinancing(),
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
            'Loans and financing request is too large.',
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
        ? await saveFinancingSettings(
            body,
          )
        : body.action ===
            'create-facility'
          ? await createFinancingFacility(
              body,
            )
          : body.action ===
              'activate-facility'
            ? await activateFinancingFacility(
                body,
              )
            : body.action ===
                'add-rate'
              ? await addFinancingRatePeriod(
                  body,
                )
              : body.action ===
                  'post-drawdown'
                ? await postFinancingDrawdown(
                    body,
                  )
                : body.action ===
                    'post-repayment'
                  ? await postFinancingRepayment(
                      body,
                    )
                  : body.action ===
                      'run-interest-accrual'
                    ? await runFinancingInterestAccrual(
                        body,
                      )
                    : body.action ===
                        'reverse-interest-accrual'
                      ? await reverseFinancingInterestAccrual(
                          body,
                        )
                      : body.action ===
                          'reverse-transaction'
                        ? await reverseFinancingTransaction(
                            body,
                          )
                        : body.action ===
                            'classify-current'
                          ? await runFinancingCurrentClassification(
                              body,
                            )
                          : body.action ===
                              'replace-custom-schedule'
                            ? await replaceFinancingCustomSchedule(
                                body,
                              )
                          : body.action ===
                              'close-facility'
                            ? await closeFinancingFacility(
                                body,
                              )
                            : body.action ===
                                'cancel-facility'
                              ? await cancelFinancingFacility(
                                  body,
                                )
                              : (() => {
                                  throw new AccountingInputError(
                                    'Choose a supported loans and financing action.',
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
