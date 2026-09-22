import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  WorkspaceDeveloperError,
} from '@/lib/services/workspace-developer';

export function developerWorkspaceJson(
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

export function rejectDeveloperCrossOrigin(
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
    return developerWorkspaceJson(
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
      return developerWorkspaceJson(
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
    return developerWorkspaceJson(
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

export async function readDeveloperJson(
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

export function handleDeveloperWorkspaceError(
  error:
    unknown,
) {
  if (
    error instanceof
      WorkspaceDeveloperError
  ) {
    const status =
      error.code ===
        'UNAUTHENTICATED'
        ? 401
        : error.code ===
              'COMPANY_ACCESS_DENIED' ||
            error.code ===
              'API_VIEW_REQUIRED' ||
            error.code ===
              'API_MANAGE_REQUIRED'
          ? 403
          : error.code ===
              'API_CREDENTIAL_NOT_FOUND'
            ? 404
            : error.code ===
                  'WORKSPACE_CONTEXT_CHANGED' ||
                error.code ===
                  'COMPANY_REQUIRED'
              ? 409
              : 400;

    return developerWorkspaceJson(
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
    '[SaMi Developer] Workspace request failed:',
    error,
  );

  return developerWorkspaceJson(
    {
      success:
        false,
      code:
        'DEVELOPER_REQUEST_FAILED',
      error:
        'SaMi could not complete the developer request.',
    },
    500,
  );
}
