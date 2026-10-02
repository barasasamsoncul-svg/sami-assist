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
  FixedAssetInputError,
  capitalizeFixedAsset,
  disposeFixedAsset,
  getFixedAssetsAccountingControl,
  linkFixedAssetSource,
  postFixedAssetImpairment,
  postFixedAssetRevaluation,
  reverseFixedAssetCapitalization,
  reverseFixedAssetDepreciation,
  reverseFixedAssetDisposal,
  reverseFixedAssetImpairment,
  reverseFixedAssetRevaluation,
  runFixedAssetDepreciation,
  saveFixedAssetCategoryAccounting,
  saveFixedAssetsAccountingSettings,
} from '@/lib/apps/fixed_assets/accounting-control';

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
      FixedAssetInputError ||
    error instanceof
      SyntaxError
  ) {
    return respond(
      {
        error:
          error instanceof
            SyntaxError
            ? 'Enter valid Fixed Asset data.'
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
    '[Fixed Assets] accounting control action failed',
    error,
  );

  return respond(
    {
      error:
        'The Fixed Asset accounting action could not be completed. Retry or contact your administrator.',
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
        await getFixedAssetsAccountingControl(),
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
            'Fixed Asset request is too large.',
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
        ? await saveFixedAssetsAccountingSettings(
            body,
          )
        : body.action ===
            'save-category'
          ? await saveFixedAssetCategoryAccounting(
              body,
            )
          : body.action ===
              'capitalize'
            ? await capitalizeFixedAsset(
                body,
              )
            : body.action ===
                'run-depreciation'
              ? await runFixedAssetDepreciation(
                  body,
                )
              : body.action ===
                  'reverse-depreciation'
                ? await reverseFixedAssetDepreciation(
                    body,
                  )
              : body.action ===
                  'reverse-capitalization'
                ? await reverseFixedAssetCapitalization(
                    body,
                  )
                : body.action ===
                    'post-impairment'
                  ? await postFixedAssetImpairment(
                      body,
                    )
                  : body.action ===
                      'reverse-impairment'
                    ? await reverseFixedAssetImpairment(
                        body,
                      )
                    : body.action ===
                        'post-revaluation'
                      ? await postFixedAssetRevaluation(
                          body,
                        )
                      : body.action ===
                          'reverse-revaluation'
                        ? await reverseFixedAssetRevaluation(
                            body,
                          )
                        : body.action ===
                            'dispose'
                          ? await disposeFixedAsset(
                              body,
                            )
                          : body.action ===
                              'reverse-disposal'
                            ? await reverseFixedAssetDisposal(
                                body,
                              )
                            : body.action ===
                                'link-source'
                              ? await linkFixedAssetSource(
                                  body,
                                )
                              : (() => {
                                  throw new FixedAssetInputError(
                                    'Choose a supported Fixed Asset accounting action.',
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
