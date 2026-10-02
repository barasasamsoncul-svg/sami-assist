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
  getFixedAssetsReports,
} from '@/lib/apps/fixed_assets/reports';

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

export async function GET(
  request:
    NextRequest,
) {
  try {
    return respond({
      success:
        true,
      result:
        await getFixedAssetsReports({
          from:
            request.nextUrl
              .searchParams
              .get(
                'from',
              ),
          to:
            request.nextUrl
              .searchParams
              .get(
                'to',
              ),
        }),
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
          : 409,
      );
    }

    const message =
      error instanceof
        Error
        ? error.message
        : 'Fixed Asset report could not be generated.';

    if (
      /date|before/i.test(
        message,
      )
    ) {
      return respond(
        {
          error:
            message,
        },
        400,
      );
    }

    console.error(
      '[Fixed Assets] report failed',
      error,
    );

    return respond(
      {
        error:
          'Fixed Asset reporting could not be generated. Retry or contact your administrator.',
      },
      500,
    );
  }
}
