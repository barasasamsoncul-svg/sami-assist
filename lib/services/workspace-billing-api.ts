import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  WorkspaceBillingError,
} from '@/lib/services/workspace-billing';

export function billingJson(
  body:
    Record<
      string,
      unknown
    >,
  status =
    200,
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate, private',
        Pragma:
          'no-cache',
        'X-Content-Type-Options':
          'nosniff',
        'Referrer-Policy':
          'no-referrer',
      },
    },
  );
}

export function rejectBillingCrossOrigin(
  request:
    NextRequest,
) {
  const fetchSite =
    request.headers
      .get(
        'sec-fetch-site',
      )
      ?.trim()
      .toLowerCase();

  if (
    fetchSite ===
      'cross-site'
  ) {
    return billingJson(
      {
        success:
          false,
        code:
          'INVALID_ORIGIN',
        error:
          'This billing request could not be verified.',
      },
      403,
    );
  }

  const origin =
    request.headers
      .get(
        'origin',
      );

  if (
    !origin
  ) {
    return null;
  }

  try {
    if (
      new URL(
        origin,
      ).origin !==
      request.nextUrl
        .origin
    ) {
      return billingJson(
        {
          success:
            false,
          code:
            'INVALID_ORIGIN',
          error:
            'This billing request could not be verified.',
        },
        403,
      );
    }
  } catch {
    return billingJson(
      {
        success:
          false,
        code:
          'INVALID_ORIGIN',
        error:
          'This billing request could not be verified.',
      },
      403,
    );
  }

  return null;
}

export async function readBillingJson(
  request:
    NextRequest,
) {
  try {
    const value:
      unknown =
      await request.json();

    return (
      value &&
      typeof value ===
        'object' &&
      !Array.isArray(
        value,
      )
        ? value
        : {}
    ) as
      Record<
        string,
        unknown
      >;
  } catch {
    return {};
  }
}

export function handleBillingError(
  error:
    unknown,
) {
  if (
    error instanceof
      WorkspaceBillingError
  ) {
    const status =
      error.code ===
        'UNAUTHENTICATED'
        ? 401
        : error.code ===
              'BILLING_VIEW_REQUIRED' ||
            error.code ===
              'BILLING_MANAGE_REQUIRED'
          ? 403
          : error.code ===
              'SUBSCRIPTION_NOT_FOUND'
            ? 404
            : error.code ===
                'WORKSPACE_CONTEXT_CHANGED'
              ? 409
              : error.code ===
                    'PAYMENT_ALREADY_PENDING'
                ? 409
                : error.code ===
                    'PAYMENT_PROVIDER_FAILED'
                  ? 502
                  : 400;

    return billingJson(
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
    '[SaMi Billing] Workspace request failed:',
    error,
  );

  return billingJson(
    {
      success:
        false,
      code:
        'BILLING_REQUEST_FAILED',
      error:
        'SaMi could not complete the billing request.',
    },
    500,
  );
}
