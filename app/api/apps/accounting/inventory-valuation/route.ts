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
  createInventoryReconciliationRun,
  getAccountingInventoryValuation,
  postInventoryReconciliationAdjustment,
  reverseInventoryReconciliationAdjustment,
  saveInventoryMovementRule,
  saveInventoryProductMapping,
  saveInventoryValuationSettings,
  syncInventoryValuation,
} from '@/lib/apps/accounting/inventory-valuation';

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
      AccountingInputError ||
    error instanceof
      SyntaxError
  ) {
    return respond(
      {
        error:
          error instanceof
            SyntaxError
            ? 'Enter valid inventory valuation data.'
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
        : 409,
    );
  }

  console.error(
    '[Accounting] Inventory valuation action failed',
    error,
  );

  return respond(
    {
      error:
        'The inventory valuation action could not be completed. Retry or contact your administrator.',
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
        await getAccountingInventoryValuation(),
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
            'Inventory valuation request is too large.',
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
        ? await saveInventoryValuationSettings(
            body,
          )
        : body.action ===
            'save-product-mapping'
          ? await saveInventoryProductMapping(
              body,
            )
          : body.action ===
              'save-movement-rule'
            ? await saveInventoryMovementRule(
                body,
              )
            : body.action ===
                'sync'
              ? await syncInventoryValuation()
              : body.action ===
                  'create-reconciliation'
                ? await createInventoryReconciliationRun()
                : body.action ===
                    'post-reconciliation'
                  ? await postInventoryReconciliationAdjustment(
                      body,
                    )
                  : body.action ===
                      'reverse-reconciliation'
                    ? await reverseInventoryReconciliationAdjustment(
                        body,
                      )
                    : (() => {
                        throw new AccountingInputError(
                          'Choose a supported inventory valuation action.',
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
