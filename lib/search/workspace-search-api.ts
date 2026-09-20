import {
  NextResponse,
} from 'next/server';

import {
  WorkspaceSearchError,
} from '@/lib/search/workspace-search';

export function searchJson(
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

export function handleSearchApiError(
  error:
    unknown,
) {
  if (
    error instanceof
      WorkspaceSearchError
  ) {
    const status =
      error.code ===
        'UNAUTHENTICATED'
        ? 401
        : error.code ===
            'COMPANY_ACCESS_DENIED'
          ? 403
          : error.code ===
                'WORKSPACE_CONTEXT_CHANGED' ||
              error.code ===
                'COMPANY_REQUIRED'
            ? 409
            : 400;

    return searchJson(
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
    '[SaMi Search] Search request failed:',
    error,
  );

  return searchJson(
    {
      success:
        false,
      code:
        'SEARCH_FAILED',
      error:
        'SaMi could not complete the workspace search.',
    },
    500,
  );
}
