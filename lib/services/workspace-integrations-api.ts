import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  WorkspaceIntegrationError,
} from '@/lib/services/workspace-integrations';

export function integrationJson(
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

export function rejectIntegrationCrossOrigin(
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
    return integrationJson(
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
      return integrationJson(
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
  } catch {
    return integrationJson(
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

  return null;
}

export async function readIntegrationJson(
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

export function handleIntegrationApiError(
  error:
    unknown,
) {
  if (
    error instanceof
      WorkspaceIntegrationError
  ) {
    const status =
      error.code ===
        'UNAUTHENTICATED'
        ? 401
        : error.code ===
              'COMPANY_ACCESS_DENIED' ||
            error.code ===
              'INTEGRATIONS_VIEW_REQUIRED' ||
            error.code ===
              'INTEGRATIONS_MANAGE_REQUIRED'
          ? 403
          : error.code ===
              'INTEGRATION_NOT_FOUND'
            ? 404
            : error.code ===
                  'WORKSPACE_CONTEXT_CHANGED' ||
                error.code ===
                  'COMPANY_REQUIRED'
              ? 409
              : error.code ===
                  'INTEGRATION_PROVIDER_UNAVAILABLE'
                ? 503
                : 400;

    return integrationJson(
      {
        success:
          false,
        code:
          error.code,
        error:
          error.message,
      },
      status,
    );
  }

  console.error(
    '[SaMi Integrations] API request failed:',
    error,
  );

  return integrationJson(
    {
      success:
        false,
      code:
        'INTEGRATION_REQUEST_FAILED',
      error:
        'SaMi could not complete the integration request.',
    },
    500,
  );
}
